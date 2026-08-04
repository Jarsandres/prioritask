import pytest

from tests.utils import create_user_and_token


@pytest.mark.asyncio
async def test_room_requires_auth(async_client):
    r = await async_client.post("/api/v1/rooms", json={"nombre": "Piso Centro"})
    assert r.status_code == 401

@pytest.mark.asyncio
async def test_room_create_ok(async_client):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    r = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Piso Centro"},
        headers=headers
    )
    assert r.status_code == 201
    body = r.json()
    assert body["owner"] == user["email"]
    assert body["owner_id"]
    assert body["nombre"] == "Piso Centro"

@pytest.mark.asyncio
async def test_room_create_with_parent_id(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    parent_resp = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Casa Principal"},
        headers=headers
    )
    assert parent_resp.status_code == 201
    parent_id = parent_resp.json()["id"]

    child_resp = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Habitacion", "parent_id": parent_id},
        headers=headers
    )
    assert child_resp.status_code == 201
    child = child_resp.json()
    assert child["parent_id"] == parent_id

    list_resp = await async_client.get("/api/v1/rooms", headers=headers)
    assert list_resp.status_code == 200
    rooms = list_resp.json()
    assert any(r["id"] == child["id"] and r["parent_id"] == parent_id for r in rooms)

@pytest.mark.asyncio
async def test_room_unique_constraint(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    r1 = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Piso Centro"},
        headers=headers
    )
    assert r1.status_code == 201

    r2 = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Piso Centro"},
        headers=headers
    )
    assert r2.status_code == 422

@pytest.mark.asyncio
async def test_get_rooms_and_update(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await async_client.get("/api/v1/rooms", headers=headers)
    assert resp.status_code == 200

    create = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Inicial"},
        headers=headers
    )
    assert create.status_code == 201
    room_id = create.json()["id"]

    update = await async_client.put(
        f"/api/v1/rooms/{room_id}",
        json={"nombre": "Actualizado"},
        headers=headers
    )
    assert update.status_code == 200
    assert update.json()["nombre"] == "Actualizado"

@pytest.mark.asyncio
async def test_room_parent_filtering(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    root_resp = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Casa"},
        headers=headers,
    )
    root_id = root_resp.json()["id"]

    child_resp = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Habitacion", "parent_id": root_id},
        headers=headers,
    )
    assert child_resp.status_code == 201

    await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Otro"},
        headers=headers,
    )

    filtered = await async_client.get(
        f"/api/v1/rooms?parent_id={root_id}",
        headers=headers,
    )
    assert filtered.status_code == 200
    rooms = filtered.json()
    assert len(rooms) == 1
    assert rooms[0]["id"] == child_resp.json()["id"]
