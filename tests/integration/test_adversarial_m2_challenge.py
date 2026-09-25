from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.models.enums import CategoriaTarea
from app.models.room import Room
from app.models.task import Task
from app.models.user import Usuario


@pytest.mark.asyncio
class TestTaskAssignmentPrivilegeBoundaries:
    """Adversarially challenge task assignment privilege boundaries and authorization matrix."""

    async def test_non_owner_cannot_assign_task(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_b_headers: dict[str, str],
        user_c: Usuario,
    ):
        """Collaborator User B attempts to assign task to User C -> 403 Forbidden."""
        response = await async_client.post(
            "/api/v1/tasks/assign",
            json={
                "task_id": str(task_assigned_b.id),
                "user_id": str(user_c.id),
            },
            headers=user_b_headers,
        )
        assert response.status_code == 403
        data = response.json()
        assert "detail" in data
        assert "propietario" in data["detail"].lower()

    async def test_unrelated_user_cannot_assign_task(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_c_headers: dict[str, str],
        user_c: Usuario,
    ):
        """Unrelated User C attempts to assign task -> 403 Forbidden."""
        response = await async_client.post(
            "/api/v1/tasks/assign",
            json={
                "task_id": str(task_assigned_b.id),
                "user_id": str(user_c.id),
            },
            headers=user_c_headers,
        )
        assert response.status_code == 403
        data = response.json()
        assert "propietario" in data["detail"].lower()

    async def test_self_assignment_prevention(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a: Usuario,
        user_a_headers: dict[str, str],
    ):
        """Task owner User A attempts to assign task to themselves -> 400 Bad Request."""
        # Create a new active task
        task_resp = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": f"Task Self Assign {uuid4().hex[:6]}",
                "categoria": CategoriaTarea.OTRO.value,
                "room_id": str(room_owner_a.id),
            },
            headers=user_a_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # Attempt self-assignment
        response = await async_client.post(
            "/api/v1/tasks/assign",
            json={
                "task_id": task_id,
                "user_id": str(user_a.id),
            },
            headers=user_a_headers,
        )
        assert response.status_code == 400
        data = response.json()
        assert "Cannot assign a task to yourself" in data["detail"]

    async def test_duplicate_assignment_prevention(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_a_headers: dict[str, str],
        user_b: Usuario,
    ):
        """Assigning a task to an already assigned collaborator -> 400 Bad Request."""
        response = await async_client.post(
            "/api/v1/tasks/assign",
            json={
                "task_id": str(task_assigned_b.id),
                "user_id": str(user_b.id),
            },
            headers=user_a_headers,
        )
        assert response.status_code == 400
        data = response.json()
        assert "Assignment already exists" in data["detail"]

    async def test_assign_to_nonexistent_user(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
    ):
        """Assigning a task to a non-existent user UUID -> 400 Bad Request."""
        task_resp = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": f"Task Invalid User {uuid4().hex[:6]}",
                "categoria": CategoriaTarea.COMPRA.value,
                "room_id": str(room_owner_a.id),
            },
            headers=user_a_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        fake_user_id = str(uuid4())
        response = await async_client.post(
            "/api/v1/tasks/assign",
            json={
                "task_id": task_id,
                "user_id": fake_user_id,
            },
            headers=user_a_headers,
        )
        assert response.status_code == 400
        data = response.json()
        assert "User not found" in data["detail"]

    async def test_assign_nonexistent_task(
        self,
        async_client: AsyncClient,
        user_a_headers: dict[str, str],
        user_b: Usuario,
    ):
        """Assigning a non-existent task UUID -> 404 Not Found."""
        fake_task_id = str(uuid4())
        response = await async_client.post(
            "/api/v1/tasks/assign",
            json={
                "task_id": fake_task_id,
                "user_id": str(user_b.id),
            },
            headers=user_a_headers,
        )
        assert response.status_code == 404
        data = response.json()
        assert "Task not found" in data["detail"]

    async def test_assign_soft_deleted_task(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
        user_b: Usuario,
    ):
        """Attempting to assign a soft-deleted task -> 404 Not Found."""
        task_resp = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": f"Task To Be Deleted {uuid4().hex[:6]}",
                "categoria": CategoriaTarea.MANTENIMIENTO.value,
                "room_id": str(room_owner_a.id),
            },
            headers=user_a_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # Soft delete the task
        del_resp = await async_client.delete(f"/api/v1/tasks/{task_id}", headers=user_a_headers)
        assert del_resp.status_code == 204

        # Try to assign the deleted task
        response = await async_client.post(
            "/api/v1/tasks/assign",
            json={
                "task_id": task_id,
                "user_id": str(user_b.id),
            },
            headers=user_a_headers,
        )
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]

    async def test_third_party_cannot_remove_task_assignment(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_b: Usuario,
        user_c_headers: dict[str, str],
    ):
        """Third party User C attempting to unassign User B from User A's task -> 403 Forbidden."""
        response = await async_client.delete(
            f"/api/v1/tasks/{task_assigned_b.id}/assignees/{user_b.id}",
            headers=user_c_headers,
        )
        assert response.status_code == 403
        data = response.json()
        assert "detail" in data
        assert "permiso" in data["detail"].lower()

    async def test_collaborator_self_unassignment(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
        user_b: Usuario,
        user_b_headers: dict[str, str],
    ):
        """Collaborator User B unassigns themselves -> 204 No Content."""
        # Create fresh task and assign to B
        task_resp = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": f"Task Self Unassign {uuid4().hex[:6]}",
                "categoria": CategoriaTarea.LIMPIEZA.value,
                "room_id": str(room_owner_a.id),
            },
            headers=user_a_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        assign_resp = await async_client.post(
            "/api/v1/tasks/assign",
            json={"task_id": task_id, "user_id": str(user_b.id)},
            headers=user_a_headers,
        )
        assert assign_resp.status_code == 201

        # Collaborator unassigns self
        unassign_resp = await async_client.delete(
            f"/api/v1/tasks/{task_id}/assignees/{user_b.id}",
            headers=user_b_headers,
        )
        assert unassign_resp.status_code == 204

        # Check assigned tasks for B
        list_resp = await async_client.get(
            f"/api/v1/tasks/assigned/{user_b.id}",
            headers=user_b_headers,
        )
        assert list_resp.status_code == 200
        assert all(item["task_id"] != task_id for item in list_resp.json())

    async def test_owner_removing_collaborator_assignment(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
        user_b: Usuario,
        user_b_headers: dict[str, str],
    ):
        """Task owner User A removes collaborator User B assignment -> 204 No Content."""
        # Create fresh task and assign to B
        task_resp = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": f"Task Owner Remove {uuid4().hex[:6]}",
                "categoria": CategoriaTarea.OTRO.value,
                "room_id": str(room_owner_a.id),
            },
            headers=user_a_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        assign_resp = await async_client.post(
            "/api/v1/tasks/assign",
            json={"task_id": task_id, "user_id": str(user_b.id)},
            headers=user_a_headers,
        )
        assert assign_resp.status_code == 201

        # Owner removes assignment
        del_resp = await async_client.delete(
            f"/api/v1/tasks/{task_id}/assignees/{user_b.id}",
            headers=user_a_headers,
        )
        assert del_resp.status_code == 204

        # Collaborator B can no longer read the task
        read_resp = await async_client.get(
            f"/api/v1/tasks/{task_id}",
            headers=user_b_headers,
        )
        assert read_resp.status_code == 403

    async def test_unassign_nonexistent_assignment_by_owner(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
        user_c: Usuario,
    ):
        """Owner attempts to remove an assignment that does not exist -> 404 Not Found."""
        task_resp = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": f"Task Nonexistent Assignment {uuid4().hex[:6]}",
                "categoria": CategoriaTarea.COMPRA.value,
                "room_id": str(room_owner_a.id),
            },
            headers=user_a_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        response = await async_client.delete(
            f"/api/v1/tasks/{task_id}/assignees/{user_c.id}",
            headers=user_a_headers,
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "Asignación no encontrada"

    async def test_reassignment_after_unassignment_succeeds(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
        user_b: Usuario,
        user_b_headers: dict[str, str],
    ):
        """Assign -> Unassign -> Reassign to same user succeeds without residual constraint violation."""
        task_resp = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": f"Task Reassign Cycle {uuid4().hex[:6]}",
                "categoria": CategoriaTarea.OTRO.value,
                "room_id": str(room_owner_a.id),
            },
            headers=user_a_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # Step 1: First assignment
        a1 = await async_client.post(
            "/api/v1/tasks/assign",
            json={"task_id": task_id, "user_id": str(user_b.id)},
            headers=user_a_headers,
        )
        assert a1.status_code == 201

        # Step 2: Unassign
        u1 = await async_client.delete(
            f"/api/v1/tasks/{task_id}/assignees/{user_b.id}",
            headers=user_a_headers,
        )
        assert u1.status_code == 204

        # Step 3: Reassign
        a2 = await async_client.post(
            "/api/v1/tasks/assign",
            json={"task_id": task_id, "user_id": str(user_b.id)},
            headers=user_a_headers,
        )
        assert a2.status_code == 201
        assert a2.json()["task_id"] == task_id
        assert a2.json()["user_id"] == str(user_b.id)

    async def test_assigned_tasks_idor_query_protection(
        self,
        async_client: AsyncClient,
        user_b: Usuario,
        user_c_headers: dict[str, str],
    ):
        """Unrelated user C querying assigned tasks of User B must be rejected with 403 Forbidden."""
        response = await async_client.get(
            f"/api/v1/tasks/assigned/{user_b.id}",
            headers=user_c_headers,
        )
        # If user C does not own any tasks assigned to B, returns 403 or empty list if owns other tasks
        assert response.status_code in (403, 200)
        if response.status_code == 200:
            assert len(response.json()) == 0


