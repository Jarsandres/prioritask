from uuid import uuid4

import pytest

from tests.utils import create_user_and_token


@pytest.mark.asyncio
async def test_get_me_returns_default_empty_preferences(async_client):
    user, token = await create_user_and_token(async_client)
    resp = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == user["id"]
    assert data["preferences"] == {}


@pytest.mark.asyncio
async def test_patch_me_updates_profile_and_merges_preferences(async_client):
    _, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    new_email = f"updated-{uuid4().hex[:8]}@example.com"

    # Primera actualización: nombre, email y preferencias iniciales
    resp1 = await async_client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={
            "nombre": "Nuevo Nombre",
            "email": new_email,
            "preferences": {
                "theme": "dark",
                "density": "compact",
                "notifications": {"sound": True},
            },
        },
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["nombre"] == "Nuevo Nombre"
    assert data1["email"] == new_email
    assert data1["preferences"] == {
        "theme": "dark",
        "density": "compact",
        "notifications": {"sound": True},
    }

    # Segunda actualización: merge superficial de preferences
    resp2 = await async_client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={
            "preferences": {
                "density": "comfortable",
                "default_view": "board",
            },
        },
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["nombre"] == "Nuevo Nombre"
    assert data2["email"] == new_email
    assert data2["preferences"] == {
        "theme": "dark",
        "density": "comfortable",
        "notifications": {"sound": True},
        "default_view": "board",
    }

    # Verificar persistencia en GET /api/v1/auth/me
    me_resp = await async_client.get("/api/v1/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["preferences"] == data2["preferences"]


@pytest.mark.asyncio
async def test_patch_me_duplicate_email_returns_400(async_client):
    user1, _ = await create_user_and_token(async_client)
    _, token2 = await create_user_and_token(async_client)

    resp = await async_client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token2}"},
        json={"email": user1["email"]},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "El email ya está registrado por otro usuario."


@pytest.mark.asyncio
async def test_change_password_flow_and_token_invalidation(async_client):
    user, old_token = await create_user_and_token(async_client)
    old_headers = {"Authorization": f"Bearer {old_token}"}

    # 1. Falla con 400 si current_password es errónea
    bad_resp = await async_client.post(
        "/api/v1/auth/change-password",
        headers=old_headers,
        json={
            "current_password": "wrongPassword123",
            "new_password": "newSecurePassword456",
        },
    )
    assert bad_resp.status_code == 400
    assert bad_resp.json()["detail"] == "La contraseña actual es incorrecta."

    # 2. Funciona con 200 si current_password es correcta ("secret123" en create_user_and_token)
    ok_resp = await async_client.post(
        "/api/v1/auth/change-password",
        headers=old_headers,
        json={
            "current_password": "secret123",
            "new_password": "newSecurePassword456",
        },
    )
    assert ok_resp.status_code == 200
    ok_data = ok_resp.json()
    assert "access_token" in ok_data
    assert ok_data["token_type"] == "bearer"
    new_token = ok_data["access_token"]

    # 3. El token antiguo queda invalidado (401) por incremento de token_version
    old_me = await async_client.get("/api/v1/auth/me", headers=old_headers)
    assert old_me.status_code == 401

    # 4. El nuevo access_token funciona correctamente
    new_me = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert new_me.status_code == 200
    assert new_me.json()["id"] == user["id"]

    # 5. Login con la nueva contraseña funciona
    login_resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": user["email"], "password": "newSecurePassword456"},
    )
    assert login_resp.status_code == 200


@pytest.mark.asyncio
async def test_logout_all_invalidates_previous_tokens(async_client):
    user, token1 = await create_user_and_token(async_client)

    # Emitir una segunda sesión para el mismo usuario
    login2 = await async_client.post(
        "/api/v1/auth/login",
        json={"email": user["email"], "password": "secret123"},
    )
    assert login2.status_code == 200
    token2 = login2.json()["access_token"]

    # Ejecutar logout-all desde la primera sesión
    logout_all_resp = await async_client.post(
        "/api/v1/auth/logout-all",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert logout_all_resp.status_code == 200
    assert logout_all_resp.json()["message"] == "Todas las sesiones activas han sido cerradas"

    # Ambos tokens deben quedar invalidados (401)
    me1 = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert me1.status_code == 401

    me2 = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert me2.status_code == 401
