from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import asc
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.v1.endpoints.tasks import _get_task_with_access
from app.db.session import get_session
from app.models.enums import TaskAction
from app.models.subtask import Subtask
from app.models.task import TaskHistory
from app.models.user import Usuario
from app.schemas.subtask import SubtaskCreate, SubtaskRead, SubtaskUpdate
from app.services.auth import get_current_user
from app.services.events import event_broadcaster

router = APIRouter(prefix="/tasks/{task_id}/subtasks", tags=["Subtareas"])


@router.get(
    "",
    response_model=list[SubtaskRead],
    summary="Listar subtareas",
    description="Lista las subtareas de una tarea activa ordenadas por orden y created_at.",
)
async def get_subtasks(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> list[Subtask]:
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    result = await session.exec(
        select(Subtask)
        .where(
            Subtask.task_id == task.id,
            Subtask.deleted_at.is_(None),
        )
        .order_by(asc(Subtask.orden), asc(Subtask.created_at))
    )
    return list(result.all())


@router.post(
    "",
    response_model=SubtaskRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear subtarea",
    description="Crea una nueva subtarea para la tarea activa indicada.",
)
async def create_subtask(
    task_id: UUID,
    payload: SubtaskCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> Subtask:
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    subtask = Subtask(
        task_id=task.id,
        titulo=payload.titulo,
        orden=payload.orden,
        completada=False,
    )
    session.add(subtask)
    await session.commit()
    await session.refresh(subtask)

    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action=TaskAction.SUBTASK_CREATED,
        changes=f"Subtarea '{subtask.titulo}' ({subtask.id}) creada",
    )
    session.add(history)
    await session.commit()
    return subtask


@router.patch(
    "/{subtask_id}",
    response_model=SubtaskRead,
    summary="Actualizar subtarea",
    description="Modifica título, estado de completitud o reordena una subtarea.",
)
async def update_subtask(
    task_id: UUID,
    subtask_id: UUID,
    payload: SubtaskUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> Subtask:
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    result = await session.exec(
        select(Subtask).where(
            Subtask.id == subtask_id,
            Subtask.task_id == task.id,
            Subtask.deleted_at.is_(None),
        )
    )
    subtask = result.one_or_none()
    if not subtask:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subtarea no encontrada",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(subtask, field, value)

    subtask.updated_at = datetime.now(UTC)
    session.add(subtask)

    action = (
        TaskAction.SUBTASK_TOGGLED
        if "completada" in update_data and len(update_data) == 1
        else TaskAction.UPDATED
    )
    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action=action,
        changes=f"Subtarea '{subtask.titulo}' ({subtask.id}) modificada",
    )
    session.add(history)

    await session.commit()
    await session.refresh(subtask)

    if task.room_id and "completada" in update_data:
        await event_broadcaster.broadcast(
            task.room_id,
            "SUBTASK_TOGGLED",
            {
                "task_id": str(task.id),
                "subtask_id": str(subtask.id),
                "completada": subtask.completada,
                "room_id": str(task.room_id),
            },
        )

    return subtask


@router.delete(
    "/{subtask_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar subtarea",
    description="Elimina una subtarea específica de la tarea mediante borrado lógico.",
)
async def delete_subtask(
    task_id: UUID,
    subtask_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> None:
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    result = await session.exec(
        select(Subtask).where(
            Subtask.id == subtask_id,
            Subtask.task_id == task.id,
            Subtask.deleted_at.is_(None),
        )
    )
    subtask = result.one_or_none()
    if not subtask:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subtarea no encontrada",
        )

    now = datetime.now(UTC)
    subtask.deleted_at = now
    subtask.updated_at = now
    session.add(subtask)

    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action=TaskAction.SUBTASK_DELETED,
        changes=f"Subtarea '{subtask.titulo}' ({subtask.id}) eliminada",
    )
    session.add(history)
    await session.commit()
