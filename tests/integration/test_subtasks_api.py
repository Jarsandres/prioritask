from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.room import Room
from app.models.subtask import Subtask
from app.models.task import Task
from app.models.user import Usuario


@pytest.mark.asyncio
async def test_subtasks_crud_lifecycle_owner(
    async_client: AsyncClient,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    # 1. Create a task
    create_task_resp = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={
            "titulo": "Preparar presentación",
            "categoria": "OTRO",
            "room_id": str(room_owner_a.id),
        },
    )
    assert create_task_resp.status_code == 201
    task_id = create_task_resp.json()["id"]

    # 2. Add subtasks with different order
    sub3_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
        json={"titulo": "3. Ensayar discurso", "orden": 3},
    )
    assert sub3_resp.status_code == 201
    sub3_data = sub3_resp.json()
    assert sub3_data["titulo"] == "3. Ensayar discurso"
    assert sub3_data["orden"] == 3
    assert sub3_data["completada"] is False

    sub1_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
        json={"titulo": "1. Diseñar diapositivas", "orden": 1},
    )
    assert sub1_resp.status_code == 201

    sub2_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
        json={"titulo": "2. Recopilar métricas", "orden": 2},
    )
    assert sub2_resp.status_code == 201

    # 3. List subtasks - should be ordered by 'orden'
    list_resp = await async_client.get(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
    )
    assert list_resp.status_code == 200
    subtasks = list_resp.json()
    assert len(subtasks) == 3
    assert [s["orden"] for s in subtasks] == [1, 2, 3]
    assert subtasks[0]["titulo"] == "1. Diseñar diapositivas"

    # 4. Patch subtask 1 (mark completed and update title)
    sub1_id = subtasks[0]["id"]
    patch_resp = await async_client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{sub1_id}",
        headers=user_a_headers,
        json={"completada": True, "titulo": "1. Diapositivas listas"},
    )
    assert patch_resp.status_code == 200
    patched_data = patch_resp.json()
    assert patched_data["completada"] is True
    assert patched_data["titulo"] == "1. Diapositivas listas"

    # 5. Verify TaskRead reflects enriched subtasks count
    get_task_resp = await async_client.get(
        f"/api/v1/tasks/{task_id}",
        headers=user_a_headers,
    )
    assert get_task_resp.status_code == 200
    task_data = get_task_resp.json()
    assert task_data["subtasks_count"] == 3
    assert task_data["subtasks_completed_count"] == 1
    assert len(task_data["subtasks"]) == 3

    # 6. Delete subtask 3
    sub3_id = sub3_data["id"]
    del_resp = await async_client.delete(
        f"/api/v1/tasks/{task_id}/subtasks/{sub3_id}",
        headers=user_a_headers,
    )
    assert del_resp.status_code == 204

    # 7. Verify deletion
    list_after_del = await async_client.get(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
    )
    assert list_after_del.status_code == 200
    remaining_subtasks = list_after_del.json()
    assert len(remaining_subtasks) == 2
    assert all(s["id"] != sub3_id for s in remaining_subtasks)


@pytest.mark.asyncio
async def test_subtask_collaborator_permissions(
    async_client: AsyncClient,
    task_assigned_b: Task,
    user_b_headers: dict[str, str],
):
    """Assigned collaborator (user_b) has access to manage subtasks."""
    task_id = str(task_assigned_b.id)

    # Collaborator can list subtasks
    list_resp = await async_client.get(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_b_headers,
    )
    assert list_resp.status_code == 200
    assert list_resp.json() == []

    # Collaborator can create a subtask
    create_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_b_headers,
        json={"titulo": "Paso asignado a B", "orden": 1},
    )
    assert create_resp.status_code == 201
    subtask_id = create_resp.json()["id"]

    # Collaborator can complete the subtask
    patch_resp = await async_client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        headers=user_b_headers,
        json={"completada": True},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["completada"] is True

    # Collaborator can delete the subtask
    del_resp = await async_client.delete(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        headers=user_b_headers,
    )
    assert del_resp.status_code == 204


