import os
import asyncio
import pytest_asyncio
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.auth import create_access_token, hash_password
from app.models.user import Usuario
from app.core.config import settings

TEST_DB = "sqlite+aiosqlite:///./prioritask.db"
test_engine = create_async_engine(TEST_DB, echo=False)
async_session = async_sessionmaker(test_engine, expire_on_commit=False)

@pytest_asyncio.fixture(scope="session", autouse=True)
def reset_test_db():
    if os.path.exists("prioritask.db"):
        asyncio.run(test_engine.dispose())
        os.remove("prioritask.db")

    async def init_models():
        async with test_engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

    asyncio.run(init_models())
    yield
    asyncio.run(test_engine.dispose())

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
def auth_headers(session):
    # Crear un usuario de prueba
    user = Usuario(
        id="test-user-id",
        email="test@example.com",
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    session.add(user)
    asyncio.run(session.commit())

    # Generar un token válido usando el JWT_SECRET_KEY de la configuración
    token = create_access_token(sub=user.id, secret=settings.JWT_SECRET_KEY)
    return {"Authorization": f"Bearer {token}"}
