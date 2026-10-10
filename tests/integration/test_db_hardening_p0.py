"""Batería de pruebas de integración y seguridad para el Hardening de la Base de Datos (P0).

Verifica exhaustivamente:
1. Recreación de tareas tras soft delete o completion (índice parcial unique_user_active_task_title
   vs vieja restricción incondicional unique_user_task_title).
2. Integridad referencial y cumplimiento de PRAGMA foreign_keys = ON en SQLite.
3. Unicidad estricta en asignaciones de tareas (restricción uq_task_assignment).
4. Generación y retorno de identificadores UUID v4 en TaskAssignment y schemas de respuesta.
5. Borrado en cascada de hogares (Room) con tareas, miembros y asignaciones sin violar
   la integridad referencial.
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import CategoriaTarea, RoomMemberRole
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.user import Usuario
from tests.utils import create_task, create_user_and_token


# ============================================================================
# 1. Recreación tras Soft Delete y Completion
# ============================================================================
class TestSoftDeleteTaskRecreation:
    """Verifica la eliminación de la restricción incondicional unique_user_task_title

    y la correcta operatividad del índice parcial unique_user_active_task_title.
    """

    @pytest.mark.asyncio
    async def test_recreate_active_task_with_same_title_after_soft_delete_api(
        self, async_client
    ):
        """Permite crear una tarea activa con el mismo título que una tarea previamente borrada (soft delete)."""
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}
        shared_title = f"Hardened Task Title {uuid4().hex[:8]}"

        # 1. Crear tarea original
        original = await create_task(
            async_client,
            token,
            {"titulo": shared_title, "categoria": "LIMPIEZA"},
        )
        assert original["id"]

        # 2. Borrado lógico (soft delete)
        del_resp = await async_client.delete(
            f"/api/v1/tasks/{original['id']}", headers=headers
        )
        assert del_resp.status_code == 204

        # 3. Recrear tarea con el MISMO título
        new_resp = await async_client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"titulo": shared_title, "categoria": "LIMPIEZA"},
        )
        assert new_resp.status_code == 201
        new_task = new_resp.json()
        assert new_task["id"] != original["id"]
        assert new_task["titulo"] == shared_title
        assert new_task["estado"] != "DONE"
        assert new_task["deleted_at"] is None

    @pytest.mark.asyncio
    async def test_recreate_active_task_with_same_title_after_completion_api(
        self, async_client
    ):
        """Permite crear una nueva tarea activa con el mismo título que una tarea ya completada."""
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}
        shared_title = f"Completed Task Title {uuid4().hex[:8]}"

        # 1. Crear tarea original
        task_1 = await create_task(
            async_client,
            token,
            {"titulo": shared_title, "categoria": "LIMPIEZA"},
        )

        # 2. Marcar como completada
        complete_resp = await async_client.patch(
            f"/api/v1/tasks/{task_1['id']}",
            headers=headers,
            json={"completed": True},
        )
        assert complete_resp.status_code == 200
        assert complete_resp.json()["estado"] == "DONE"

        # 3. Crear nueva tarea activa con el mismo título
        task_2_resp = await async_client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"titulo": shared_title, "categoria": "LIMPIEZA"},
        )
        assert task_2_resp.status_code == 201
        task_2 = task_2_resp.json()
        assert task_2["id"] != task_1["id"]
        assert task_2["titulo"] == shared_title
        assert task_2["estado"] != "DONE"

    @pytest.mark.asyncio
    async def test_active_uncompleted_duplicate_task_rejected_by_partial_index(
        self, async_client
    ):
        """Rechaza con 400 Bad Request el intento de crear un duplicado cuando la tarea original está activa."""
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}
        shared_title = f"Unique Active Task {uuid4().hex[:8]}"

        # 1. Crear tarea activa
        await create_task(
            async_client,
            token,
            {"titulo": shared_title, "categoria": "LIMPIEZA"},
        )

        # 2. Intentar crear duplicado activo
        dup_resp = await async_client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"titulo": shared_title, "categoria": "LIMPIEZA"},
        )
        assert dup_resp.status_code == 400
        assert "Ya existe una tarea activa con este título" in dup_resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_orm_level_partial_unique_index_verification(
        self, session: AsyncSession, user_a: Usuario, room_owner_a: Room
    ):
        """Verifica a nivel de motor DB/ORM que el índice parcial único permite soft-delete

        y rechaza duplicados activos de forma determinista.
        """
        shared_title = f"Direct DB Title {uuid4().hex[:8]}"

        # Tarea 1: Borrada lógicamente
        task_deleted = Task(
            titulo=shared_title,
            categoria=CategoriaTarea.LIMPIEZA,
            user_id=user_a.id,
            room_id=room_owner_a.id,
            deleted_at=datetime.now(UTC),
            completed=False,
        )
        session.add(task_deleted)
        await session.commit()

        # Tarea 2: Activa con el mismo título (debe persistirse correctamente)
        task_active = Task(
            titulo=shared_title,
            categoria=CategoriaTarea.LIMPIEZA,
            user_id=user_a.id,
            room_id=room_owner_a.id,
            deleted_at=None,
            completed=False,
        )
        session.add(task_active)
        await session.commit()
        await session.refresh(task_active)
        assert task_active.id is not None

        # Tarea 3: Segunda tarea activa con el mismo título -> debe fallar con IntegrityError
        task_duplicate_active = Task(
            titulo=shared_title,
            categoria=CategoriaTarea.LIMPIEZA,
            user_id=user_a.id,
            room_id=room_owner_a.id,
            deleted_at=None,
            completed=False,
        )
        session.add(task_duplicate_active)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


# ============================================================================
# 2. Integridad Referencial y PRAGMA Foreign Keys
# ============================================================================
class TestReferentialIntegrityAndPragmaForeignKeys:
    """Verifica que SQLite aplique activamente integridad referencial

    con PRAGMA foreign_keys = ON, rechazando registros huérfanos.
    """

    @pytest.mark.asyncio
    async def test_sqlite_pragma_foreign_keys_is_enabled(
        self, session: AsyncSession
    ):
        """Verifica que la sesión de base de datos tiene habilitado PRAGMA foreign_keys = ON."""
        result = await session.exec(sa.text("PRAGMA foreign_keys;"))
        fk_status = result.scalar()
        assert fk_status == 1, "PRAGMA foreign_keys debe ser 1 (habilitado)"

    @pytest.mark.asyncio
    async def test_sqlite_rejects_task_with_nonexistent_user_id(
        self, session: AsyncSession, room_owner_a: Room
    ):
        """SQLite debe rechazar con IntegrityError la inserción de Task con user_id inexistente."""
        fake_user_id = uuid4()
        task = Task(
            titulo="Tarea con usuario fantasma",
            categoria=CategoriaTarea.LIMPIEZA,
            user_id=fake_user_id,
            room_id=room_owner_a.id,
        )
        session.add(task)
        with pytest.raises(IntegrityError) as exc_info:
            await session.commit()
        assert "foreign key" in str(exc_info.value).lower()
        await session.rollback()

    @pytest.mark.asyncio
    async def test_sqlite_rejects_task_with_nonexistent_room_id(
        self, session: AsyncSession, user_a: Usuario
    ):
        """SQLite debe rechazar con IntegrityError la inserción de Task con room_id inexistente."""
        fake_room_id = uuid4()
        task = Task(
            titulo="Tarea con sala fantasma",
            categoria=CategoriaTarea.LIMPIEZA,
            user_id=user_a.id,
            room_id=fake_room_id,
        )
        session.add(task)
        with pytest.raises(IntegrityError) as exc_info:
            await session.commit()
        assert "foreign key" in str(exc_info.value).lower()
        await session.rollback()

    @pytest.mark.asyncio
    async def test_sqlite_rejects_room_member_with_nonexistent_room(
        self, session: AsyncSession, user_a: Usuario
    ):
        """SQLite debe rechazar con IntegrityError la inserción de RoomMember con room_id inexistente."""
        fake_room_id = uuid4()
        member = RoomMember(
            user_id=user_a.id,
            room_id=fake_room_id,
            role=RoomMemberRole.MEMBER,
        )
        session.add(member)
        with pytest.raises(IntegrityError) as exc_info:
            await session.commit()
        assert "foreign key" in str(exc_info.value).lower()
        await session.rollback()

    @pytest.mark.asyncio
    async def test_sqlite_rejects_task_assignment_with_nonexistent_task(
        self, session: AsyncSession, user_a: Usuario, user_b: Usuario
    ):
        """SQLite debe rechazar con IntegrityError la inserción de TaskAssignment con task_id inexistente."""
        fake_task_id = uuid4()
        assignment = TaskAssignment(
            task_id=fake_task_id,
            user_id=user_b.id,
            asignado_por=user_a.id,
        )
        session.add(assignment)
        with pytest.raises(IntegrityError) as exc_info:
            await session.commit()
        assert "foreign key" in str(exc_info.value).lower()
        await session.rollback()


# ============================================================================
# 3. Unicidad en Asignaciones de Tareas (uq_task_assignment)
# ============================================================================
class TestTaskAssignmentUniqueness:
    """Verifica la restricción de unicidad uq_task_assignment tanto a nivel de API

    como en la definición del esquema DDL / ORM.
    """

    @pytest.mark.asyncio
    async def test_api_rejects_duplicate_task_assignment(
        self, async_client, user_a_headers, user_b: Usuario, room_owner_a: Room
    ):
        """La API rechaza con 400 Bad Request el intento de asignar la misma tarea al mismo usuario dos veces."""
        # 1. Crear tarea como user_a
        task_resp = await async_client.post(
            "/api/v1/tasks",
            headers=user_a_headers,
            json={
                "titulo": f"Tarea Asignación Única {uuid4().hex[:6]}",
                "categoria": "LIMPIEZA",
                "room_id": str(room_owner_a.id),
            },
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # 2. Primera asignación exitosa (201)
        assign_resp1 = await async_client.post(
            "/api/v1/tasks/assign",
            headers=user_a_headers,
            json={"task_id": task_id, "user_id": str(user_b.id)},
        )
        assert assign_resp1.status_code == 201

        # 3. Segunda asignación duplicada rechazada (400)
        assign_resp2 = await async_client.post(
            "/api/v1/tasks/assign",
            headers=user_a_headers,
            json={"task_id": task_id, "user_id": str(user_b.id)},
        )
        assert assign_resp2.status_code == 400
        assert "Assignment already exists" in assign_resp2.json()["detail"]

    @pytest.mark.asyncio
    async def test_db_constraint_uq_task_assignment_declared_in_metadata(self):
        """Verifica que el modelo TaskAssignment declara explícitamente la restricción uq_task_assignment."""
        constraint_names = {
            c.name for c in TaskAssignment.__table__.constraints if c.name
        }
        assert (
            "uq_task_assignment" in constraint_names
        ), f"Restricción 'uq_task_assignment' no encontrada en {constraint_names}"

    @pytest.mark.asyncio
    async def test_db_constraint_uq_task_assignment_enforced_by_engine(
        self,
        session: AsyncSession,
        user_a: Usuario,
        user_b: Usuario,
        room_owner_a: Room,
    ):
        """Verifica que el motor de base de datos lanza IntegrityError al intentar insertar

        asignaciones duplicadas omitiendo la capa de servicio.
        """
        task = Task(
            titulo=f"Tarea Direct ORM {uuid4().hex[:6]}",
            categoria=CategoriaTarea.MANTENIMIENTO,
            user_id=user_a.id,
            room_id=room_owner_a.id,
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)

        # Inserción directa 1
        assign1 = TaskAssignment(
            task_id=task.id,
            user_id=user_b.id,
            asignado_por=user_a.id,
        )
        session.add(assign1)
        await session.commit()

        # Inserción directa 2 (duplicada)
        assign2 = TaskAssignment(
            task_id=task.id,
            user_id=user_b.id,
            asignado_por=user_a.id,
        )
        session.add(assign2)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


# ============================================================================
# 4. Identificadores UUID v4 en TaskAssignment
# ============================================================================
class TestTaskAssignmentUUID:
    """Verifica que TaskAssignment use y devuelva identificadores UUID v4 canónicos."""

    @pytest.mark.asyncio
    async def test_task_assignment_id_is_valid_uuid_v4_in_api_response(
        self, async_client, user_a_headers, user_b: Usuario, room_owner_a: Room
    ):
        """El endpoint POST /api/v1/tasks/assign retorna un id que es un UUID v4 válido."""
        task_resp = await async_client.post(
            "/api/v1/tasks",
            headers=user_a_headers,
            json={
                "titulo": f"Tarea UUID Check {uuid4().hex[:6]}",
                "categoria": "COMPRA",
                "room_id": str(room_owner_a.id),
            },
        )
        task_id = task_resp.json()["id"]

        assign_resp = await async_client.post(
            "/api/v1/tasks/assign",
            headers=user_a_headers,
            json={"task_id": task_id, "user_id": str(user_b.id)},
        )
        assert assign_resp.status_code == 201
        data = assign_resp.json()

        # Validar tipo y formato UUID v4
        raw_id = data["id"]
        parsed_uuid = UUID(str(raw_id))
        assert parsed_uuid.version == 4, f"Se esperaba UUID versión 4, obtenido {parsed_uuid.version}"
        assert str(parsed_uuid) == str(raw_id)

    @pytest.mark.asyncio
    async def test_get_assigned_tasks_returns_valid_uuid_v4_ids(
        self, async_client, user_a_headers, user_b: Usuario, user_b_headers, room_owner_a: Room
    ):
        """El endpoint GET /api/v1/tasks/assigned/{user_id} retorna objetos con id tipo UUID v4."""
        task_resp = await async_client.post(
            "/api/v1/tasks",
            headers=user_a_headers,
            json={
                "titulo": f"Tarea List UUID {uuid4().hex[:6]}",
                "categoria": "LIMPIEZA",
                "room_id": str(room_owner_a.id),
            },
        )
        task_id = task_resp.json()["id"]

        await async_client.post(
            "/api/v1/tasks/assign",
            headers=user_a_headers,
            json={"task_id": task_id, "user_id": str(user_b.id)},
        )

        list_resp = await async_client.get(
            f"/api/v1/tasks/assigned/{user_b.id}",
            headers=user_b_headers,
        )
        assert list_resp.status_code == 200
        assignments = list_resp.json()
        assert len(assignments) >= 1

        for a in assignments:
            parsed_id = UUID(str(a["id"]))
            assert parsed_id.version == 4

    @pytest.mark.asyncio
    async def test_task_assignment_model_generates_uuid_v4_primary_key(
        self, session: AsyncSession, user_a: Usuario, user_b: Usuario, room_owner_a: Room
    ):
        """La entidad TaskAssignment genera automáticamente una primary key UUID v4."""
        task = Task(
            titulo="Tarea PK Check",
            categoria=CategoriaTarea.OTRO,
            user_id=user_a.id,
            room_id=room_owner_a.id,
        )
        session.add(task)
        await session.commit()

        assignment = TaskAssignment(
            task_id=task.id,
            user_id=user_b.id,
            asignado_por=user_a.id,
        )
        session.add(assignment)
        await session.commit()
        await session.refresh(assignment)

        assert isinstance(assignment.id, UUID)
        assert assignment.id.version == 4


# ============================================================================
# 5. Borrado de Hogares en Cascada (Room Cascade Deletion)
# ============================================================================
class TestRoomCascadeDeletion:
    """Verifica que al eliminar un hogar (Room), todas sus tareas asociadas,

    miembros y asignaciones se eliminen limpiamente sin infringir claves foráneas.
    """

    @pytest.mark.asyncio
    async def test_delete_room_with_tasks_and_members_via_api(
        self,
        async_client,
        user_a_headers,
        user_b: Usuario,
        session: AsyncSession,
    ):
        """Eliminar un hogar con tareas, miembros y asignaciones a través de la API

        se completa con HTTP 204 y respeta las restricciones de integridad.
        """
        # 1. Crear hogar
        room_resp = await async_client.post(
            "/api/v1/rooms",
            headers=user_a_headers,
            json={"nombre": f"Hogar Cascada {uuid4().hex[:6]}"},
        )
        assert room_resp.status_code == 201
        room_id = UUID(room_resp.json()["id"])

        # 2. Agregar miembro conviviente
        member_resp = await async_client.post(
            f"/api/v1/rooms/{room_id}/members",
            headers=user_a_headers,
            json={"user_id": str(user_b.id), "role": "MEMBER"},
        )
        assert member_resp.status_code == 201

        # 3. Crear tareas dentro del hogar
        task1_resp = await async_client.post(
            "/api/v1/tasks",
            headers=user_a_headers,
            json={
                "titulo": f"Tarea 1 en Cascada {uuid4().hex[:6]}",
                "categoria": "LIMPIEZA",
                "room_id": str(room_id),
            },
        )
        assert task1_resp.status_code == 201
        task1_id = UUID(task1_resp.json()["id"])

        task2_resp = await async_client.post(
            "/api/v1/tasks",
            headers=user_a_headers,
            json={
                "titulo": f"Tarea 2 en Cascada {uuid4().hex[:6]}",
                "categoria": "LIMPIEZA",
                "room_id": str(room_id),
            },
        )
        assert task2_resp.status_code == 201
        _task2_id = UUID(task2_resp.json()["id"])

        # 4. Asignar una tarea al miembro
        assign_resp = await async_client.post(
            "/api/v1/tasks/assign",
            headers=user_a_headers,
            json={"task_id": str(task1_id), "user_id": str(user_b.id)},
        )
        assert assign_resp.status_code == 201
        assignment_id = UUID(assign_resp.json()["id"])

        # 5. Eliminar el Hogar mediante DELETE /api/v1/rooms/{room_id}
        del_resp = await async_client.delete(
            f"/api/v1/rooms/{room_id}",
            headers=user_a_headers,
        )
        assert del_resp.status_code == 204

        # 6. Validar que la sala ya no existe para el usuario
        rooms_list_resp = await async_client.get(
            "/api/v1/rooms",
            headers=user_a_headers,
        )
        assert rooms_list_resp.status_code == 200
        assert str(room_id) not in [r["id"] for r in rooms_list_resp.json()]

        # 7. Validar en base de datos la ausencia de registros huérfanos
        # Las tareas vinculadas a esa sala deben haberse eliminado
        tasks_remaining = (
            await session.exec(select(Task).where(Task.room_id == room_id))
        ).all()
        assert len(tasks_remaining) == 0

        # Los miembros deben haberse eliminado
        members_remaining = (
            await session.exec(
                select(RoomMember).where(RoomMember.room_id == room_id)
            )
        ).all()
        assert len(members_remaining) == 0

        # Las asignaciones asociadas a tareas eliminadas deben haberse eliminado
        assignments_remaining = (
            await session.exec(
                select(TaskAssignment).where(
                    TaskAssignment.id == assignment_id
                )
            )
        ).all()
        assert len(assignments_remaining) == 0

    @pytest.mark.asyncio
    async def test_orm_cascade_delete_room_cleans_related_entities(
        self,
        session: AsyncSession,
        user_a: Usuario,
        user_b: Usuario,
    ):
        """Eliminar un Room directamente a través de session.delete(room)

        desencadena la cascada ORM sin violar PRAGMA foreign_keys = ON.
        """
        # 1. Crear Room
        room = Room(nombre=f"Sala ORM Cascade {uuid4().hex[:6]}", owner_id=user_a.id)
        session.add(room)
        await session.commit()
        await session.refresh(room)

        # 2. Agregar miembro
        member = RoomMember(
            room_id=room.id,
            user_id=user_b.id,
            role=RoomMemberRole.MEMBER,
        )
        session.add(member)

        # 3. Agregar tarea
        task = Task(
            titulo=f"Tarea ORM Cascade {uuid4().hex[:6]}",
            categoria=CategoriaTarea.OTRO,
            user_id=user_a.id,
            room_id=room.id,
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)

        # 4. Agregar asignación
        assignment = TaskAssignment(
            task_id=task.id,
            user_id=user_b.id,
            asignado_por=user_a.id,
        )
        session.add(assignment)
        await session.commit()

        # 5. Eliminar la sala directamente mediante la sesión ORM
        # Con cascade delete-orphan configurado en Room y PRAGMA foreign_keys = ON activo
        await session.delete(room)
        await session.commit()

        # 6. Comprobar que no hay registros huérfanos
        room_check = await session.get(Room, room.id)
        assert room_check is None

        task_check = await session.get(Task, task.id)
        assert task_check is None

        assign_check = await session.get(TaskAssignment, assignment.id)
        assert assign_check is None
