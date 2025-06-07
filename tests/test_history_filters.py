import pytest
from httpx import AsyncClient
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_history_date_range(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    await create_task(async_client, token, {"titulo": "Tarea", "categoria": "OTRO"})

    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    resp = await async_client.get("/api/v1/tasks/history", params={"desde": future}, headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []

    start = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    end = (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat()
    resp = await async_client.get(
        "/api/v1/tasks/history",
        params={"desde": start, "hasta": end},
        headers=headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

@pytest.mark.asyncio
async def test_history_filter_by_room(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
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
async def test_history_filter_by_user(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    await create_task(async_client, token, {"titulo": "Tarea", "categoria": "OTRO"})

    resp = await async_client.get("/api/v1/tasks/history", params={"user_id": user["id"]}, headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
    for item in resp.json():
        assert item["user_id"] == user["id"]

    resp = await async_client.get("/api/v1/tasks/history", params={"user_id": str(uuid4())}, headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []
