from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine, AsyncSession, async_sessionmaker
from typing import AsyncGenerator
import os

# Cadena de conexión (SQLite por defecto)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./prioritask.db")

# Motor y sesión
engine: AsyncEngine = create_async_engine(DATABASE_URL, echo=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)

# Generador de sesión para FastAPI Depends
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
