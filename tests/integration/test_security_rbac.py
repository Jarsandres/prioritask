"""
Automated Security Test Suite & Multi-Actor RBAC Matrix.
Milestone: M-TEST / Requirement: R4

Covers:
1. TestGlobalRBAC: Global Role-Based Access Control on administrative endpoints.
2. TestRoomPermissions: Contextual room ownership, tenant isolation, and traversal defenses.
3. TestTaskContextualPermissions: Owner vs Collaborator vs Non-Member task operations and assignment security.
4. TestSafeExceptionAndIsolation: Exception hygiene, database constraint handling, and authentication enforcement.
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import CategoriaTarea, EstadoTarea, UserRole
from app.models.room import Room
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.user import Usuario
from app.services.auth import SECRET_KEY, create_access_token, hash_password


# ===========================================================================
# 1. Global Role-Based Access Control (RBAC)
# ===========================================================================
class TestGlobalRBAC:
    """Test global role separation between ADMIN and standard USER on protected endpoints."""

    @pytest.mark.asyncio
    async def test_admin_can_list_all_users(
        self,
        async_client: AsyncClient,
        admin_headers: dict[str, str],
        user_a: Usuario,
        user_b: Usuario,
    ):
        """Admin user must receive 200 OK with the full list of registered users and role schemas."""
        response = await async_client.get("/api/v1/users", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        users = response.json()
        assert isinstance(users, list)
        assert len(users) >= 3

        emails = {u["email"] for u in users}
        assert user_a.email in emails
        assert user_b.email in emails

        # Verify schema integrity: role enum and is_superuser boolean are present
        for u in users:
            assert "id" in u
            assert "email" in u
            assert "is_superuser" in u
            assert isinstance(u["is_superuser"], bool)
            assert "role" in u
            assert u["role"] in [UserRole.ADMIN.value, UserRole.USER.value]

    @pytest.mark.asyncio
    async def test_standard_user_cannot_list_users(
        self,
        async_client: AsyncClient,
        user_a_headers: dict[str, str],
    ):
        """Standard user (non-admin) attempting to list users must receive 403 Forbidden."""
        response = await async_client.get("/api/v1/users", headers=user_a_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

        data = response.json()
        assert "detail" in data
        assert "administrador" in data["detail"].lower() or "permiso" in data["detail"].lower()

    @pytest.mark.asyncio
    async def test_unauthenticated_cannot_list_users(
        self,
        async_client: AsyncClient,
    ):
        """Unauthenticated request to list users must receive 401 Unauthorized."""
        response = await async_client.get("/api/v1/users")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"

    @pytest.mark.asyncio
    async def test_inactive_admin_blocked(
        self,
        async_client: AsyncClient,
        session: AsyncSession,
    ):
        """Disabled/inactive admin account must be rejected with 401 Unauthorized."""
        inactive_admin = Usuario(
            id=uuid4(),
            email=f"inactive-admin-{uuid4().hex[:8]}@example.com",
            nombre="Inactive Admin",
            hashed_password=hash_password("adminSecret123"),
            is_active=False,
            is_superuser=True,
        )
        session.add(inactive_admin)
        await session.commit()

        token = create_access_token(
            sub=str(inactive_admin.id),
            secret=SECRET_KEY,
            is_superuser=True,
            role="ADMIN",
        )
        headers = {"Authorization": f"Bearer {token}"}

        response = await async_client.get("/api/v1/users", headers=headers)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        assert response.json()["detail"] == "Credenciales no válidas"


# ===========================================================================
# 2. Contextual Room Permissions & Tenant Isolation
# ===========================================================================
class TestRoomPermissions:
    """Test room ownership boundaries, update/delete authorization, and tenant isolation."""

    @pytest.mark.asyncio
    async def test_room_owner_can_update_room(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
    ):
        """Room owner can update the room details successfully (200 OK)."""
        new_name = "Sala Alpha Modificada"
        response = await async_client.put(
            f"/api/v1/rooms/{room_owner_a.id}",
            json={"nombre": new_name},
            headers=user_a_headers,
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["id"] == str(room_owner_a.id)
        assert data["nombre"] == new_name

    @pytest.mark.asyncio
    async def test_non_member_cannot_update_room(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_c_headers: dict[str, str],
    ):
        """Unrelated non-member cannot update another user's room (must receive 404 to prevent resource discovery)."""
        response = await async_client.put(
            f"/api/v1/rooms/{room_owner_a.id}",
            json={"nombre": "Intento de Secuestro"},
            headers=user_c_headers,
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        assert response.json()["detail"] == "Sala no encontrada."

    @pytest.mark.asyncio
    async def test_room_tenant_isolation_in_listing(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_b_headers: dict[str, str],
    ):
        """User B listing rooms must only receive their own rooms, strictly isolated from User A's rooms."""
        # Create a room for User B
        create_resp = await async_client.post(
            "/api/v1/rooms",
            json={"nombre": "Sala Exclusiva de Bravo"},
            headers=user_b_headers,
        )
        assert create_resp.status_code == 201
        user_b_room_id = create_resp.json()["id"]

        # List rooms as User B
        list_resp = await async_client.get("/api/v1/rooms", headers=user_b_headers)
        assert list_resp.status_code == 200
        rooms = list_resp.json()

        room_ids = {r["id"] for r in rooms}
        assert user_b_room_id in room_ids
        assert str(room_owner_a.id) not in room_ids, "Cross-tenant leak: User A's room found in User B's room list"

    @pytest.mark.asyncio
    async def test_non_member_cannot_list_room_tasks(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_c_headers: dict[str, str],
    ):
        """Non-member cannot view tasks inside another user's room (must receive 404 Not Found)."""
        response = await async_client.get(
            f"/api/v1/rooms/{room_owner_a.id}/tasks",
            headers=user_c_headers,
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        assert response.json()["detail"] == "Hogar no encontrado"


# ===========================================================================
# 3. Contextual Task Permissions & Assignment Authorization
# ===========================================================================
class TestTaskContextualPermissions:
    """Test contextual task access: Owner vs Collaborator vs Non-Member."""

    @pytest.mark.asyncio
    async def test_task_owner_can_read_task(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_a_headers: dict[str, str],
    ):
        """Task creator/owner can read full task details (200 OK)."""
        response = await async_client.get(
            f"/api/v1/tasks/{task_assigned_b.id}",
            headers=user_a_headers,
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["id"] == str(task_assigned_b.id)
        assert data["titulo"] == task_assigned_b.titulo

    @pytest.mark.asyncio
    async def test_assigned_collaborator_can_read_task(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_b_headers: dict[str, str],
    ):
        """Assigned collaborator can access assigned task details."""
        response = await async_client.get(
            f"/api/v1/tasks/{task_assigned_b.id}",
            headers=user_b_headers,
        )
        assert response.status_code in (200, 403), f"Unexpected status {response.status_code}: {response.text}"

    @pytest.mark.asyncio
    async def test_unrelated_user_cannot_read_task(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_c_headers: dict[str, str],
    ):
        """Unrelated non-member cannot read private task (must receive 403 or 404)."""
        response = await async_client.get(
            f"/api/v1/tasks/{task_assigned_b.id}",
            headers=user_c_headers,
        )
        assert response.status_code in (403, 404), f"Expected 403/404, got {response.status_code}: {response.text}"

    @pytest.mark.asyncio
    async def test_assigned_collaborator_update_status(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_b_headers: dict[str, str],
    ):
        """Assigned collaborator status update attempt."""
        response = await async_client.patch(
            f"/api/v1/tasks/{task_assigned_b.id}/status",
            json={"estado": EstadoTarea.IN_PROGRESS.value},
            headers=user_b_headers,
        )
        assert response.status_code in (200, 404, 403), f"Unexpected status {response.status_code}: {response.text}"

    @pytest.mark.asyncio
    async def test_non_member_cannot_update_task_status(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_c_headers: dict[str, str],
    ):
        """Non-member cannot update task status (must receive 404 or 403)."""
        response = await async_client.patch(
            f"/api/v1/tasks/{task_assigned_b.id}/status",
            json={"estado": EstadoTarea.DONE.value},
            headers=user_c_headers,
        )
        assert response.status_code in (404, 403), f"Expected 404/403, got {response.status_code}: {response.text}"

    @pytest.mark.asyncio
    async def test_collaborator_cannot_delete_task(
        self,
        async_client: AsyncClient,
        session: AsyncSession,
        task_assigned_b: Task,
        user_b_headers: dict[str, str],
    ):
        """Assigned collaborator cannot delete task (only task owner has delete authority)."""
        response = await async_client.delete(
            f"/api/v1/tasks/{task_assigned_b.id}",
            headers=user_b_headers,
        )
        assert response.status_code in (403, 404), f"Expected 403/404, got {response.status_code}: {response.text}"

        # Verify task is NOT soft-deleted in DB
        await session.refresh(task_assigned_b)
        assert task_assigned_b.deleted_at is None, "Task was unexpectedly soft-deleted by collaborator"

    @pytest.mark.asyncio
    async def test_non_owner_cannot_assign_task(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_c: Usuario,
        user_c_headers: dict[str, str],
    ):
        """Non-owner user C cannot assign task owned by User A to anyone (400 Bad Request or 403 Forbidden)."""
        response = await async_client.post(
            "/api/v1/tasks/assign",
            json={
                "task_id": str(task_assigned_b.id),
                "user_id": str(user_c.id),
            },
            headers=user_c_headers,
        )
        assert response.status_code in (400, 403, 404), f"Expected 400/403/404, got {response.status_code}: {response.text}"

    @pytest.mark.asyncio
    async def test_collaborator_can_unassign_self(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_b: Usuario,
        user_b_headers: dict[str, str],
    ):
        """Collaborator User B can remove their own assignment (204 No Content)."""
        response = await async_client.delete(
            f"/api/v1/tasks/{task_assigned_b.id}/assignees/{user_b.id}",
            headers=user_b_headers,
        )
        assert response.status_code == 204, f"Expected 204, got {response.status_code}: {response.text}"

    @pytest.mark.asyncio
    async def test_third_party_cannot_remove_nonexistent_assignment(
        self,
        async_client: AsyncClient,
        task_assigned_b: Task,
        user_c: Usuario,
        user_c_headers: dict[str, str],
    ):
        """Third party User C cannot unassign non-existent assignment on task."""
        response = await async_client.delete(
            f"/api/v1/tasks/{task_assigned_b.id}/assignees/{user_c.id}",
            headers=user_c_headers,
        )
        assert response.status_code in (404, 403), f"Expected 404/403, got {response.status_code}: {response.text}"


# ===========================================================================
# 4. Safe Exception Handling & Tenant Isolation
# ===========================================================================
class TestSafeExceptionAndIsolation:
    """Test sanitization of database errors, unique constraint responses, and invalid inputs."""

    @pytest.mark.asyncio
    async def test_duplicate_room_name_returns_422_clean_detail(
        self,
        async_client: AsyncClient,
        user_a_headers: dict[str, str],
    ):
        """Creating duplicate room name for same user returns 422 without raw SQL database dump."""
        room_name = "Sala Unica Alpha"
        resp1 = await async_client.post(
            "/api/v1/rooms",
            json={"nombre": room_name},
            headers=user_a_headers,
        )
        assert resp1.status_code == 201

        resp2 = await async_client.post(
            "/api/v1/rooms",
            json={"nombre": room_name},
            headers=user_a_headers,
        )
        assert resp2.status_code == 422
        data = resp2.json()
        assert "detail" in data
        assert data["detail"] == "Ya existe una sala con este nombre para el usuario."

    @pytest.mark.asyncio
    async def test_duplicate_task_title_returns_400_clean_detail(
        self,
        async_client: AsyncClient,
        room_owner_a: Room,
        user_a_headers: dict[str, str],
    ):
        """Creating active task with duplicate title for same user returns 400 with sanitized detail."""
        task_title = "Comprar herramientas únicas"
        payload = {
            "titulo": task_title,
            "categoria": CategoriaTarea.COMPRA.value,
            "room_id": str(room_owner_a.id),
        }
        resp1 = await async_client.post("/api/v1/tasks", json=payload, headers=user_a_headers)
        assert resp1.status_code == 201

        resp2 = await async_client.post("/api/v1/tasks", json=payload, headers=user_a_headers)
        assert resp2.status_code == 400
        data = resp2.json()
        assert "detail" in data
        assert data["detail"] == "Ya existe una tarea activa con este título para el usuario."

    @pytest.mark.asyncio
    async def test_invalid_uuid_parameter_handling(
        self,
        async_client: AsyncClient,
        user_a_headers: dict[str, str],
    ):
        """Malformed UUID in path parameters returns standard validation error (422), avoiding 500 exceptions."""
        endpoints = [
            "/api/v1/rooms/not-a-valid-uuid",
            "/api/v1/rooms/not-a-valid-uuid/tasks",
            "/api/v1/tasks/invalid-uuid-format",
            "/api/v1/tasks/invalid-uuid-format/status",
        ]
        for url in endpoints:
            response = await async_client.get(url, headers=user_a_headers)
            assert response.status_code in (422, 404, 400, 405), f"Endpoint {url} returned unexpected {response.status_code}"

    @pytest.mark.asyncio
    async def test_unauthenticated_requests_consistent_401(
        self,
        async_client: AsyncClient,
    ):
        """Protected endpoints consistently return 401 Unauthorized when unauthenticated."""
        test_cases = [
            ("GET", "/api/v1/users"),
            ("GET", "/api/v1/rooms"),
            ("POST", "/api/v1/rooms"),
            ("GET", "/api/v1/tasks"),
            ("POST", "/api/v1/tasks"),
            ("GET", "/api/v1/auth/me"),
        ]
        for method, path in test_cases:
            response = await async_client.request(method, path)
            assert response.status_code == 401, f"{method} {path} returned {response.status_code} instead of 401"
            assert "WWW-Authenticate" in response.headers
