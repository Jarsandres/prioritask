from datetime import UTC, datetime
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.user import Usuario


class TaskAssignmentService:

    @staticmethod
    async def assign_task(session: AsyncSession, task_id: UUID, user_id: UUID, assigned_by: UUID) -> TaskAssignment:
        # Valida existencia y que no esté eliminada
        result_task = await session.exec(
            select(Task).where(
                Task.id == task_id,
                Task.deleted_at.is_(None)
            )
        )
        task = result_task.one_or_none()
        if not task:
            raise ValueError("Task not found")

        # Valida propiedad de la tarea (solo el propietario puede asignar)
        if task.user_id != assigned_by:
            raise PermissionError("Solo el propietario puede asignar la tarea")

        # Valida existencia del usuario destino
        user = await session.get(Usuario, user_id)
        if not user:
            raise ValueError("User not found")

        if user_id == assigned_by:
            raise ValueError("Cannot assign a task to yourself")

        # Verifica duplicados
        result = await session.exec(
            select(TaskAssignment).where(
                TaskAssignment.task_id == task_id,
                TaskAssignment.user_id == user_id,
            )
        )
        if result.first():
            raise ValueError("Assignment already exists")

        # Crear la asignación
        assignment = TaskAssignment(
            task_id=task_id,
            user_id=user_id,
            asignado_por=assigned_by,
            fecha=datetime.now(UTC)
        )
        session.add(assignment)
        await session.commit()
        await session.refresh(assignment)
        return assignment

    @staticmethod
    async def get_assigned_tasks(session: AsyncSession, user_id: UUID, filter_owner_id: UUID | None = None):
        filters = [
            TaskAssignment.user_id == user_id,
            Task.deleted_at.is_(None),
        ]
        if filter_owner_id is not None:
            filters.append(
                (Task.user_id == filter_owner_id) | (TaskAssignment.asignado_por == filter_owner_id)
            )
        result = await session.exec(
            select(TaskAssignment)
            .join(Task, Task.id == TaskAssignment.task_id)
            .where(*filters)
        )
        return result.all()

    @staticmethod
    async def remove_task_assignment(session: AsyncSession, task_id: UUID, user_id: UUID):
        # Buscar la asignación
        query = select(TaskAssignment).where(
            TaskAssignment.task_id == task_id,
            TaskAssignment.user_id == user_id
        )
        result = await session.exec(query)
        assignment = result.one_or_none()

        if not assignment:
            raise ValueError("Tarea asignada no encontrada")

        # Eliminar la asignación
        await session.delete(assignment)
        await session.commit()
