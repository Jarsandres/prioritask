import os
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.comment import TaskComment
from app.models.enums import CategoriaTarea, EstadoTarea, RoomMemberRole, TaskAction
from app.models.gamification import HouseholdReward
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.subtask import Subtask
from app.models.task import Task, TaskHistory
from app.models.user import Usuario
from app.schemas.task import TaskCreate, TaskRead
from app.services.gamification import award_task_points, redeem_reward
from app.services.search import SearchEngineService


# ============================================================================
# 1. Tests de Arquitectura: TaskRead Due Date & TaskCreate Validation
# ============================================================================
def test_task_read_serializes_expired_due_date_without_env_override():
    """TaskRead debe permitir serializar tareas con fecha vencida sin lanzar 500/ValueError."""
    env_backup = os.environ.pop("ALLOW_PAST_DUE_DATES", None)
    try:
        past_date = datetime.now(UTC) - timedelta(days=10)
        task = Task(
            id=uuid4(),
            user_id=uuid4(),
            room_id=None,
            titulo="Tarea caducada histórica",
            descripcion="Debe poder leerse",
            categoria=CategoriaTarea.OTRO,
            estado=EstadoTarea.TODO,
            peso=1.0,
            due_date=past_date,
            created_at=datetime.now(UTC) - timedelta(days=12),
        )

        read_dto = TaskRead.model_validate(task)
        assert read_dto.id == task.id
        assert read_dto.due_date == past_date
    finally:
        if env_backup is not None:
            os.environ["ALLOW_PAST_DUE_DATES"] = env_backup


def test_task_create_validates_past_due_date_when_env_not_allowed():
    """TaskCreate debe rechazar fechas límite en el pasado si no está permitido."""
    env_backup = os.environ.pop("ALLOW_PAST_DUE_DATES", None)
    try:
        past_date = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        with pytest.raises(ValueError, match="La fecha límite no puede ser anterior"):
            TaskCreate(
                titulo="Tarea inválida",
                categoria=CategoriaTarea.OTRO,
                due_date=past_date,
            )
    finally:
        if env_backup is not None:
            os.environ["ALLOW_PAST_DUE_DATES"] = env_backup