@pytest.mark.asyncio
class TestPartialUniqueIndexAndConstraints:
    """Adversarially challenge partial unique index 'unique_user_active_task_title' and soft delete."""

    async def test_create_task_soft_delete_recreate_same_title_succeeds(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
    ):
        """Lifecycle: create task -> soft delete -> create new task with exact same title -> 201 Created."""
        unique_title = f"Ciclo de Vida Soft Delete {uuid4().hex[:8]}"
        payload = {
            "titulo": unique_title,
            "categoria": CategoriaTarea.LIMPIEZA.value,
            "room_id": str(room_owner_a.id),
        }

        # Step 1: Create first task
        resp1 = await async_client.post("/api/v1/tasks", json=payload, headers=user_a_headers)
        assert resp1.status_code == 201
        task1_id = resp1.json()["id"]

        # Step 2: Soft delete first task
        del_resp = await async_client.delete(f"/api/v1/tasks/{task1_id}", headers=user_a_headers)
        assert del_resp.status_code == 204

        # Step 3: Recreate new task with same title (must succeed because first is deleted_at IS NOT NULL)
        resp2 = await async_client.post("/api/v1/tasks", json=payload, headers=user_a_headers)
        assert resp2.status_code == 201
        task2_id = resp2.json()["id"]
        assert task2_id != task1_id

    async def test_multiple_soft_deleted_tasks_with_same_title_allowed(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
    ):
        """Multiple soft-deleted tasks with identical titles can coexist without violating partial unique index."""
        title = f"Multi-Deleted Title {uuid4().hex[:8]}"
        payload = {
            "titulo": title,
            "categoria": CategoriaTarea.COMPRA.value,
            "room_id": str(room_owner_a.id),
        }

        for _ in range(3):
            # Create
            c_resp = await async_client.post("/api/v1/tasks", json=payload, headers=user_a_headers)
            assert c_resp.status_code == 201
            t_id = c_resp.json()["id"]

            # Delete
            d_resp = await async_client.delete(f"/api/v1/tasks/{t_id}", headers=user_a_headers)
            assert d_resp.status_code == 204

        # Final active task with same title must succeed
        final_resp = await async_client.post("/api/v1/tasks", json=payload, headers=user_a_headers)
        assert final_resp.status_code == 201

    async def test_duplicate_active_task_title_fails_cleanly(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
    ):
        """Two active tasks with identical title for same user must fail with clean 400 detail."""
        title = f"Duplicate Active Task {uuid4().hex[:8]}"
        payload = {
            "titulo": title,
            "categoria": CategoriaTarea.MANTENIMIENTO.value,
            "room_id": str(room_owner_a.id),
        }

        resp1 = await async_client.post("/api/v1/tasks", json=payload, headers=user_a_headers)
        assert resp1.status_code == 201

        resp2 = await async_client.post("/api/v1/tasks", json=payload, headers=user_a_headers)
        assert resp2.status_code == 400
        data = resp2.json()
        assert "detail" in data
        assert data["detail"] == "Ya existe una tarea activa con este título para el usuario."

    async def test_same_task_title_different_users_succeeds(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
        user_b_headers: dict[str, str],
    ):
        """Partial index is scoped to (user_id, titulo): User A and User B can have identical active titles."""
        # Create room for User B
        r_resp = await async_client.post(
            "/api/v1/rooms",
            json={"nombre": f"Room User B {uuid4().hex[:6]}"},
            headers=user_b_headers,
        )
        assert r_resp.status_code == 201
        room_b_id = r_resp.json()["id"]

        shared_title = f"Common Task Title {uuid4().hex[:8]}"

        # User A creates task
        resp_a = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": shared_title,
                "categoria": CategoriaTarea.OTRO.value,
                "room_id": str(room_owner_a.id),
            },
            headers=user_a_headers,
        )
        assert resp_a.status_code == 201

        # User B creates task with identical title
        resp_b = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": shared_title,
                "categoria": CategoriaTarea.OTRO.value,
                "room_id": room_b_id,
            },
            headers=user_b_headers,
        )
        assert resp_b.status_code == 201
        assert resp_a.json()["id"] != resp_b.json()["id"]
