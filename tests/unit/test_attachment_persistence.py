from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.attachment import TaskAttachment
from app.models.enums import CategoriaTarea
from app.models.room import Room
from app.models.task import Task
from app.models.user import Usuario


@pytest.mark.asyncio
async def test_task_attachment_persistence_and_relationships(session: AsyncSession):
    # Create user
    user = Usuario(email=f"uploader_{uuid4().hex[:6]}@example.com", nombre="Subidor", hashed_password="pw")
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
        titulo="Tarea con adjuntos",
        categoria=CategoriaTarea.MANTENIMIENTO,
        user_id=user.id,
        room_id=room.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # Create attachment
    attachment = TaskAttachment(
        task_id=task.id,
        user_id=user.id,
        filename="recibo_reparacion.pdf",
        file_key=f"{uuid4()}.pdf",
        content_type="application/pdf",
        file_size_bytes=1024,
        caption="Factura del fontanero",
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)

    assert attachment.id is not None
    assert attachment.task_id == task.id
    assert attachment.user_id == user.id
    assert attachment.deleted_at is None

    # Query with relationships
    res = await session.exec(
        select(TaskAttachment)
        .options(selectinload(TaskAttachment.task), selectinload(TaskAttachment.user))
        .where(TaskAttachment.id == attachment.id)
    )
    persisted = res.one()
    assert persisted.filename == "recibo_reparacion.pdf"
    assert persisted.caption == "Factura del fontanero"
    assert persisted.task is not None
    assert persisted.task.id == task.id
    assert persisted.user is not None
    assert persisted.user.id == user.id


@pytest.mark.asyncio
async def test_task_attachment_soft_delete(session: AsyncSession):
    user = Usuario(email=f"softdel_{uuid4().hex[:6]}@example.com", nombre="User", hashed_password="pw")
    session.add(user)
    await session.commit()
    await session.refresh(user)

    room = Room(nombre=f"Hogar_{uuid4().hex[:6]}", owner_id=user.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)

    task = Task(titulo="Tarea Soft Delete Att", categoria=CategoriaTarea.OTRO, user_id=user.id, room_id=room.id)
    session.add(task)
    await session.commit()
    await session.refresh(task)

    attachment = TaskAttachment(
        task_id=task.id,
        user_id=user.id,
        filename="foto.png",
        file_key=f"{uuid4()}.png",
        content_type="image/png",
        file_size_bytes=2048,
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)

    # Perform soft delete
    attachment.deleted_at = datetime.now(UTC)
    session.add(attachment)
    await session.commit()

    # Query active attachments
    active_res = await session.exec(
        select(TaskAttachment).where(
            TaskAttachment.task_id == task.id,
            TaskAttachment.deleted_at.is_(None),
        )
    )
    assert active_res.first() is None
