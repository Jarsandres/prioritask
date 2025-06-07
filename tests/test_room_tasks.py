import pytest
from httpx import AsyncClient
from uuid import UUID
from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_get_room_tasks(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # crear room
    room_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Casa"}, headers=headers)
    assert room_resp.status_code == 201
    room_id = room_resp.json()["id"]
    rooms_check = await async_client.get("/api/v1/rooms", headers=headers)
    assert any(r["id"] == room_id for r in rooms_check.json())

    # crear tag con mismo nombre
    tag_resp = await async_client.post("/api/v1/tags", json={"nombre": "Casa"}, headers=headers)
    assert tag_resp.status_code == 201
    tag_id = tag_resp.json()["id"]

    # crear tareas
    t1 = await create_task(async_client, token, {"titulo": "Task One", "categoria": "OTRO"})
    t2 = await create_task(async_client, token, {"titulo": "Task Two", "categoria": "OTRO"})

    # asignar tag
    await async_client.post(f"/api/v1/tags/tasks/{t1['id']}/tags", json={"tag_ids": [tag_id]}, headers=headers)
    await async_client.post(f"/api/v1/tags/tasks/{t2['id']}/tags", json={"tag_ids": [tag_id]}, headers=headers)

    resp = await async_client.get(f"/api/v1/rooms/{room_id}/tasks", headers=headers)
    assert resp.status_code == 200
    tasks = resp.json()
    ids = {task['id'] for task in tasks}
    assert {t1['id'], t2['id']} == ids
