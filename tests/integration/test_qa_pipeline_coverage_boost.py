import asyncio
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import CategoriaTarea
from app.models.room import Room
from app.models.task import Task
from app.models.user import Usuario
from app.services.events import DistributedRoomEventBroadcaster, event_broadcaster
from app.services.task_assignment import TaskAssignmentService
from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_comments_additional_branches(async_client: AsyncClient):
    # 1. Crear usuario A (owner) y usuario B (colaborador)
    _user_a, token_a = await create_user_and_token(async_client)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    _user_b, token_b = await create_user_and_token(async_client)
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Crear sala y añadir a B
    room_res = await async_client.post("/api/v1/rooms", json={"nombre": "Sala Comments Boost"}, headers=headers_a)
    assert room_res.status_code == 201
    room_id = room_res.json()["id"]

    await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": _user_b["id"], "role": "MEMBER"},
        headers=headers_a,
    )

    # Crear tarea en la sala
    task = await create_task(
        async_client,
        token_a,
        {"titulo": "Tarea Comentarios Extra", "categoria": "LIMPIEZA", "room_id": room_id},
    )
    task_id = task["id"]

    # Crear comentario de A
    post_a = await async_client.post(
        f"/api/v1/tasks/{task_id}/comments",
        json={"contenido": "Comentario de A"},
        headers=headers_a,
    )
    assert post_a.status_code == 201
    comment_a_id = post_a.json()["id"]

    # B intenta editar comentario de A -> 403 Forbidden
    patch_b = await async_client.patch(
        f"/api/v1/tasks/{task_id}/comments/{comment_a_id}",
        json={"contenido": "Intento de edición no autorizado"},
        headers=headers_b,
    )
    assert patch_b.status_code == 403

    # Editar comentario inexistente -> 404 Not Found
    random_id = str(uuid4())
    patch_nf = await async_client.patch(
        f"/api/v1/tasks/{task_id}/comments/{random_id}",
        json={"contenido": "No existe"},
        headers=headers_a,
    )
    assert patch_nf.status_code == 404

    # Eliminar comentario inexistente -> 404 Not Found
    del_nf = await async_client.delete(
        f"/api/v1/tasks/{task_id}/comments/{random_id}",
        headers=headers_a,
    )
    assert del_nf.status_code == 404

    # Suscripción SSE para verificar emisión de COMMENT_DELETED
    queue = await event_broadcaster.subscribe(UUID(room_id))
    try:
        del_a = await async_client.delete(
            f"/api/v1/tasks/{task_id}/comments/{comment_a_id}",
            headers=headers_a,
        )
        assert del_a.status_code == 204

        # Debe recibir COMMENT_DELETED
        msg = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert msg["event"] == "COMMENT_DELETED"
        assert msg["data"]["comment_id"] == comment_a_id
    finally:
        await event_broadcaster.unsubscribe(UUID(room_id), queue)


