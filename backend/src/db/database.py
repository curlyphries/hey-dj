import asyncio
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from .models import Base
from ..config import settings

logger = logging.getLogger(__name__)


def get_async_engine():
    return create_async_engine(
        f"sqlite+aiosqlite:///{settings.db_path}",
        echo=False,
        connect_args={"check_same_thread": False},
    )


async_engine = get_async_engine()
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)


def _run_migrations_sync() -> None:
    """Apply Alembic migrations using the sync engine.

    Called via asyncio.to_thread from init_db so we don't block the loop.
    Existing pre-Alembic databases are detected (tables present, no
    alembic_version row) and stamped to head before further upgrades run.
    """
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, inspect

    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{settings.db_path}")

    sync_engine = create_engine(f"sqlite:///{settings.db_path}")
    try:
        inspector = inspect(sync_engine)
        table_names = set(inspector.get_table_names())
        if "tracks" in table_names and "alembic_version" not in table_names:
            logger.info("Pre-Alembic database detected; stamping to head.")
            command.stamp(cfg, "head")
            return
    finally:
        sync_engine.dispose()

    command.upgrade(cfg, "head")


async def init_db():
    """Bring the database schema up to date.

    Runs Alembic migrations via a worker thread (Alembic uses a sync engine
    internally). Existing databases that predate Alembic are stamped with
    the initial revision the first time this runs.
    """
    await asyncio.to_thread(_run_migrations_sync)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
