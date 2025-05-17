from fastapi.testclient import TestClient
from uuid import uuid4

from app.main import app

client = TestClient(app)

def register_and_login():
    email = f"{uuid4()}@test.com"
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

def test_room_persist_ok():
    token, email = register_and_login()
    r = client.post(
        "/api/v1/rooms",
        json={"nombre": "Piso Centro"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 201
    body = r.json()

    assert body["nombre"] == "Piso Centro"
    assert "owner_id" in body

def test_room_unique_constraint():
    token, _ = register_and_login()
    # primera inserción
    r1 = client.post(
        "/api/v1/rooms",
        json={"nombre": "Piso Centro"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert r1.status_code == 201

    # duplicado → 422
    r2 = client.post(
        "/api/v1/rooms",
        json={"nombre": "Piso Centro"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert r2.status_code == 422
