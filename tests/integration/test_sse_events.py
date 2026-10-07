import asyncio
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from app.services.events import event_broadcaster
from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_sse_endpoint_authentication_and_authorization(async_client: AsyncClient):
    _owner, owner_token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {owner_token}"}

    room_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Sala SSE Auth"}, headers=headers)
    assert room_resp.status_code == 201
    room_id = room_resp.json()["id"]

    # 1. Sin autenticación -> 401
    unauth_resp = await async_client.get(f"/api/v1/rooms/{room_id}/events")
    assert unauth_resp.status_code == 401

    # 2. Token inválido en query param -> 401
    bad_token_resp = await async_client.get(f"/api/v1/rooms/{room_id}/events?token=invalid.jwt.token")
    assert bad_token_resp.status_code == 401

    # 3. Usuario ajeno (no miembro) -> 403
    _other_user, other_token = await create_user_and_token(async_client)
    forbidden_resp = await async_client.get(
        f"/api/v1/rooms/{room_id}/events",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert forbidden_resp.status_code == 403

    # 4. Sala inexistente -> 404
    non_existent_room = str(uuid4())
    nf_resp = await async_client.get(
        f"/api/v1/rooms/{non_existent_room}/events",
        headers=headers,
    )
    assert nf_resp.status_code == 404


@pytest.mark.asyncio
async def test_sse_endpoint_stream_reception(async_client: AsyncClient):
    async def _run():
        _owner, owner_token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {owner_token}"}

        room_resp = await async_client.post(
            "/api/v1/rooms", json={"nombre": "Sala SSE Stream"}, headers=headers
        )
        assert room_resp.status_code == 201
        room_id = room_resp.json()["id"]

        # Verificar conexión con query param ?token= (estilo EventSource de navegadores)
        async with async_client.stream(
            "GET", f"/api/v1/rooms/{room_id}/events?token={owner_token}"
        ) as response:
            assert response.status_code == 200
            assert "text/event-stream" in response.headers.get("content-type", "")

            # Leer el primer chunk (debe ser el evento inicial 'ping')
            lines = []
            async for line in response.aiter_lines():
                if line:
                    lines.append(line)
                if len(lines) >= 2:
                    # Enviar evento de cierre para finalizar el generador SSE limpiamente
                    await event_broadcaster.broadcast(UUID(room_id), "close", {})
                    break

            assert len(lines) >= 2
            assert "event: ping" in lines[0] or "event: ping" in lines[1]

    await asyncio.wait_for(_run(), timeout=5.0)


@pytest.mark.asyncio
async def test_sse_lifecycle_events_broadcasting(async_client: AsyncClient):
    _owner, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    room_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Sala Ciclo SSE"}, headers=headers)
    assert room_resp.status_code == 201
    room_id = room_resp.json()["id"]
    room_uuid = UUID(room_id)

    # Suscribirse al broadcaster
    queue = await event_broadcaster.subscribe(room_uuid)
    assert event_broadcaster.count_subscribers(room_uuid) >= 1

    try:
        # 1. TASK_CREATED
        task = await create_task(
            async_client,
            token,
            {"titulo": "Tarea SSE Ciclo", "categoria": "OTRO", "room_id": room_id},
        )
        task_id = task["id"]

        event1 = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert event1["event"] == "TASK_CREATED"
        assert event1["data"]["id"] == task_id

        # 2. TASK_UPDATED (vía PATCH)
        patch_resp = await async_client.patch(
            f"/api/v1/tasks/{task_id}",
            json={"titulo": "Tarea SSE Modificada"},
            headers=headers,
        )
        assert patch_resp.status_code == 200

        event2 = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert event2["event"] == "TASK_UPDATED"
        assert event2["data"]["titulo"] == "Tarea SSE Modificada"

        # 3. SUBTASK_TOGGLED
        subtask_resp = await async_client.post(
            f"/api/v1/tasks/{task_id}/subtasks",
            json={"titulo": "Subtarea 1", "orden": 0},
            headers=headers,
        )
        assert subtask_resp.status_code == 201
        subtask_id = subtask_resp.json()["id"]

        # Alternar subtarea completada
        toggle_resp = await async_client.patch(
            f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
            json={"completada": True},
            headers=headers,
        )
        assert toggle_resp.status_code == 200

        event3 = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert event3["event"] == "SUBTASK_TOGGLED"
        assert event3["data"]["subtask_id"] == subtask_id
        assert event3["data"]["completada"] is True

        # 4. COMMENT_ADDED
        comment_resp = await async_client.post(
            f"/api/v1/tasks/{task_id}/comments",
            json={"contenido": "Comentario SSE"},
            headers=headers,
        )
        assert comment_resp.status_code == 201

        event4 = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert event4["event"] == "COMMENT_ADDED"
        assert event4["data"]["task_id"] == task_id
        assert event4["data"]["contenido"] == "Comentario SSE"

        # 5. TASK_DELETED
        del_resp = await async_client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
        assert del_resp.status_code == 204

        event5 = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert event5["event"] == "TASK_DELETED"
        assert event5["data"]["task_id"] == task_id

    finally:
        await event_broadcaster.unsubscribe(room_uuid, queue)
        assert event_broadcaster.count_subscribers(room_uuid) == 0
