import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_register_and_login():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # 1. Registro
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "test@example.com",
            "nombre": "Tester",
            "password": "secret123"
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert "id" in data

        # 2. Login
        login = await ac.post("/api/v1/auth/login", json={
            "email": "test@example.com",
            "password": "secret123"
        })
        assert login.status_code == 200
        token_data = login.json()
        assert "access_token" in token_data
        assert token_data["token_type"] == "bearer"
