from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def register_and_login() -> str:
    email = f"{uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={
        "email": email,
        "nombre": "Tester",
        "password": "secret123"
    })
    resp = client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "secret123"
    })
    return resp.json()["access_token"], email

def test_room_requires_auth():
    r = client.post("/api/v1/rooms", json={"nombre": "Piso Centro"})
    assert r.status_code == 401

def test_room_create_ok():
    token, email = register_and_login()
    r = client.post(
        "/api/v1/rooms",
        json={"nombre": "Piso Centro"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 201
    body = r.json()
    assert body["owner"] == email
    assert body["owner_id"]
    assert body["nombre"] == "Piso Centro"