@pytest.mark.asyncio
async def test_task_assignment_service_comprehensive(session: AsyncSession):
    # Crear dos usuarios
    user_owner = Usuario(
        email=f"owner_{uuid4().hex[:6]}@test.com",
        nombre="Owner User",
        hashed_password="fakehash123",
    )
    user_worker = Usuario(
        email=f"worker_{uuid4().hex[:6]}@test.com",
        nombre="Worker User",
        hashed_password="fakehash123",
    )
    session.add(user_owner)
    session.add(user_worker)
    await session.commit()
    await session.refresh(user_owner)
    await session.refresh(user_worker)

    # Crear sala
    room = Room(nombre="Sala Asignaciones", owner_id=user_owner.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)

    # Crear tarea
    task = Task(
        titulo="Tarea para Asignaciones Unit",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user_owner.id,
        room_id=room.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # 1. Asignación con tarea inexistente -> ValueError
    with pytest.raises(ValueError, match="Task not found"):
        await TaskAssignmentService.assign_task(
            session,
            task_id=uuid4(),
            user_id=user_worker.id,
            assigned_by=user_owner.id,
        )

    # 2. Asignación por alguien que no es dueño de la tarea -> PermissionError
    with pytest.raises(PermissionError, match="Solo el propietario"):
        await TaskAssignmentService.assign_task(
            session,
            task_id=task.id,
            user_id=user_owner.id,
            assigned_by=user_worker.id,
        )

    # 3. Asignación a usuario inexistente -> ValueError
    with pytest.raises(ValueError, match="User not found"):
        await TaskAssignmentService.assign_task(
            session,
            task_id=task.id,
            user_id=uuid4(),
            assigned_by=user_owner.id,
        )

    # 4. Asignarse la tarea a uno mismo -> ValueError
    with pytest.raises(ValueError, match="Cannot assign a task to yourself"):
        await TaskAssignmentService.assign_task(
            session,
            task_id=task.id,
            user_id=user_owner.id,
            assigned_by=user_owner.id,
        )

    # 5. Asignación exitosa
    assignment = await TaskAssignmentService.assign_task(
        session,
        task_id=task.id,
        user_id=user_worker.id,
        assigned_by=user_owner.id,
    )
    assert assignment.id is not None
    assert assignment.task_id == task.id
    assert assignment.user_id == user_worker.id

    # 6. Duplicado -> ValueError
    with pytest.raises(ValueError, match="Assignment already exists"):
        await TaskAssignmentService.assign_task(
            session,
            task_id=task.id,
            user_id=user_worker.id,
            assigned_by=user_owner.id,
        )

    # 7. Listar asignaciones con y sin filtro de owner
    all_assigned = await TaskAssignmentService.get_assigned_tasks(session, user_worker.id)
    assert len(all_assigned) == 1

    filtered_assigned = await TaskAssignmentService.get_assigned_tasks(
        session, user_worker.id, filter_owner_id=user_owner.id
    )
    assert len(filtered_assigned) == 1

    filtered_empty = await TaskAssignmentService.get_assigned_tasks(
        session, user_worker.id, filter_owner_id=uuid4()
    )
    assert len(filtered_empty) == 0

    # 8. Eliminar asignación
    await TaskAssignmentService.remove_task_assignment(session, task.id, user_worker.id)

    # 9. Eliminar asignación inexistente -> ValueError
    with pytest.raises(ValueError, match="Tarea asignada no encontrada"):
        await TaskAssignmentService.remove_task_assignment(session, task.id, user_worker.id)


@pytest.mark.asyncio
async def test_events_broadcaster_edge_cases():
    # Instancia sin Redis (fallback en memoria)
    broadcaster = DistributedRoomEventBroadcaster(redis_url=None)
    room_id = uuid4()

    # Iniciar y detener ciclo de vida
    await broadcaster.start()
    assert broadcaster._running is False  # sin redis_url no inicia consumer

    # Suscripción
    queue = await broadcaster.subscribe(room_id)

    # Simular saturación de cola (>100 items) para probar la política Drop-Oldest
    for i in range(105):
        await broadcaster.broadcast(room_id, "TEST_EVENT", {"seq": i})

    assert queue.qsize() <= 100
    last_msg = await queue.get()
    assert last_msg["event"] == "TEST_EVENT"

    # Desuscribir
    await broadcaster.unsubscribe(room_id, queue)
    await broadcaster.stop()


@pytest.mark.asyncio
async def test_subtasks_and_tags_api_deep_branches(async_client: AsyncClient):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear tarea
    task = await create_task(async_client, token, {"titulo": "Tarea para Subtasks & Tags", "categoria": "COMPRA"})
    task_id = task["id"]

    # 1. Crear Subtarea
    sub_res = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        json={"titulo": "Subtarea 1", "orden": 0},
        headers=headers,
    )
    assert sub_res.status_code == 201
    sub_id = sub_res.json()["id"]

    # Listar subtareas
    sub_list = await async_client.get(f"/api/v1/tasks/{task_id}/subtasks", headers=headers)
    assert sub_list.status_code == 200
    assert len(sub_list.json()) == 1

    # Toggle / Update subtarea
    patch_sub = await async_client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{sub_id}",
        json={"completada": True, "titulo": "Subtarea 1 Completada"},
        headers=headers,
    )
    assert patch_sub.status_code == 200
    assert patch_sub.json()["completada"] is True

    # 2. Tags
    tag_res = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Urgente", "color": "#ff0000"},
        headers=headers,
    )
    assert tag_res.status_code == 201
    tag_id = tag_res.json()["id"]

    # Listar tags
    tags_list = await async_client.get("/api/v1/tags", headers=headers)
    assert tags_list.status_code == 200
    assert any(t["id"] == tag_id for t in tags_list.json())

    # Asociar tag a la tarea
    assign_tag = await async_client.post(
        f"/api/v1/tags/tasks/{task_id}/tags",
        json={"tag_ids": [tag_id]},
        headers=headers,
    )
    assert assign_tag.status_code == 200

    # Eliminar tag de la tarea
    unassign_tag = await async_client.delete(
        f"/api/v1/tags/tasks/{task_id}/tags/{tag_id}",
        headers=headers,
    )
    assert unassign_tag.status_code == 204

    # Eliminar subtarea
    del_sub = await async_client.delete(f"/api/v1/tasks/{task_id}/subtasks/{sub_id}", headers=headers)
    assert del_sub.status_code == 204
