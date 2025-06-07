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
    assert body["owner"] == email  # Cambia aquí

def test_room_create_with_parent_id():
    token, _ = register_and_login()

    parent_resp = client.post(
        "/api/v1/rooms",
        json={"nombre": "Casa"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert parent_resp.status_code == 201
    parent_id = parent_resp.json()["id"]

    child_resp = client.post(
        "/api/v1/rooms",
        json={"nombre": "Habitacion", "parent_id": parent_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert child_resp.status_code == 201
    child = child_resp.json()
    assert child["parent_id"] == parent_id

    list_resp = client.get("/api/v1/rooms", headers={"Authorization": f"Bearer {token}"})
    assert list_resp.status_code == 200
    rooms = list_resp.json()
    retrieved_child = next(r for r in rooms if r["id"] == child["id"])
    assert retrieved_child["parent_id"] == parent_id

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


def test_get_rooms_and_update():
    token, email = register_and_login()

    # Sin hogares inicialmente
    resp = client.get("/api/v1/rooms", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == []

    # Crear hogar
    create = client.post(
        "/api/v1/rooms",
        json={"nombre": "Inicial"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert create.status_code == 201
    room_id = create.json()["id"]

    # Listar hogares
    resp = client.get("/api/v1/rooms", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    rooms = resp.json()
    assert len(rooms) == 1
    assert rooms[0]["id"] == room_id

    # Actualizar nombre
    update = client.put(
        f"/api/v1/rooms/{room_id}",
        json={"nombre": "Actualizado"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert update.status_code == 200
    assert update.json()["nombre"] == "Actualizado"

    # Verificar duplicado
    other = client.post(
        "/api/v1/rooms",
        json={"nombre": "Otro"},
        headers={"Authorization": f"Bearer {token}"}
    )
    other_id = other.json()["id"]

    dup = client.put(
        f"/api/v1/rooms/{other_id}",
        json={"nombre": "Actualizado"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert dup.status_code == 422

    # Not found
    invalid = client.put(
        "/api/v1/rooms/00000000-0000-0000-0000-000000000000",
        json={"nombre": "x"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert invalid.status_code == 404