@pytest.mark.asyncio
async def test_subtask_non_member_idor_prevention(
    async_client: AsyncClient,
    task_assigned_b: Task,
    user_a_headers: dict[str, str],
    user_c_headers: dict[str, str],
):
    """User C is an unrelated third party and must be denied with 403."""
    task_id = str(task_assigned_b.id)

    # User A creates a subtask
    create_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
        json={"titulo": "Subtarea confidencial", "orden": 0},
    )
    assert create_resp.status_code == 201
    subtask_id = create_resp.json()["id"]

    # User C tries to list subtasks
    list_resp = await async_client.get(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_c_headers,
    )
    assert list_resp.status_code == 403

    # User C tries to create a subtask
    add_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_c_headers,
        json={"titulo": "Inyección no autorizada"},
    )
    assert add_resp.status_code == 403

    # User C tries to patch the subtask
    patch_resp = await async_client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        headers=user_c_headers,
        json={"completada": True},
    )
    assert patch_resp.status_code == 403

    # User C tries to delete the subtask
    del_resp = await async_client.delete(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        headers=user_c_headers,
    )
    assert del_resp.status_code == 403


@pytest.mark.asyncio
async def test_subtask_cross_task_idor_isolation(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    """Attempting to access subtask belonging to Task 1 via Task 2 URL must yield 404."""
    # Create Task 1
    t1_resp = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={"titulo": "Tarea 1", "categoria": "OTRO", "room_id": str(room_owner_a.id)},
    )
    t1_id = t1_resp.json()["id"]

    # Create Task 2
    t2_resp = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={"titulo": "Tarea 2", "categoria": "OTRO", "room_id": str(room_owner_a.id)},
    )
    t2_id = t2_resp.json()["id"]

    # Create Subtask in Task 1
    sub1_resp = await async_client.post(
        f"/api/v1/tasks/{t1_id}/subtasks",
        headers=user_a_headers,
        json={"titulo": "Subtarea en Tarea 1"},
    )
    sub1_id = sub1_resp.json()["id"]

    # Attempt to modify Subtask 1 via Task 2 route -> 404
    patch_resp = await async_client.patch(
        f"/api/v1/tasks/{t2_id}/subtasks/{sub1_id}",
        headers=user_a_headers,
        json={"completada": True},
    )
    assert patch_resp.status_code == 404

    # Attempt to delete Subtask 1 via Task 2 route -> 404
    del_resp = await async_client.delete(
        f"/api/v1/tasks/{t2_id}/subtasks/{sub1_id}",
        headers=user_a_headers,
    )
    assert del_resp.status_code == 404


@pytest.mark.asyncio
async def test_subtask_soft_deleted_task_prevention(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    """When a task is soft-deleted, subtasks endpoints must return 404."""
    create_task_resp = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={"titulo": "Tarea a dar de baja", "categoria": "OTRO", "room_id": str(room_owner_a.id)},
    )
    task_id = create_task_resp.json()["id"]

    sub_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
        json={"titulo": "Subtarea inicial"},
    )
    subtask_id = sub_resp.json()["id"]

    # Soft delete the task
    del_task_resp = await async_client.delete(f"/api/v1/tasks/{task_id}", headers=user_a_headers)
    assert del_task_resp.status_code == 204

    # All subtask operations on deleted task must return 404
    assert (
        await async_client.get(f"/api/v1/tasks/{task_id}/subtasks", headers=user_a_headers)
    ).status_code == 404

    assert (
        await async_client.post(
            f"/api/v1/tasks/{task_id}/subtasks",
            headers=user_a_headers,
            json={"titulo": "Nueva subtarea"},
        )
    ).status_code == 404

    assert (
        await async_client.patch(
            f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
            headers=user_a_headers,
            json={"completada": True},
        )
    ).status_code == 404

    assert (
        await async_client.delete(
            f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
            headers=user_a_headers,
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_subtask_input_validation(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    create_task_resp = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={"titulo": "Tarea para validación", "categoria": "OTRO", "room_id": str(room_owner_a.id)},
    )
    task_id = create_task_resp.json()["id"]

    # Empty title -> 422
    resp_empty = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
        json={"titulo": ""},
    )
    assert resp_empty.status_code == 422

    # Extra fields in PATCH -> 422
    sub_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
        json={"titulo": "Subtarea válida"},
    )
    sub_id = sub_resp.json()["id"]

    resp_extra = await async_client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{sub_id}",
        headers=user_a_headers,
        json={"campo_inexistente": "hack"},
    )
    assert resp_extra.status_code == 422

    # Non-existent task ID -> 404
    fake_task_id = str(uuid4())
    resp_not_found = await async_client.get(
        f"/api/v1/tasks/{fake_task_id}/subtasks",
        headers=user_a_headers,
    )
    assert resp_not_found.status_code == 404

    # Missing auth -> 401
    resp_unauth = await async_client.get(f"/api/v1/tasks/{task_id}/subtasks")
    assert resp_unauth.status_code == 401


