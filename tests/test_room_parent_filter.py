import pytest
from httpx import AsyncClient
from tests.utils import create_user_and_token

@pytest.mark.asyncio
async def test_create_room_with_parent_and_filter(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    parent_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Main"}, headers=headers)
    assert parent_resp.status_code == 201
    parent_id = parent_resp.json()["id"]
    assert parent_resp.json()["parent_id"] is None

    child_resp = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Child", "parent_id": parent_id},
        headers=headers,
    )
    assert child_resp.status_code == 201
    child = child_resp.json()
    assert child["parent_id"] == parent_id

    filtered = await async_client.get(f"/api/v1/rooms?parent_id={parent_id}", headers=headers)
    assert filtered.status_code == 200
    filtered_rooms = filtered.json()
    assert len(filtered_rooms) == 1
    assert filtered_rooms[0]["id"] == child["id"]

    all_rooms = await async_client.get("/api/v1/rooms", headers=headers)
    assert all_rooms.status_code == 200
    assert len(all_rooms.json()) == 2
