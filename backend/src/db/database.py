from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import create_engine
from .models import Base
from ..config import settings


def get_async_engine():
    return create_async_engine(
        f"sqlite+aiosqlite:///{settings.db_path}",
        echo=False,
        connect_args={"check_same_thread": False},
    )


async_engine = get_async_engine()
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)


async def init_db():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
