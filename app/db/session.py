from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings


def get_engine_kwargs(database_url: str) -> dict[str, Any]:
    """Return engine keyword arguments, applying pool config for PostgreSQL."""
    kwargs: dict[str, Any] = {"echo": False}
    if database_url.startswith("postgresql"):
        kwargs.update(
            {
                "pool_size": settings.DB_POOL_SIZE,
                "max_overflow": settings.DB_MAX_OVERFLOW,
                "pool_recycle": settings.DB_POOL_RECYCLE,
                "pool_pre_ping": settings.DB_POOL_PRE_PING,
            }
        )
    return kwargs


engine = create_async_engine(settings.DATABASE_URL, **get_engine_kwargs(settings.DATABASE_URL))
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