@pytest.mark.asyncio
async def test_subtask_soft_delete_and_audit_history(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    """Verify soft delete of subtask: filtered out from queries and audited in TaskHistory."""
    # 1. Create a task
    create_task_resp = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={"titulo": "Auditoría Soft Delete", "categoria": "OTRO", "room_id": str(room_owner_a.id)},
    )
    assert create_task_resp.status_code == 201
    task_id = create_task_resp.json()["id"]

    # 2. Create subtask
    sub_resp = await async_client.post(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
        json={"titulo": "Subtarea auditada", "orden": 1},
    )
    assert sub_resp.status_code == 201
    sub_id = sub_resp.json()["id"]

    # 3. Delete subtask (soft delete)
    del_resp = await async_client.delete(
        f"/api/v1/tasks/{task_id}/subtasks/{sub_id}",
        headers=user_a_headers,
    )
    assert del_resp.status_code == 204

    # 4. Listing subtasks must return empty
    list_resp = await async_client.get(
        f"/api/v1/tasks/{task_id}/subtasks",
        headers=user_a_headers,
    )
    assert list_resp.status_code == 200
    assert list_resp.json() == []

    # 5. Getting task must show subtasks_count == 0 and subtasks == []
    get_task_resp = await async_client.get(
        f"/api/v1/tasks/{task_id}",
        headers=user_a_headers,
    )
    assert get_task_resp.status_code == 200
    task_data = get_task_resp.json()
    assert task_data["subtasks_count"] == 0
    assert task_data["subtasks"] == []

    # 6. Attempting to delete or update already soft-deleted subtask returns 404
    del_again_resp = await async_client.delete(
        f"/api/v1/tasks/{task_id}/subtasks/{sub_id}",
        headers=user_a_headers,
    )
    assert del_again_resp.status_code == 404

    patch_deleted_resp = await async_client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{sub_id}",
        headers=user_a_headers,
        json={"titulo": "Intento de revivir"},
    )
    assert patch_deleted_resp.status_code == 404

    # 7. Check TaskHistory has recorded SUBTASK_DELETED with task_id, user_id, and subtask info
    history_resp = await async_client.get(
        f"/api/v1/tasks/{task_id}/history",
        headers=user_a_headers,
    )
    assert history_resp.status_code == 200
    history_list = history_resp.json()
    actions = [h["action"] for h in history_list]
    assert "SUBTASK_DELETED" in actions

    delete_events = [h for h in history_list if h["action"] == "SUBTASK_DELETED"]
    assert len(delete_events) == 1
    del_event = delete_events[0]
    assert del_event["task_id"] == task_id
    assert del_event["user_id"] == str(user_a.id)
    assert "Subtarea auditada" in del_event["changes"]
    assert sub_id in del_event["changes"]

    # 8. Physical DB check: row still exists, deleted_at is populated
    db_subtask = await session.get(Subtask, UUID(sub_id))
    assert db_subtask is not None
    assert db_subtask.deleted_at is not None
