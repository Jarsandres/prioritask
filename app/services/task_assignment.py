from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.models.task_assignment import TaskAssignment
from app.models.task import Task
from app.models.user import Usuario
from datetime import datetime, timezone
from uuid import UUID

class TaskAssignmentService:

    @staticmethod
    async def assign_task(session: AsyncSession, task_id: UUID, user_id: UUID, assigned_by: UUID) -> TaskAssignment:
        # Valida existencia de la tarea
        task = await session.get(Task, task_id)
        if not task:
            raise ValueError("Task not found")

        # Valida existencia del usuario
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
            fecha=datetime.now(timezone.utc)
        )
        session.add(assignment)
        await session.commit()
        await session.refresh(assignment)
        return assignment

    @staticmethod
    async def get_assigned_tasks(session: AsyncSession, user_id: UUID):
        result = await session.exec(
            select(TaskAssignment).where(TaskAssignment.user_id == user_id)
        )
        return result.all()
