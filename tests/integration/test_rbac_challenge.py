from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from jose import jwt

from app.models.enums import UserRole
from app.models.user import Usuario
from app.services.auth import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    create_refresh_token,
    hash_password,
)
from tests.utils import create_user_and_token


@pytest.mark.asyncio
async def test_admin_user_can_list_all_users(async_client, session):
    # 1. Crear Admin en BD
    admin_user = Usuario(
        id=uuid4(),
        email="admin_challenger@example.com",
        nombre="Admin Challenger",
        hashed_password=hash_password("admin_pass"),
        is_active=True,
        is_superuser=True,
    )
    # 2. Crear 2 usuarios normales en BD
    user1 = Usuario(
        id=uuid4(),
        email="standard1@example.com",
        nombre="Standard One",
        hashed_password=hash_password("pass1"),
        is_active=True,
        is_superuser=False,
    )
    user2 = Usuario(
        id=uuid4(),
        email="standard2@example.com",
        nombre="Standard Two",
        hashed_password=hash_password("pass2"),
        is_active=True,
        is_superuser=False,
    )
    session.add_all([admin_user, user1, user2])
    await session.commit()

    token = create_access_token(
        sub=admin_user.id,
        secret=SECRET_KEY,
        is_superuser=True,
        role="ADMIN",
    )
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.get("/api/v1/users", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 3

    # Verificar que los 3 usuarios están presentes y sus campos son correctos
    user_map = {u["email"]: u for u in data}
    assert "admin_challenger@example.com" in user_map
    assert "standard1@example.com" in user_map
    assert "standard2@example.com" in user_map

    admin_data = user_map["admin_challenger@example.com"]
    assert admin_data["is_superuser"] is True
    assert admin_data["role"] == "ADMIN"

    std_data = user_map["standard1@example.com"]
    assert std_data["is_superuser"] is False
    assert std_data["role"] == "USER"


@pytest.mark.asyncio
async def test_standard_user_forbidden_from_listing_users(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.get("/api/v1/users", headers=headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "No tiene permisos de administrador para realizar esta acción."


@pytest.mark.asyncio
async def test_unauthenticated_request_to_users_returns_401(async_client):
    response = await async_client.get("/api/v1/users")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_forged_admin_token_claim_rejected_by_db_state(async_client, session):
    """
    ATAQUE ADVERSARIAL:
    Un atacante crea una cuenta estándar (is_superuser=False).
    Si el atacante o un intermediario adultera el JWT (o firma con claims falsos)
    estableciendo is_superuser=True y role='ADMIN', el servidor NO debe confiar
    en las claims del JWT a ciegas, sino consultar el estado real en la BD.
    Debe responder con HTTP 403 Forbidden.
    """
    std_user = Usuario(
        id=uuid4(),
        email="attacker@example.com",
        nombre="Attacker",
        hashed_password=hash_password("attacker_pass"),
        is_active=True,
        is_superuser=False,  # En BD es usuario estándar
    )
    session.add(std_user)
    await session.commit()

    # Forjar token con claims de admin usando la firma válida
    forged_token = create_access_token(
        sub=std_user.id,
        secret=SECRET_KEY,
        is_superuser=True,
        role="ADMIN",
    )
    headers = {"Authorization": f"Bearer {forged_token}"}

    response = await async_client.get("/api/v1/users", headers=headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "No tiene permisos de administrador para realizar esta acción."


@pytest.mark.asyncio
async def test_inactive_admin_user_rejected_401(async_client, session):
    """
    Un admin desactivado (is_active=False, is_superuser=True) debe ser rechazado
    con 401 Unauthorized por get_current_user.
    """
    inactive_admin = Usuario(
        id=uuid4(),
        email="inactive_admin@example.com",
        nombre="Inactive Admin",
        hashed_password=hash_password("admin_pass"),
        is_active=False,  # Inactivo
        is_superuser=True,
    )
    session.add(inactive_admin)
    await session.commit()

    token = create_access_token(
        sub=inactive_admin.id,
        secret=SECRET_KEY,
        is_superuser=True,
        role="ADMIN",
    )
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.get("/api/v1/users", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales no válidas"

    # Verificar también /auth/me
    me_resp = await async_client.get("/api/v1/auth/me", headers=headers)
    assert me_resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_rejected_401(async_client, session):
    admin_user = Usuario(
        id=uuid4(),
        email="expired_admin@example.com",
        hashed_password=hash_password("admin_pass"),
        is_active=True,
        is_superuser=True,
    )
    session.add(admin_user)
    await session.commit()

    expired_payload = {
        "sub": str(admin_user.id),
        "type": "access",
        "exp": datetime.now(UTC) - timedelta(minutes=15),
        "is_superuser": True,
        "role": "ADMIN",
    }
    expired_token = jwt.encode(expired_payload, SECRET_KEY, algorithm=ALGORITHM)
    headers = {"Authorization": f"Bearer {expired_token}"}

    response = await async_client.get("/api/v1/users", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales no válidas"


@pytest.mark.asyncio
async def test_invalid_token_variants_rejected_401(async_client, session):
    # 1. Refresh token usado como access token
    admin_user = Usuario(
        id=uuid4(),
        email="refresh_as_access@example.com",
        hashed_password=hash_password("admin_pass"),
        is_active=True,
        is_superuser=True,
    )
    session.add(admin_user)
    await session.commit()

    refresh_token = create_refresh_token(sub=admin_user.id, secret=SECRET_KEY)
    resp1 = await async_client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {refresh_token}"},
    )
    assert resp1.status_code == 401

    # 2. Token firmado con secret inválido
    wrong_key_token = create_access_token(
        sub=admin_user.id,
        secret="completely-wrong-secret-key-12345",
        is_superuser=True,
        role="ADMIN",
    )
    resp2 = await async_client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {wrong_key_token}"},
    )
    assert resp2.status_code == 401

    # 3. Token con sub inexistente en BD
    non_existent_id = uuid4()
    ghost_token = create_access_token(
        sub=non_existent_id,
        secret=SECRET_KEY,
        is_superuser=True,
        role="ADMIN",
    )
    resp3 = await async_client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {ghost_token}"},
    )
    assert resp3.status_code == 401

    # 4. Token con sub no parseable como UUID
    malformed_sub_token = jwt.encode(
        {"sub": "not-a-valid-uuid", "type": "access", "exp": datetime.now(UTC) + timedelta(hours=1)},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    resp4 = await async_client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {malformed_sub_token}"},
    )
    assert resp4.status_code == 401


@pytest.mark.asyncio
async def test_register_mass_assignment_privilege_escalation_blocked(async_client, session):
    """
    Intento de escalación de privilegios en el endpoint público /api/v1/auth/register
    enviando 'is_superuser': True o 'role': 'ADMIN'.
    """
    payload = {
        "email": "hacker_reg@example.com",
        "nombre": "Hacker",
        "password": "secret_password",
        "is_superuser": True,
        "role": "ADMIN",
    }
    reg_resp = await async_client.post("/api/v1/auth/register", json=payload)
    assert reg_resp.status_code == 201
    data = reg_resp.json()
    assert data["is_superuser"] is False
    assert data["role"] == "USER"

    # Verificar en BD
    user_id = data["id"]
    db_user = await session.get(Usuario, UUID(user_id))
    assert db_user is not None
    assert db_user.is_superuser is False
    assert db_user.role == UserRole.USER

    # Iniciar sesión y comprobar acceso a /users
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": "hacker_reg@example.com",
        "password": "secret_password"
    })
    token = login_resp.json()["access_token"]
    users_resp = await async_client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert users_resp.status_code == 403


@pytest.mark.asyncio
async def test_auth_me_reflects_accurate_role_and_superuser(async_client, session):
    # Standard user
    std_user, std_token = await create_user_and_token(async_client)
    me_std = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {std_token}"}
    )
    assert me_std.status_code == 200
    std_data = me_std.json()
    assert std_data["is_superuser"] is False
    assert std_data["role"] == "USER"

    # Admin user
    admin_user = Usuario(
        id=uuid4(),
        email="admin_me@example.com",
        nombre="Admin Me",
        hashed_password=hash_password("admin_pass"),
        is_active=True,
        is_superuser=True,
    )
    session.add(admin_user)
    await session.commit()

    admin_token = create_access_token(
        sub=admin_user.id,
        secret=SECRET_KEY,
        is_superuser=True,
        role="ADMIN",
    )
    me_admin = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert me_admin.status_code == 200
    admin_data = me_admin.json()
    assert admin_data["is_superuser"] is True
    assert admin_data["role"] == "ADMIN"


