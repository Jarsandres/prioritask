from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_register_and_login():
    # Registro
    resp = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "nombre": "Tester",
        "password": "secret123"
    })
    assert resp.status_code == 201

    # Obtener y comprobar datos de respuesta
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert "id" in data

    # Login
    login = client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "secret123"
    })
    assert login.status_code == 200
    token_data = login.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"

def test_refresh_token():
    # Registro y login para obtener un token
    register_resp = client.post("/api/v1/auth/register", json={
        "email": "refresh_test@example.com",
        "nombre": "RefreshTester",
        "password": "refresh123"
    })
    assert register_resp.status_code == 201

    login_resp = client.post("/api/v1/auth/login", json={
        "email": "refresh_test@example.com",
        "password": "refresh123"
    })
    assert login_resp.status_code == 200

    token = login_resp.json()["access_token"]

    # Usar el token para solicitar un nuevo token
    refresh_resp = client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert refresh_resp.status_code == 200

    new_token = refresh_resp.json()["access_token"]
    assert new_token != token
    assert "token_type" in refresh_resp.json() and refresh_resp.json()["token_type"] == "bearer"

def test_refresh_returns_new_token():
    from uuid import uuid4
    from jose import jwt
    from app.services.auth import SECRET_KEY, ALGORITHM

    email = f"{uuid4()}@example.com"

    # Registro
    register_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "nombre": "Tester", "password": "secret123"},
    )
    assert register_resp.status_code == 201
    user_id = register_resp.json()["id"]

    # Login para obtener token
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secret123"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    # Solicitar refresh
    refresh_resp = client.post(
        "/api/v1/auth/refresh",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["access_token"] != token

    payload = jwt.decode(data["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == user_id
