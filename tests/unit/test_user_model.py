import pytest
import pytest_asyncio
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models import Usuario

TEST_DB = "sqlite+aiosqlite:///:memory:"
engine = create_async_engine(TEST_DB, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)

@pytest_asyncio.fixture
async def session():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    async with async_session() as session:
        yield session

@pytest.mark.asyncio
async def test_create_usuario(session):
    user = Usuario(email="test@ejemplo.com", hashed_password="hashed123")
    session.add(user)
    await session.commit()
    await session.refresh(user)
    assert user.id is not None

@pytest.mark.asyncio
async def test_unique_email_constraint(session):
    u1 = Usuario(email="dup@ejemplo.com", hashed_password="pw1")
    session.add(u1)
    await session.commit()

    u2 = Usuario(email="dup@ejemplo.com", hashed_password="pw2")
    session.add(u2)
    with pytest.raises(Exception):
        await session.commit()



