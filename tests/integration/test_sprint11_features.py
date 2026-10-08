import asyncio
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import Usuario
from app.services.events import event_broadcaster
from tests.utils import create_user_and_token


@pytest.mark.asyncio
async def test_auth_logout_and_revocation(async_client: AsyncClient):
    _user_data, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Verify token works for /me
    res_me = await async_client.get("/api/v1/auth/me", headers=headers)
    assert res_me.status_code == 200

    # Call logout
    res_logout = await async_client.post("/api/v1/auth/logout", headers=headers)
    assert res_logout.status_code == 200
    assert "revocado exitosamente" in res_logout.json()["message"]

    # Verify token is rejected now with 401
    res_me_after = await async_client.get("/api/v1/auth/me", headers=headers)
    assert res_me_after.status_code == 401
    assert "Token revocado" in res_me_after.json()["detail"] or "Credenciales no válidas" in res_me_after.json()["detail"]


@pytest.mark.asyncio
async def test_session_version_control(async_client: AsyncClient, session: AsyncSession):
    user_data, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Token works initially
    res1 = await async_client.get("/api/v1/auth/me", headers=headers)
    assert res1.status_code == 200

    # Bump user's token_version in database (simulating password change / session invalidation)
    user = await session.get(Usuario, UUID(str(user_data["id"])))
    assert user is not None
    user.token_version = 2
    session.add(user)
    await session.commit()

    # Now the old token (token_version 1) must be rejected with 401
    res2 = await async_client.get("/api/v1/auth/me", headers=headers)
    assert res2.status_code == 401
    assert "Sesión invalidada" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_strict_pagination_limits(async_client: AsyncClient):
    _user_data, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # /tasks with limit <= 100 should succeed
    res_ok = await async_client.get("/api/v1/tasks?limit=100", headers=headers)
    assert res_ok.status_code == 200

    # /tasks with limit = 101 should return 422 Unprocessable Content
    res_exceed = await async_client.get("/api/v1/tasks?limit=101", headers=headers)
    assert res_exceed.status_code == 422

    # /rooms with limit = 101 should return 422
    res_room_exceed = await async_client.get("/api/v1/rooms?limit=101", headers=headers)
    assert res_room_exceed.status_code == 422


@pytest.mark.asyncio
async def test_member_eviction_broadcasts_sse_event(async_client: AsyncClient):
    _owner, owner_token = await create_user_and_token(async_client)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    member, _member_token = await create_user_and_token(async_client)

    # Create room
    res_room = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": f"CasaEvic_{uuid4().hex[:6]}"},
        headers=owner_headers,
    )
    assert res_room.status_code == 201
    room_id = res_room.json()["id"]
    room_uuid = UUID(str(room_id))

    # Add member
    res_add = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": member["id"], "role": "MEMBER"},
        headers=owner_headers,
    )
    assert res_add.status_code == 201

    # Subscribe to SSE queue to intercept broadcast
    queue = await event_broadcaster.subscribe(room_uuid)

    try:
        # Evict member
        res_del = await async_client.delete(
            f"/api/v1/rooms/{room_id}/members/{member['id']}",
            headers=owner_headers,
        )
        assert res_del.status_code == 204

        # Read SSE event from queue
        event = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert event["event"] == "MEMBER_EVICTED"
        assert event["data"]["user_id"] == str(member["id"])
        assert event["data"]["room_id"] == str(room_id)
    finally:
        await event_broadcaster.unsubscribe(room_uuid, queue)