@pytest.mark.asyncio
async def test_login_and_refresh_token_claims_integrity(async_client, session):
    # Crear admin y standard con password conocido
    admin_user = Usuario(
        id=uuid4(),
        email="admin_login@example.com",
        nombre="Admin Login",
        hashed_password=hash_password("known_pass"),
        is_active=True,
        is_superuser=True,
    )
    session.add(admin_user)
    await session.commit()

    # 1. Login Admin
    admin_login = await async_client.post("/api/v1/auth/login", json={
        "email": "admin_login@example.com",
        "password": "known_pass",
    })
    assert admin_login.status_code == 200
    admin_tokens = admin_login.json()
    admin_payload = jwt.decode(admin_tokens["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert admin_payload["is_superuser"] is True
    assert admin_payload["role"] == "ADMIN"

    # 2. Refresh Admin
    admin_refresh = await async_client.post("/api/v1/auth/refresh", json={
        "refresh_token": admin_tokens["refresh_token"]
    })
    assert admin_refresh.status_code == 200
    admin_new_tokens = admin_refresh.json()
    admin_new_payload = jwt.decode(admin_new_tokens["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert admin_new_payload["is_superuser"] is True
    assert admin_new_payload["role"] == "ADMIN"

    # 3. Login Standard
    std_user, std_token = await create_user_and_token(async_client, email="std_login@example.com")
    std_payload = jwt.decode(std_token, SECRET_KEY, algorithms=[ALGORITHM])
    assert std_payload["is_superuser"] is False
    assert std_payload["role"] == "USER"
