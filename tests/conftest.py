import os
import asyncio
import pytest
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine
from app.db.session import engine as prod_engine, async_session
from app.models.user import Usuario # noqa: F401
from app.models.room import Room # noqa: F401

TEST_DB = "sqlite+aiosqlite:///./prioritask.db"

@pytest.fixture(scope="session", autouse=True)
def reset_db():
    """
    Elimina la BD SQLite previa y recrea las tablas al iniciar la suite.
    """
    # 1. Borrar fichero existente
    if os.path.exists("prioritask.db"):
        os.remove("prioritask.db")

    # 2. Crear motor apuntando al mismo fichero
    test_engine = create_async_engine(TEST_DB, echo=False)
    # Sobrescribe el engine global usado en get_session
    prod_engine.sync_engine = test_engine.sync_engine
    async_session.configure(bind=test_engine)

    # 3. Crear tablas
    async def init_models():
        async with test_engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
    asyncio.get_event_loop().run_until_complete(init_models())

    # 4. Yield – todos los tests se ejecutan después de este punto
    yield

    # (Opcional) al final de la suite, cerrar conexiones
    asyncio.get_event_loop().run_until_complete(test_engine.dispose())
