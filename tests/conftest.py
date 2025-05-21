import os
import asyncio
import pytest_asyncio
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine
from app.db.session import engine as prod_engine, async_session
from app.models.user import Usuario  # noqa: F401
from app.models.room import Room  # noqa: F401
from httpx import AsyncClient, ASGITransport
from app.main import app

TEST_DB = "sqlite+aiosqlite:///./prioritask.db"

@pytest_asyncio.fixture(scope="session", autouse=True)
def reset_db():
    """
    Elimina la BD SQLite previa y recrea las tablas al iniciar la suite.
    """
    if os.path.exists("prioritask.db"):
        os.remove("prioritask.db")

    test_engine = create_async_engine(TEST_DB, echo=False)
    prod_engine.sync_engine = test_engine.sync_engine
    async_session.configure(bind=test_engine)

    async def init_models():
        async with test_engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

    asyncio.get_event_loop().run_until_complete(init_models())

    yield

    asyncio.get_event_loop().run_until_complete(test_engine.dispose())

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
