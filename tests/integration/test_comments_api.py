import asyncio
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.services.events import event_broadcaster
from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_comments_crud_lifecycle(async_client: AsyncClient):
    # 1. Crear usuario y token
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Crear tarea
    task = await create_task(async_client, token, {"titulo": "Tarea con comentarios", "categoria": "OTRO"})
    task_id = task["id"]

    # 3. GET /tasks/{task_id}/comments debe retornar lista vacía
    res_get_empty = await async_client.get(f"/api/v1/tasks/{task_id}/comments", headers=headers)
    assert res_get_empty.status_code == 200
    assert res_get_empty.json() == []

    # 4. POST /tasks/{task_id}/comments
    res_post = await async_client.post(
        f"/api/v1/tasks/{task_id}/comments",
        json={"contenido": "Primer comentario de prueba"},
        headers=headers,
    )
    assert res_post.status_code == 201
    comment_data = res_post.json()
    assert comment_data["contenido"] == "Primer comentario de prueba"
    assert comment_data["task_id"] == task_id
    assert comment_data["author_name"] is not None
    comment_id = comment_data["id"]

    # 5. GET /tasks/{task_id}/comments debe incluir el nuevo comentario
    res_get = await async_client.get(f"/api/v1/tasks/{task_id}/comments", headers=headers)
    assert res_get.status_code == 200
    comments_list = res_get.json()
    assert len(comments_list) == 1
    assert comments_list[0]["id"] == comment_id
    assert comments_list[0]["contenido"] == "Primer comentario de prueba"

    # 6. PATCH /tasks/{task_id}/comments/{comment_id}
    res_patch = await async_client.patch(
        f"/api/v1/tasks/{task_id}/comments/{comment_id}",
        json={"contenido": "Comentario editado con éxito"},
        headers=headers,
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["contenido"] == "Comentario editado con éxito"

    # 7. DELETE /tasks/{task_id}/comments/{comment_id} (Soft delete)
    res_del = await async_client.delete(f"/api/v1/tasks/{task_id}/comments/{comment_id}", headers=headers)
    assert res_del.status_code == 204

    # 8. GET ya no debe retornar el comentario eliminado
    res_after_del = await async_client.get(f"/api/v1/tasks/{task_id}/comments", headers=headers)
    assert res_after_del.status_code == 200
    assert res_after_del.json() == []

    # 9. DELETE nuevamente debe retornar 404
    res_del_again = await async_client.delete(f"/api/v1/tasks/{task_id}/comments/{comment_id}", headers=headers)
    assert res_del_again.status_code == 404


@pytest.mark.asyncio
async def test_comments_permissions_and_rbac(async_client: AsyncClient):
    # Usuario A: Propietario de la tarea
    _user_a, token_a = await create_user_and_token(async_client)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Usuario B: Miembro colaborador
    _user_b, token_b = await create_user_and_token(async_client)
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Usuario C: Tercero sin relación
    _user_c, token_c = await create_user_and_token(async_client)
    headers_c = {"Authorization": f"Bearer {token_c}"}

    # Crear sala de usuario A
    room_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Sala de A"}, headers=headers_a)
    assert room_resp.status_code == 201
    room_id = room_resp.json()["id"]

    # Agregar Usuario B a la sala
    add_b = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": _user_b["id"], "role": "MEMBER"},
        headers=headers_a,
    )
    assert add_b.status_code == 201

    # Crear tarea en la sala
    task = await create_task(async_client, token_a, {"titulo": "Tarea Compartida", "categoria": "OTRO", "room_id": room_id})
    task_id = task["id"]

    # Usuario C (no miembro) intenta listar o crear comentarios -> 403 Forbidden
    res_c_get = await async_client.get(f"/api/v1/tasks/{task_id}/comments", headers=headers_c)
    assert res_c_get.status_code == 403

    res_c_post = await async_client.post(
        f"/api/v1/tasks/{task_id}/comments",
        json={"contenido": "Intrusión"},
        headers=headers_c,
    )
    assert res_c_post.status_code == 403

    # Usuario B (miembro) crea un comentario
    res_b_post = await async_client.post(
        f"/api/v1/tasks/{task_id}/comments",
        json={"contenido": "Comentario de colaborador B"},
        headers=headers_b,
    )
    assert res_b_post.status_code == 201
    comment_b_id = res_b_post.json()["id"]

    # Usuario C no puede eliminar el comentario de B -> 403
    res_c_del = await async_client.delete(f"/api/v1/tasks/{task_id}/comments/{comment_b_id}", headers=headers_c)
    assert res_c_del.status_code == 403

    # Usuario A (dueño de la tarea) SÍ puede eliminar el comentario de B
    res_a_del = await async_client.delete(f"/api/v1/tasks/{task_id}/comments/{comment_b_id}", headers=headers_a)
    assert res_a_del.status_code == 204


@pytest.mark.asyncio
async def test_comments_sse_broadcast_on_create(async_client: AsyncClient):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    room_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Sala SSE Comentarios"}, headers=headers)
    assert room_resp.status_code == 201
    room_id = room_resp.json()["id"]

    task = await create_task(async_client, token, {"titulo": "Tarea SSE Comentarios", "categoria": "OTRO", "room_id": room_id})
    task_id = task["id"]

    # Suscribirse al broadcaster
    from uuid import UUID
    queue = await event_broadcaster.subscribe(UUID(room_id))

    try:
        # Crear comentario
        post_resp = await async_client.post(
            f"/api/v1/tasks/{task_id}/comments",
            json={"contenido": "Aviso en tiempo real"},
            headers=headers,
        )
        assert post_resp.status_code == 201

        # El broadcaster debe haber emitido COMMENT_ADDED
        msg = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert msg["event"] == "COMMENT_ADDED"
        assert msg["data"]["task_id"] == task_id
        assert msg["data"]["contenido"] == "Aviso en tiempo real"
    finally:
        await event_broadcaster.unsubscribe(UUID(room_id), queue)


@pytest.mark.asyncio
async def test_comments_validation_errors(async_client: AsyncClient):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(async_client, token, {"titulo": "Tarea Validacion", "categoria": "OTRO"})
    task_id = task["id"]

    # Contenido vacío (min_length=1) -> 422
    empty_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/comments",
        json={"contenido": ""},
        headers=headers,
    )
    assert empty_resp.status_code == 422

    # Contenido superior a 2000 chars -> 422
    too_long = "a" * 2001
    long_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/comments",
        json={"contenido": too_long},
        headers=headers,
    )
    assert long_resp.status_code == 422

    # Tarea inexistente -> 404
    non_existent = str(uuid4())
    nf_resp = await async_client.post(
        f"/api/v1/tasks/{non_existent}/comments",
        json={"contenido": "Comentario huérfano"},
        headers=headers,
    )
    assert nf_resp.status_code == 404
