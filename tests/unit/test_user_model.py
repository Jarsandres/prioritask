import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Usuario


@pytest.mark.asyncio
async def test_create_usuario(session):
    user = Usuario(email="test_model@ejemplo.com", hashed_password="hashed123")
    session.add(user)
    await session.commit()
    await session.refresh(user)
    assert user.id is not None

@pytest.mark.asyncio
async def test_unique_email_constraint(session):
    u1 = Usuario(email="dup_model@ejemplo.com", hashed_password="pw1")
    session.add(u1)
    await session.commit()

    u2 = Usuario(email="dup_model@ejemplo.com", hashed_password="pw2")
    session.add(u2)
    with pytest.raises(IntegrityError):
        await session.commit()
