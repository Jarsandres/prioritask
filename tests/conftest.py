from uuid import uuid4

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from app.core.config import settings
from app.main import app
from app.models.user import Usuario
from app.services.auth import create_access_token, hash_password

TEST_DB = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(
    TEST_DB,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False
)
async_session = async_sessionmaker(test_engine, expire_on_commit=False)

@pytest_asyncio.fixture(scope="session", autouse=True)
async def reset_test_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    await test_engine.dispose()

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

@pytest_asyncio.fixture
async def auth_headers(session):
    unique_email = f"test-{uuid4()}@example.com"
    user = Usuario(
        id=uuid4(),
        email=unique_email,
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    session.add(user)
    await session.commit()

    token = create_access_token(sub=str(user.id), secret=settings.JWT_SECRET_KEY)
    return {"Authorization": f"Bearer {token}"}
