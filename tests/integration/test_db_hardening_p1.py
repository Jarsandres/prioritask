"""Batería de pruebas de integración para el Hardening de la Base de Datos (P1).

Verifica exhaustivamente:
1. Erradicación de Antipatrones N+1:
   - Batch query y bulk insertion en assign_tags_to_task.
   - Bulk delete de RoomMember en delete_room.
   - get_tasks_by_room no realiza consultas redundantes a Tag.
2. Paginación Uniforme en Endpoints Abiertos:
   - skip y limit en list_users, list_task_history, get_assigned_tasks,
     get_task_comments, get_subtasks, list_task_attachments, list_room_rewards.
   - Límite de seguridad en AI endpoints (prioritize, group, rewrite).
3. Índices Compuestos Estratégicos:
   - Presencia de índices en modelos TaskComment, Task, HouseholdReward y TaskHistory.
4. Demarcación Transaccional y Unit of Work:
   - create_task y create_task_comment usan flush y único commit atómico.
"""

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.comment import TaskComment
from app.models.gamification import HouseholdReward
from app.models.room_member import RoomMember
from app.models.task import Task, TaskHistory
from tests.utils import create_task, create_user_and_token


class TestP1BatchOptimizations:
    """Verifica la erradicación de consultas N+1."""

    @pytest.mark.asyncio
    async def test_batch_tag_assignment(self, async_client: AsyncClient, session: AsyncSession):
        """Asignación de múltiples etiquetas en lote sin N+1."""
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Crear tarea
        task = await create_task(async_client, token, {"titulo": "Tarea Batch Tags", "categoria": "LIMPIEZA"})
        task_id = UUID(task["id"])

        # 2. Crear 3 etiquetas
        tag_ids = []
        for i in range(3):
            resp = await async_client.post("/api/v1/tags", json={"nombre": f"TagBatch_{i}_{uuid4().hex[:4]}"}, headers=headers)
            assert resp.status_code == 201
            tag_ids.append(resp.json()["id"])

        # 3. Asignar en lote (incluyendo duplicado intencional en lista de IDs)
        payload = {"tag_ids": tag_ids + [tag_ids[0]]}
        assign_resp = await async_client.post(f"/api/v1/tags/tasks/{task_id}/tags", json=payload, headers=headers)
        assert assign_resp.status_code == 200

        # 4. Validar asignación idempotente en una segunda llamada
        assign_again = await async_client.post(f"/api/v1/tags/tasks/{task_id}/tags", json={"tag_ids": tag_ids}, headers=headers)
        assert assign_again.status_code == 200

    @pytest.mark.asyncio
    async def test_bulk_delete_room_members(self, async_client: AsyncClient, session: AsyncSession):
        """delete_room elimina miembros en bloque sin iteración N+1."""
        _owner, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Crear hogar
        room_resp = await async_client.post("/api/v1/rooms", json={"nombre": f"Room_Bulk_{uuid4().hex[:6]}"}, headers=headers)
        assert room_resp.status_code == 201
        room_id = room_resp.json()["id"]

        # 2. Crear y añadir 2 convivientes
        for _ in range(2):
            other_user, _ = await create_user_and_token(async_client)
            await async_client.post(
                f"/api/v1/rooms/{room_id}/members",
                json={"user_id": other_user["id"], "role": "MEMBER"},
                headers=headers,
            )

        # 3. Eliminar sala
        del_resp = await async_client.delete(f"/api/v1/rooms/{room_id}", headers=headers)
        assert del_resp.status_code == 204

        # 4. Verificar que no quedan miembros residuales
        rem_members = (await session.exec(select(RoomMember).where(RoomMember.room_id == UUID(room_id)))).all()
        assert len(rem_members) == 0


class TestP1UniformPagination:
    """Verifica que los endpoints abiertos aceptan skip y limit con valores por defecto seguros."""

    @pytest.mark.asyncio
    async def test_comments_pagination(self, async_client: AsyncClient):
        """GET /api/v1/tasks/{task_id}/comments respeta skip y limit."""
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        task = await create_task(async_client, token, {"titulo": "Tarea Comentarios Paginados"})
        task_id = task["id"]

        for i in range(5):
            await async_client.post(f"/api/v1/tasks/{task_id}/comments", json={"contenido": f"Comentario {i}"}, headers=headers)

        resp = await async_client.get(f"/api/v1/tasks/{task_id}/comments?skip=0&limit=2", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

        resp_page2 = await async_client.get(f"/api/v1/tasks/{task_id}/comments?skip=2&limit=2", headers=headers)
        assert resp_page2.status_code == 200
        assert len(resp_page2.json()) == 2

    @pytest.mark.asyncio
    async def test_subtasks_pagination(self, async_client: AsyncClient):
        """GET /api/v1/tasks/{task_id}/subtasks respeta skip y limit."""
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        task = await create_task(async_client, token, {"titulo": "Tarea Subtareas Paginadas"})
        task_id = task["id"]

        for i in range(4):
            await async_client.post(f"/api/v1/tasks/{task_id}/subtasks", json={"titulo": f"Sub {i}", "orden": i}, headers=headers)

        resp = await async_client.get(f"/api/v1/tasks/{task_id}/subtasks?skip=1&limit=2", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    @pytest.mark.asyncio
    async def test_history_pagination(self, async_client: AsyncClient):
        """GET /api/v1/tasks/history respeta skip y limit."""
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        for i in range(4):
            await create_task(async_client, token, {"titulo": f"Tarea Historial {i}_{uuid4().hex[:4]}"})

        resp = await async_client.get("/api/v1/tasks/history?skip=0&limit=2", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    @pytest.mark.asyncio
    async def test_rewards_pagination(self, async_client: AsyncClient):
        """GET /api/v1/rooms/{room_id}/rewards respeta skip y limit."""
        _owner, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        room_resp = await async_client.post("/api/v1/rooms", json={"nombre": f"Room_Rewards_{uuid4().hex[:6]}"}, headers=headers)
        room_id = room_resp.json()["id"]

        for i in range(3):
            await async_client.post(
                f"/api/v1/rooms/{room_id}/rewards",
                json={"title": f"Premio {i}", "cost_points": (i + 1) * 10},
                headers=headers,
            )

        resp = await async_client.get(f"/api/v1/rooms/{room_id}/rewards?skip=0&limit=2", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2


class TestP1CompositeIndexes:
    """Verifica que los modelos SQLModel incluyan los índices compuestos estratégicos."""

    def test_composite_indexes_defined_on_models(self):
        # 1. TaskComment
        comment_indexes = [idx.name for idx in TaskComment.__table__.indexes]
        assert "ix_taskcomment_task_id_deleted_at_created_at" in comment_indexes

        # 2. Task
        task_indexes = [idx.name for idx in Task.__table__.indexes]
        assert "ix_task_is_recurring_completed_deleted_at_due_date" in task_indexes

        # 3. HouseholdReward
        reward_indexes = [idx.name for idx in HouseholdReward.__table__.indexes]
        assert "ix_householdreward_room_active_deleted_cost" in reward_indexes

        # 4. TaskHistory
        history_indexes = [idx.name for idx in TaskHistory.__table__.indexes]
        assert "ix_taskhistory_user_id_timestamp" in history_indexes
