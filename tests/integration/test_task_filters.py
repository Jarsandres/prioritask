import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from tests.utils import create_task, create_user_and_token

os.environ["ALLOW_PAST_DUE_DATES"] = "1"

@pytest.mark.asyncio
async def test_get_tasks_pagination(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    for i in range(15):
        await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": f"Tarea {i}",
                "descripcion": "Descripción de prueba",
                "categoria": "OTRO",
                "peso": 1,
                "due_date": "2025-06-10T00:00:00Z"
            },
            headers=headers
        )

    resp1 = await async_client.get(
        "/api/v1/tasks",
        params={"skip": 0, "limit": 10},
        headers=headers
    )
    assert resp1.status_code == 200
    assert len(resp1.json()) == 10

    resp2 = await async_client.get(
        "/api/v1/tasks",
        params={"skip": 10, "limit": 5},
        headers=headers
    )
    assert resp2.status_code == 200
    assert len(resp2.json()) == 5

@pytest.mark.asyncio
async def test_get_tasks_filter_by_room(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    r1_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Casa"}, headers=headers)
    room1_id = r1_resp.json()["id"]

    r2_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Oficina"}, headers=headers)
    room2_id = r2_resp.json()["id"]

    t1 = await create_task(async_client, token, {"titulo": "Task One", "categoria": "OTRO", "room_id": room1_id})
    await create_task(async_client, token, {"titulo": "Task Two", "categoria": "OTRO", "room_id": room2_id})

    resp = await async_client.get("/api/v1/tasks", params={"room_id": room1_id}, headers=headers)
    assert resp.status_code == 200
    tasks = resp.json()
    assert len(tasks) == 1
    assert tasks[0]["id"] == t1["id"]

@pytest.mark.asyncio
async def test_get_tasks_filter_by_search(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    t1 = await create_task(async_client, token, {"titulo": "Lavar platos", "descripcion": "Usar jabon", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Pasear al perro", "descripcion": "Ir al parque", "categoria": "OTRO"})

    resp = await async_client.get("/api/v1/tasks", params={"search": "platos"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1 and data[0]["id"] == t1["id"]

@pytest.mark.asyncio
async def test_history_date_range(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    await create_task(async_client, token, {"titulo": "Tarea", "categoria": "OTRO"})

    future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    resp = await async_client.get("/api/v1/tasks/history", params={"desde": future}, headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []

    start = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    end = (datetime.now(UTC) + timedelta(minutes=1)).isoformat()
    resp = await async_client.get(
        "/api/v1/tasks/history",
        params={"desde": start, "hasta": end},
        headers=headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

@pytest.mark.asyncio
async def test_history_filter_by_room(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    room_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Casa"}, headers=headers)
    room_id = room_resp.json()["id"]
    other_room_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Oficina"}, headers=headers)
    other_room_id = other_room_resp.json()["id"]

    t1 = await create_task(async_client, token, {"titulo": "Uno", "categoria": "OTRO", "room_id": room_id})
    await create_task(async_client, token, {"titulo": "Dos", "categoria": "OTRO", "room_id": other_room_id})

    resp = await async_client.get("/api/v1/tasks/history", params={"room_id": room_id}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["task_id"] == t1["id"]

@pytest.mark.asyncio
async def test_history_filter_by_user(async_client):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    await create_task(async_client, token, {"titulo": "Tarea", "categoria": "OTRO"})

    resp = await async_client.get("/api/v1/tasks/history", params={"user_id": user["id"]}, headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    resp = await async_client.get("/api/v1/tasks/history", params={"user_id": str(uuid4())}, headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []
