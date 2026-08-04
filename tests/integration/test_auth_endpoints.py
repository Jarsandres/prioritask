from uuid import uuid4

import pytest
from jose import jwt

from app.services.auth import ALGORITHM, SECRET_KEY
from tests.utils import create_user_and_token


@pytest.mark.asyncio
async def test_register_and_login(async_client):
    email = f"{uuid4()}@example.com"
    resp = await async_client.post("/api/v1/auth/register", json={
        "email": email,
        "nombre": "Tester",
        "password": "secret123"
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == email
    assert "id" in data

    login = await async_client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "secret123"
    })
    assert login.status_code == 200
    token_data = login.json()
    assert "access_token" in token_data
    assert "refresh_token" in token_data
    assert token_data["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_refresh_token(async_client):
    email = f"{uuid4()}@example.com"
    register_resp = await async_client.post("/api/v1/auth/register", json={
        "email": email,
        "nombre": "RefreshTester",
        "password": "refresh123"
    })
    assert register_resp.status_code == 201

    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "refresh123"
    })
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]

    refresh_resp = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 200

    data = refresh_resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_refresh_returns_new_token(async_client):
    email = f"{uuid4()}@example.com"
    register_resp = await async_client.post(
        "/api/v1/auth/register",
        json={"email": email, "nombre": "Tester", "password": "secret123"},
    )
    assert register_resp.status_code == 201
    user_id = register_resp.json()["id"]

    login_resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secret123"},
    )
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]

    refresh_resp = await async_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    payload = jwt.decode(data["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == user_id

@pytest.mark.asyncio
async def test_login_invalid_password(async_client):
    user, _ = await create_user_and_token(async_client)
    response = await async_client.post("/api/v1/auth/login", json={
        "email": user["email"],
        "password": "contraseña-incorrecta"
    })
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_refresh_token_invalid(async_client):
    invalid_token = "token-invalido"
    response = await async_client.post("/api/v1/auth/refresh", json={
        "refresh_token": invalid_token
    })
    assert response.status_code == 401
