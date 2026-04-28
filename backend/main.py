import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from fastapi.responses import FileResponse

from src.config import settings
from src.db.database import init_db, AsyncSessionLocal
from src.db.models import Track
from src.api.routes import router
from src.api.websocket import hub
from src.dj.orchestrator import orchestrator
from src.library.scanner import scan_library, scan_single
from src.library.watcher import start_watcher, stop_watcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)


async def _file_change_callback(path: str):
    async with AsyncSessionLocal() as db:
        if os.path.exists(path):
            await scan_single(db, path)
        else:
            result = await db.execute(select(Track).where(Track.file_path == path))
            t = result.scalar_one_or_none()
            if t:
                await db.delete(t)
                await db.commit()
    await hub.broadcast({"type": "library_changed", "payload": {"path": path}})


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Hey DJ...")

    # Init DB
    await init_db()

    # Initial library scan
    async with AsyncSessionLocal() as db:
        await scan_library(db)

    # Start file watcher
    loop = asyncio.get_running_loop()
    start_watcher(loop, _file_change_callback)

    # Wire WebSocket broadcast into orchestrator
    orchestrator.set_ws_broadcast(hub.broadcast)

    # Start DJ orchestrator in background
    asyncio.create_task(orchestrator.run())

    logger.info(f"DJ running on http://{settings.host}:{settings.port}")
    yield

    # Shutdown
    stop_watcher()
    try:
        await orchestrator.end_session()
    except Exception as e:
        logger.warning(f"Failed to finalize session record: {e}")
    logger.info("Hey DJ stopped.")


app = FastAPI(title="Hey DJ", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Serve built frontend with SPA fallback (React Router support)
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=False)
