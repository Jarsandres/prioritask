from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException
from jose import jwt

from app.models.enums import UserRole
from app.models.user import Usuario
from app.services.auth import (
    create_access_token,
    get_current_admin_user,
    hash_password,
    require_role,
    verify_password,
)

SECRET = "test-secret"

def test_hash_and_verify_password():
    pwd = "MiClave123!"
    hashed = hash_password(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("otra", hashed) is False

def test_create_access_token_contains_sub_and_exp_defaults():
    sub = "user-id-123"
    token = create_access_token(sub, SECRET, expires_minutes=1)
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    assert payload["sub"] == sub
    assert payload["type"] == "access"
    assert payload["is_superuser"] is False
    assert payload["role"] == "USER"
    exp = datetime.fromtimestamp(payload["exp"], UTC)
    assert exp > datetime.now(UTC)

def test_create_access_token_with_admin_claims():
    sub = str(uuid4())
    token = create_access_token(
        sub,
        SECRET,
        expires_minutes=5,
        is_superuser=True,
        role="ADMIN",
    )
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    assert payload["sub"] == sub
    assert payload["type"] == "access"
    assert payload["is_superuser"] is True
    assert payload["role"] == "ADMIN"

def test_usuario_role_property():
    regular_user = Usuario(
        id=uuid4(),
        email="user@example.com",
        hashed_password="hash",
        is_superuser=False,
    )
    assert regular_user.role == UserRole.USER

    admin_user = Usuario(
        id=uuid4(),
        email="admin@example.com",
        hashed_password="hash",
        is_superuser=True,
    )
    assert admin_user.role == UserRole.ADMIN

@pytest.mark.asyncio
async def test_get_current_admin_user_success():
    admin_user = Usuario(
        id=uuid4(),
        email="admin@example.com",
        hashed_password="hash",
        is_superuser=True,
    )
    result = await get_current_admin_user(current_user=admin_user)
    assert result == admin_user

@pytest.mark.asyncio
async def test_get_current_admin_user_forbidden():
    regular_user = Usuario(
        id=uuid4(),
        email="user@example.com",
        hashed_password="hash",
        is_superuser=False,
    )
    with pytest.raises(HTTPException) as exc_info:
        await get_current_admin_user(current_user=regular_user)
    assert exc_info.value.status_code == 403
    assert "No tiene permisos de administrador" in exc_info.value.detail

@pytest.mark.asyncio
async def test_require_role_dependency():
    admin_user = Usuario(id=uuid4(), email="a@ex.com", hashed_password="h", is_superuser=True)
    regular_user = Usuario(id=uuid4(), email="u@ex.com", hashed_password="h", is_superuser=False)

    admin_checker = require_role("ADMIN")
    user_checker = require_role("USER")

    # Admin passes both
    assert await admin_checker(current_user=admin_user) == admin_user
    assert await user_checker(current_user=admin_user) == admin_user

    # Regular user passes user_checker but fails admin_checker
    assert await user_checker(current_user=regular_user) == regular_user
    with pytest.raises(HTTPException) as exc_info:
        await admin_checker(current_user=regular_user)
    assert exc_info.value.status_code == 403

