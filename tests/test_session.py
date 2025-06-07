import inspect
import pytest
from uuid import uuid4

from app.db.session import get_session, async_session
from app.models.user import Usuario
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import select


@pytest.mark.asyncio
async def test_get_session_returns_async_session():
    generator = get_session()
    assert inspect.isasyncgen(generator)
    session = await anext(generator)
    assert isinstance(session, AsyncSession)
    await generator.aclose()


@pytest.mark.asyncio
async def test_async_session_persists_data():
    async with async_session() as session:
        user = Usuario(email=f"session-test-{uuid4()}@example.com", hashed_password="pw")
        session.add(user)
        await session.commit()
        result = await session.exec(select(Usuario).where(Usuario.email == user.email))
        retrieved = result.scalar_one()
        assert retrieved.id == user.id
