from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import asc
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.v1.endpoints.tasks import _get_task_with_access
from app.db.session import get_session
from app.models.comment import TaskComment
from app.models.task import TaskHistory
from app.models.user import Usuario
from app.schemas.comment import (
    TaskCommentCreate,
    TaskCommentRead,
    TaskCommentUpdate,
)
from app.services.auth import get_current_user
from app.services.events import event_broadcaster

router = APIRouter(prefix="/tasks/{task_id}/comments", tags=["Comentarios"])


@router.get(
    "",
    response_model=list[TaskCommentRead],
    summary="Listar comentarios",
    description="Lista todos los comentarios activos vinculados a una tarea dada.",
)
async def get_task_comments(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> list[TaskCommentRead]:
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    result = await session.exec(
        select(TaskComment)
        .options(selectinload(TaskComment.user))
        .where(
            TaskComment.task_id == task.id,
            TaskComment.deleted_at.is_(None),
        )
        .order_by(asc(TaskComment.created_at))
    )
    comments = result.all()

    out: list[TaskCommentRead] = []
    for c in comments:
        read_obj = TaskCommentRead.model_validate(c)
        if not read_obj.author_name and c.user:
            read_obj.author_name = c.user.nombre
        out.append(read_obj)
    return out


@router.post(
    "",
    response_model=TaskCommentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear comentario",
    description="Agrega un comentario a una tarea y notifica mediante SSE si pertenece a un hogar.",
)
async def create_task_comment(
    task_id: UUID,
    payload: TaskCommentCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> TaskCommentRead:
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    comment = TaskComment(
        task_id=task.id,
        user_id=current_user.id,
        contenido=payload.contenido,
    )
    session.add(comment)
    await session.commit()
    await session.refresh(comment)

    # Registro en historial de la tarea
    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action="COMMENT_ADDED",
        changes=f"Comentario agregado por {current_user.nombre or current_user.email}",
    )
    session.add(history)
    await session.commit()

    read_comment = TaskCommentRead.model_validate(comment)
    read_comment.author_name = current_user.nombre

    # Emisión SSE para miembros del hogar
    if task.room_id:
        await event_broadcaster.broadcast(
            task.room_id,
            "COMMENT_ADDED",
            read_comment.model_dump(mode="json"),
        )

    return read_comment


@router.patch(
    "/{comment_id}",
    response_model=TaskCommentRead,
    summary="Actualizar comentario",
    description="Permite al autor original editar el contenido de su comentario.",
)
async def update_task_comment(
    task_id: UUID,
    comment_id: UUID,
    payload: TaskCommentUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> TaskCommentRead:
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    result = await session.exec(
        select(TaskComment)
        .options(selectinload(TaskComment.user))
        .where(
            TaskComment.id == comment_id,
            TaskComment.task_id == task.id,
            TaskComment.deleted_at.is_(None),
        )
    )
    comment = result.one_or_none()
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comentario no encontrado.",
        )

    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el autor del comentario puede modificar su contenido.",
        )

    comment.contenido = payload.contenido
    comment.updated_at = datetime.now(UTC)
    session.add(comment)
    await session.commit()
    await session.refresh(comment)

    read_comment = TaskCommentRead.model_validate(comment)
    read_comment.author_name = current_user.nombre
    return read_comment


@router.delete(
    "/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar comentario (Soft delete)",
    description="Elimina lógicamente un comentario. Solo permitido al autor del comentario o al dueño de la tarea.",
)
async def delete_task_comment(
    task_id: UUID,
    comment_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    task, is_task_owner = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    result = await session.exec(
        select(TaskComment).where(
            TaskComment.id == comment_id,
            TaskComment.task_id == task.id,
            TaskComment.deleted_at.is_(None),
        )
    )
    comment = result.one_or_none()
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comentario no encontrado.",
        )

    is_author = (comment.user_id == current_user.id)
    if not is_author and not is_task_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el autor del comentario o el dueño de la tarea pueden eliminarlo.",
        )

    comment.deleted_at = datetime.now(UTC)
    session.add(comment)
    await session.commit()

    if task.room_id:
        await event_broadcaster.broadcast(
            task.room_id,
            "COMMENT_DELETED",
            {"comment_id": str(comment.id), "task_id": str(task.id), "room_id": str(task.room_id)},
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
