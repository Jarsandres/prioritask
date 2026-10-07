from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.comment import TaskComment
from app.models.enums import CategoriaTarea
from app.models.room import Room
from app.models.task import Task
from app.models.user import Usuario


@pytest.mark.asyncio
async def test_task_comment_persistence_and_relationships(session: AsyncSession):
    # Create user
    user = Usuario(email=f"commenter_{uuid4().hex[:6]}@example.com", nombre="Comentarista", hashed_password="pw")
    session.add(user)
    await session.commit()
    await session.refresh(user)

    # Create room
    room = Room(nombre=f"Hogar_{uuid4().hex[:6]}", owner_id=user.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)

    # Create task
    task = Task(
        titulo="Tarea con comentarios",
        categoria=CategoriaTarea.OTRO,
        user_id=user.id,
        room_id=room.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # Create comment
    comment = TaskComment(
        task_id=task.id,
        user_id=user.id,
        user=user,
        contenido="Este es un comentario importante sobre la tarea.",
    )
    session.add(comment)
    await session.commit()
    await session.refresh(comment)

    assert comment.id is not None
    assert comment.task_id == task.id
    assert comment.user_id == user.id
    assert comment.deleted_at is None

    # Query comment through DB with user loaded
    res = await session.exec(
        select(TaskComment)
        .options(selectinload(TaskComment.user))
        .where(TaskComment.id == comment.id)
    )
    persisted = res.one()
    assert persisted.contenido == "Este es un comentario importante sobre la tarea."
    assert persisted.author_name == "Comentarista"


@pytest.mark.asyncio
async def test_task_comment_soft_delete(session: AsyncSession):
    user = Usuario(email=f"softdel_{uuid4().hex[:6]}@example.com", nombre="User", hashed_password="pw")
    session.add(user)
    await session.commit()
    await session.refresh(user)

    room = Room(nombre=f"Hogar_{uuid4().hex[:6]}", owner_id=user.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)

    task = Task(titulo="Tarea Soft Delete", categoria=CategoriaTarea.OTRO, user_id=user.id, room_id=room.id)
    session.add(task)
    await session.commit()
    await session.refresh(task)

    comment = TaskComment(task_id=task.id, user_id=user.id, contenido="Nota a eliminar")
    session.add(comment)
    await session.commit()
    await session.refresh(comment)

    # Soft delete
    comment.deleted_at = datetime.now(UTC)
    session.add(comment)
    await session.commit()

    # Query active comments
    active_res = await session.exec(
        select(TaskComment).where(
            TaskComment.task_id == task.id,
            TaskComment.deleted_at.is_(None),
        )
    )
    assert active_res.first() is None

    # Query all comments includes soft-deleted
    all_res = await session.exec(
        select(TaskComment).where(TaskComment.task_id == task.id)
    )
    found = all_res.first()
    assert found is not None
    assert found.deleted_at is not None