# ============================================================================
# 2. Atomicidad de Subtareas (Un solo commit atómico)
# ============================================================================
@pytest.mark.asyncio
async def test_subtask_creation_is_atomic(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    """Verifica que la creación de subtarea y el historial se registran juntos."""
    task = Task(
        titulo="Tarea Principal Atómica",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    resp = await async_client.post(
        f"/api/v1/tasks/{task.id}/subtasks",
        headers=user_a_headers,
        json={"titulo": "Subtarea atómica 1", "orden": 1},
    )
    assert resp.status_code == 201
    sub_data = resp.json()
    sub_id = UUID(sub_data["id"])

    # Ambos registros deben persistir
    subtask = await session.get(Subtask, sub_id)
    assert subtask is not None
    assert subtask.titulo == "Subtarea atómica 1"

    hist_res = await session.exec(
        select(TaskHistory).where(
            TaskHistory.task_id == task.id,
            TaskHistory.action == TaskAction.SUBTASK_CREATED,
        )
    )
    history = hist_res.first()
    assert history is not None
    assert str(sub_id) in history.changes


@pytest.mark.asyncio
async def test_subtask_endpoints_error_branches(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    user_b_headers: dict[str, str],
    user_c_headers: dict[str, str],
    session: AsyncSession,
    user_a: Usuario,
    room_owner_a: Room,
):
    """Cubre ramas de error 404/403 en subtasks.py."""
    non_existent = str(uuid4())

    # GET /tasks/{task_id}/subtasks -> 404
    r1 = await async_client.get(f"/api/v1/tasks/{non_existent}/subtasks", headers=user_a_headers)
    assert r1.status_code == 404

    # POST /tasks/{task_id}/subtasks -> 404
    r2 = await async_client.post(
        f"/api/v1/tasks/{non_existent}/subtasks",
        headers=user_a_headers,
        json={"titulo": "Subtarea", "orden": 0},
    )
    assert r2.status_code == 404

    # Crear tarea real
    task = Task(
        titulo="Tarea Subtareas Error",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # Subtarea inexistente en PATCH -> 404
    r3 = await async_client.patch(
        f"/api/v1/tasks/{task.id}/subtasks/{non_existent}",
        headers=user_a_headers,
        json={"titulo": "Subtarea inexistente"},
    )
    assert r3.status_code == 404

    # Subtarea inexistente en DELETE -> 404
    r4 = await async_client.delete(
        f"/api/v1/tasks/{task.id}/subtasks/{non_existent}",
        headers=user_a_headers,
    )
    assert r4.status_code == 404

    # Crear subtarea real
    sub = Subtask(task_id=task.id, titulo="Subtarea Base", orden=0)
    session.add(sub)
    await session.commit()
    await session.refresh(sub)

    # PATCH cambiando solo el título (rama else TaskAction.UPDATED)
    r5 = await async_client.patch(
        f"/api/v1/tasks/{task.id}/subtasks/{sub.id}",
        headers=user_a_headers,
        json={"titulo": "Subtarea Renombrada"},
    )
    assert r5.status_code == 200
    assert r5.json()["titulo"] == "Subtarea Renombrada"

    # Usuario C (ajeno sin acceso) intentando modificar subtarea -> 403
    r6 = await async_client.patch(
        f"/api/v1/tasks/{task.id}/subtasks/{sub.id}",
        headers=user_c_headers,
        json={"completada": True},
    )
    assert r6.status_code == 403


# ============================================================================
# 3. Compensación Física en Almacenamiento (attachments.py)
# ============================================================================
@pytest.mark.asyncio
async def test_attachment_physical_compensation_on_commit_failure(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    """Verifica que si session.commit falla, el archivo físico se elimina como compensación."""
    task = Task(
        titulo="Tarea Compensación",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 30
    files = {"file": ("test_doc.png", png_bytes, "image/png")}

    # Parchear AsyncSession.commit para simular fallo de BD
    with (
        patch("sqlmodel.ext.asyncio.session.AsyncSession.commit", side_effect=RuntimeError("DB Commit failed")),
        patch("app.services.storage.LocalStorageAdapter.delete_file", new_callable=AsyncMock) as mock_delete,
        pytest.raises(RuntimeError, match="DB Commit failed"),
    ):
        await async_client.post(
            f"/api/v1/tasks/{task.id}/attachments",
            files=files,
            headers=user_a_headers,
        )
    # Debe haberse invocado la compensación delete_file
    assert mock_delete.called


@pytest.mark.asyncio
async def test_attachment_endpoints_error_branches(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    user_c_headers: dict[str, str],
    room_owner_a: Room,
):
    """Cubre ramas de error 404/403/400 en attachments.py."""
    non_existent = str(uuid4())

    # Listar adjuntos de tarea inexistente -> 404
    r1 = await async_client.get(f"/api/v1/tasks/{non_existent}/attachments", headers=user_a_headers)
    assert r1.status_code == 404

    # Subir adjunto a tarea inexistente -> 404
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 30
    files = {"file": ("test.png", png_bytes, "image/png")}
    r2 = await async_client.post(f"/api/v1/tasks/{non_existent}/attachments", files=files, headers=user_a_headers)
    assert r2.status_code == 404

    task = Task(
        titulo="Tarea Adjuntos Error",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # Descargar adjunto inexistente -> 404
    r3 = await async_client.get(f"/api/v1/tasks/{task.id}/attachments/{non_existent}/download", headers=user_a_headers)
    assert r3.status_code == 404

    # Eliminar adjunto inexistente -> 404
    r4 = await async_client.delete(f"/api/v1/tasks/{task.id}/attachments/{non_existent}", headers=user_a_headers)
    assert r4.status_code == 404


# ============================================================================
# 4. Candado Distribuido en Gamificación (409 Conflict)
# ============================================================================
@pytest.mark.asyncio
async def test_gamification_distributed_lock_contention_raises_409(
    session: AsyncSession,
    user_a: Usuario,
    room_owner_a: Room,
):
    """award_task_points y redeem_reward deben lanzar 409 si el lock distribuido no se adquiere."""
    task = Task(
        titulo="Tarea Gamificación Lock",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)

    reward = HouseholdReward(
        room_id=room_owner_a.id,
        title="Premio Café",
        cost_points=50,
        is_active=True,
    )
    session.add(reward)
    await session.commit()
    await session.refresh(task)
    await session.refresh(reward)

    # Simular context manager donde acquired = False
    class ContendedLockContext:
        async def __aenter__(self):
            return False

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return False

    with patch("app.services.gamification.distributed_lock", return_value=ContendedLockContext()):
        # award_task_points -> 409
        with pytest.raises(HTTPException) as exc_info1:
            await award_task_points(task, user_a, session)
        assert exc_info1.value.status_code == 409
        assert "concurrente" in exc_info1.value.detail.lower()

        # redeem_reward -> 409
        with pytest.raises(HTTPException) as exc_info2:
            await redeem_reward(room_owner_a.id, reward.id, user_a, session)
        assert exc_info2.value.status_code == 409
        assert "concurrente" in exc_info2.value.detail.lower()


# ============================================================================
# 5. Sanitización de Wildcards SQL y Emojis en Búsqueda (search.py)
# ============================================================================
@pytest.mark.asyncio
async def test_search_engine_escapes_sql_wildcards_and_supports_emojis(
    session: AsyncSession,
    user_a: Usuario,
    room_owner_a: Room,
):
    """Verifica que '_' y '%' se buscan literalmente y que los emojis no son descartados."""
    t1 = Task(
        titulo="Revisar modulo_auth",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    t2 = Task(
        titulo="Revisar moduloXauth",  # Coincidiría con '_' si no estuviera escapado
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    t3 = Task(
        titulo="Lanzamiento 🚀 final",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    t4 = Task(
        titulo="Progreso al 100% de la meta",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add_all([t1, t2, t3, t4])
    await session.commit()

    # 1. Búsqueda con guion bajo: solo debe coincidir t1, NO t2
    res_underscore = await SearchEngineService.search(
        query="modulo_auth",
        current_user=user_a,
        session=session,
        room_id=room_owner_a.id,
    )
    matched_ids = [item.task.id for item in res_underscore.results]
    assert t1.id in matched_ids
    assert t2.id not in matched_ids

    # 2. Búsqueda con emoji 🚀: no debe descartarse por regex
    res_emoji = await SearchEngineService.search(
        query="🚀",
        current_user=user_a,
        session=session,
        room_id=room_owner_a.id,
    )
    assert res_emoji.total_matches >= 1
    assert any(item.task.id == t3.id for item in res_emoji.results)

    # 3. Búsqueda con porcentaje %
    res_percent = await SearchEngineService.search(
        query="100%",
        current_user=user_a,
        session=session,
        room_id=room_owner_a.id,
    )
    assert res_percent.total_matches >= 1
    assert any(item.task.id == t4.id for item in res_percent.results)


# ============================================================================
# 6. Cobertura de Ramas de Error en Comentarios (comments.py)
# ============================================================================
@pytest.mark.asyncio
async def test_comments_endpoints_extended_branches(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    user_b: Usuario,
    user_b_headers: dict[str, str],
    user_c_headers: dict[str, str],
    room_owner_a: Room,
):
    """Cubre ramas de permisos y errores en comments.py."""
    non_existent = str(uuid4())

    # GET y POST en tarea inexistente -> 404
    assert (await async_client.get(f"/api/v1/tasks/{non_existent}/comments", headers=user_a_headers)).status_code == 404
    assert (await async_client.post(
        f"/api/v1/tasks/{non_existent}/comments",
        headers=user_a_headers,
        json={"contenido": "Hola"},
    )).status_code == 404

    # Crear tarea y comentario de user_a
    task = Task(
        titulo="Tarea Comentarios",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    com = TaskComment(task_id=task.id, user_id=user_a.id, contenido="Comentario de A")
    session.add(com)
    await session.commit()
    await session.refresh(com)

    # PATCH comentario inexistente -> 404
    assert (await async_client.patch(
        f"/api/v1/tasks/{task.id}/comments/{non_existent}",
        headers=user_a_headers,
        json={"contenido": "Nuevo texto"},
    )).status_code == 404

    # DELETE comentario inexistente -> 404
    assert (await async_client.delete(
        f"/api/v1/tasks/{task.id}/comments/{non_existent}",
        headers=user_a_headers,
    )).status_code == 404

    # DELETE por usuario no autorizado (ni autor ni dueño) -> 403
    assert (await async_client.delete(
        f"/api/v1/tasks/{task.id}/comments/{com.id}",
        headers=user_c_headers,
    )).status_code == 403


# ============================================================================
# 7. Cobertura de Ramas de Error en Hogares (rooms.py)
# ============================================================================
@pytest.mark.asyncio
async def test_rooms_endpoints_extended_branches(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    user_c_headers: dict[str, str],
    room_owner_a: Room,
):
    """Cubre ramas de error en rooms.py."""
    non_existent = str(uuid4())

    # POST sala con parent_id inexistente -> 404
    r_bad_parent = await async_client.post(
        "/api/v1/rooms",
        headers=user_a_headers,
        json={"nombre": "Subsala Fantasma", "parent_id": non_existent},
    )
    assert r_bad_parent.status_code == 404

    # GET salas con filtro de parent_id
    r_filter = await async_client.get(
        "/api/v1/rooms",
        headers=user_a_headers,
        params={"parent_id": str(room_owner_a.id)},
    )
    assert r_filter.status_code == 200
    assert isinstance(r_filter.json(), list)

    # PUT sala inexistente -> 404
    r_put_nf = await async_client.put(
        f"/api/v1/rooms/{non_existent}",
        headers=user_a_headers,
        json={"nombre": "Nuevo Nombre"},
    )
    assert r_put_nf.status_code == 404

    # DELETE sala inexistente -> 404
    r_del_nf = await async_client.delete(
        f"/api/v1/rooms/{non_existent}",
        headers=user_a_headers,
    )
    assert r_del_nf.status_code == 404

    # DELETE sala por usuario ajeno -> 404 (oculta existencia para no dueños)
    r_del_forbidden = await async_client.delete(
        f"/api/v1/rooms/{room_owner_a.id}",
        headers=user_c_headers,
    )
    assert r_del_forbidden.status_code == 404


# ============================================================================
# 8. Elevación de Cobertura: Ciclo Completo y Ramas de Controladores
# ============================================================================
@pytest.mark.asyncio
async def test_attachments_controller_deep_branches(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    user_b_headers: dict[str, str],
    room_owner_a: Room,
):
    """Cubre subida válida, descarga, validación binaria y soft-delete de adjuntos."""
    task = Task(
        titulo="Tarea Controladores Adjuntos",
        categoria=CategoriaTarea.MANTENIMIENTO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # 1. Subida con tipo binario inválido (.exe o bytes corruptos) -> 400
    bad_bytes = b"MZ\x90\x00\x03\x00\x00\x00"
    bad_file = {"file": ("malware.exe", bad_bytes, "application/x-dosexec")}
    r_bad = await async_client.post(
        f"/api/v1/tasks/{task.id}/attachments",
        files=bad_file,
        headers=user_a_headers,
    )
    assert r_bad.status_code == 415

    # 2. Subida exitosa de PNG
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 30
    good_file = {"file": ("reporte.png", png_bytes, "image/png")}
    r_good = await async_client.post(
        f"/api/v1/tasks/{task.id}/attachments",
        files=good_file,
        data={"caption": "Captura del reporte"},
        headers=user_a_headers,
    )
    assert r_good.status_code == 201
    att_info = r_good.json()
    att_id = att_info["id"]
    assert att_info["filename"] == "reporte.png"

    # 3. Listar adjuntos de la tarea
    r_list = await async_client.get(
        f"/api/v1/tasks/{task.id}/attachments",
        headers=user_a_headers,
    )
    assert r_list.status_code == 200
    assert len(r_list.json()) == 1

    # 4. Descargar adjunto
    r_down = await async_client.get(
        f"/api/v1/tasks/{task.id}/attachments/{att_id}/download",
        headers=user_a_headers,
    )
    assert r_down.status_code == 200
    assert r_down.headers.get("x-content-type-options") == "nosniff"

    # 5. Eliminar adjunto por el dueño -> 204
    r_del = await async_client.delete(
        f"/api/v1/tasks/{task.id}/attachments/{att_id}",
        headers=user_a_headers,
    )
    assert r_del.status_code == 204

    # Verificar que ya no aparece en la lista activa
    r_list_after = await async_client.get(
        f"/api/v1/tasks/{task.id}/attachments",
        headers=user_a_headers,
    )
    assert r_list_after.status_code == 200
    assert len(r_list_after.json()) == 0


@pytest.mark.asyncio
async def test_comments_controller_deep_branches(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    user_b: Usuario,
    user_b_headers: dict[str, str],
    room_owner_a: Room,
):
    """Cubre creación, edición, borrado por dueño de tarea y emisión SSE en comments.py."""
    # Añadir user_b como miembro de la sala
    member = RoomMember(room_id=room_owner_a.id, user_id=user_b.id, role=RoomMemberRole.MEMBER)
    session.add(member)

    task = Task(
        titulo="Tarea Controladores Comentarios",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # 1. Crear comentario por user_b (colaborador)
    r_create = await async_client.post(
        f"/api/v1/tasks/{task.id}/comments",
        headers=user_b_headers,
        json={"contenido": "Comentario inicial de Bravo"},
    )
    assert r_create.status_code == 201
    com_id = r_create.json()["id"]

    # 2. Listar comentarios
    r_list = await async_client.get(
        f"/api/v1/tasks/{task.id}/comments",
        headers=user_a_headers,
    )
    assert r_list.status_code == 200
    assert len(r_list.json()) == 1
    assert r_list.json()[0]["contenido"] == "Comentario inicial de Bravo"

    # 3. Modificar comentario por su autor (user_b)
    r_edit = await async_client.patch(
        f"/api/v1/tasks/{task.id}/comments/{com_id}",
        headers=user_b_headers,
        json={"contenido": "Comentario corregido de Bravo"},
    )
    assert r_edit.status_code == 200
    assert r_edit.json()["contenido"] == "Comentario corregido de Bravo"

    # 4. Eliminar comentario de user_b por el dueño de la tarea (user_a) -> 204
    r_del = await async_client.delete(
        f"/api/v1/tasks/{task.id}/comments/{com_id}",
        headers=user_a_headers,
    )
    assert r_del.status_code == 204

    # Comentario debe haber desaparecido de la lista activa
    r_list_empty = await async_client.get(
        f"/api/v1/tasks/{task.id}/comments",
        headers=user_a_headers,
    )
    assert r_list_empty.status_code == 200
    assert len(r_list_empty.json()) == 0


@pytest.mark.asyncio
async def test_rooms_crud_and_membership_deep_branches(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    user_b: Usuario,
):
    """Cubre creación, validación de unicidad, actualización, membresías y eliminación de salas."""
    room_name = f"Sala_Prueba_{uuid4().hex[:6]}"

    # 1. Crear sala
    r_create = await async_client.post(
        "/api/v1/rooms",
        headers=user_a_headers,
        json={"nombre": room_name},
    )
    assert r_create.status_code == 201
    room_id = r_create.json()["id"]

    # 2. Intentar crear sala duplicada para el mismo usuario -> 422
    r_dup = await async_client.post(
        "/api/v1/rooms",
        headers=user_a_headers,
        json={"nombre": room_name},
    )
    assert r_dup.status_code == 422

    # 3. Actualizar nombre de sala
    updated_name = f"{room_name}_Renombrada"
    r_put = await async_client.put(
        f"/api/v1/rooms/{room_id}",
        headers=user_a_headers,
        json={"nombre": updated_name},
    )
    assert r_put.status_code == 200
    assert r_put.json()["nombre"] == updated_name

    # 4. Añadir miembro (user_b)
    r_add_m = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        headers=user_a_headers,
        json={"user_id": str(user_b.id), "role": "MEMBER"},
    )
    assert r_add_m.status_code == 201

    # 5. Añadir de nuevo el mismo miembro -> 422
    r_add_dup = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        headers=user_a_headers,
        json={"user_id": str(user_b.id), "role": "MEMBER"},
    )
    assert r_add_dup.status_code == 422

    # 6. Añadir al propio dueño como miembro -> 422
    r_add_owner = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        headers=user_a_headers,
        json={"user_id": str(user_a.id), "role": "ADMIN"},
    )
    assert r_add_owner.status_code == 422

    # 7. Listar salas y verificar datos enriquecidos
    r_get = await async_client.get(
        "/api/v1/rooms",
        headers=user_a_headers,
    )
    assert r_get.status_code == 200
    rooms_data = r_get.json()
    my_room = next(r for r in rooms_data if r["id"] == room_id)
    assert my_room["is_owner"] is True
    assert len(my_room["members"]) == 1

    # 8. Eliminar sala -> 204
    r_del = await async_client.delete(
        f"/api/v1/rooms/{room_id}",
        headers=user_a_headers,
    )
    assert r_del.status_code == 204


@pytest.mark.asyncio
async def test_tasks_crud_and_status_transitions_branches(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    """Cubre creación, completado con gamificación, filtrado por query y borrado lógico."""
    # 1. Crear tarea en el hogar
    r_create = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={
            "titulo": "Limpieza general fin de semana",
            "categoria": "LIMPIEZA",
            "peso": 2.0,
            "room_id": str(room_owner_a.id),
        },
    )
    assert r_create.status_code == 201
    task_id = r_create.json()["id"]

    # 2. Consultar tarea por ID
    r_get = await async_client.get(f"/api/v1/tasks/{task_id}", headers=user_a_headers)
    assert r_get.status_code == 200
    assert r_get.json()["titulo"] == "Limpieza general fin de semana"

    # 3. Alternar completado a True (otorga puntos en gamificación)
    r_complete = await async_client.patch(
        f"/api/v1/tasks/{task_id}",
        headers=user_a_headers,
        json={"completed": True},
    )
    assert r_complete.status_code == 200
    assert r_complete.json()["estado"] == "DONE"

    # 4. Alternar completado de vuelta a False
    r_uncomplete = await async_client.patch(
        f"/api/v1/tasks/{task_id}",
        headers=user_a_headers,
        json={"completed": False},
    )
    assert r_uncomplete.status_code == 200
    assert r_uncomplete.json()["estado"] == "TODO"

    # 5. Filtrar tareas por categoría y sala
    r_filtered = await async_client.get(
        "/api/v1/tasks",
        headers=user_a_headers,
        params={"categoria": "LIMPIEZA", "room_id": str(room_owner_a.id)},
    )
    assert r_filtered.status_code == 200
    assert len(r_filtered.json()) >= 1

    # 6. Borrado lógico (Soft delete)
    r_delete = await async_client.delete(
        f"/api/v1/tasks/{task_id}",
        headers=user_a_headers,
    )
    assert r_delete.status_code == 204

    # 7. La tarea eliminada no debe estar disponible
    r_after_del = await async_client.get(f"/api/v1/tasks/{task_id}", headers=user_a_headers)
    assert r_after_del.status_code == 404

