import os
import asyncio
import pytest_asyncio
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from httpx import AsyncClient, ASGITransport
from app.main import app

TEST_DB = "sqlite+aiosqlite:///./prioritask.db"
test_engine = create_async_engine(TEST_DB, echo=False)
async_session = async_sessionmaker(test_engine, expire_on_commit=False)

@pytest_asyncio.fixture(scope="session", autouse=True)
def reset_test_db():
    if os.path.exists("prioritask.db"):
        asyncio.get_event_loop().run_until_complete(test_engine.dispose())
        os.remove("prioritask.db")

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

@pytest_asyncio.fixture(scope="function")
async def session():
    async with async_session() as session:
        yield session
        await session.close()

