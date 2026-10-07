from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import CategoriaTarea
from app.models.room import Room
from app.models.subtask import Subtask
from app.models.task import Task
from app.models.user import Usuario
from app.schemas.subtask import SubtaskCreate, SubtaskRead, SubtaskUpdate
from app.schemas.task import TaskRead


@pytest.mark.asyncio
async def test_subtask_model_persistence(session: AsyncSession, user_a: Usuario, room_owner_a: Room):
    task = Task(
        titulo="Tarea Principal con Subtareas",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    subtask1 = Subtask(
        task_id=task.id,
        titulo="Paso 1: Investigar",
        orden=1,
    )
    subtask2 = Subtask(
        task_id=task.id,
        titulo="Paso 2: Implementar",
        orden=2,
        completada=True,
    )
    session.add(subtask1)
    session.add(subtask2)
    await session.commit()
    await session.refresh(subtask1)
    await session.refresh(subtask2)

    assert subtask1.id is not None
    assert subtask1.task_id == task.id
    assert subtask1.titulo == "Paso 1: Investigar"
    assert subtask1.completada is False
    assert subtask1.orden == 1
    assert isinstance(subtask1.created_at, datetime)
    assert isinstance(subtask1.updated_at, datetime)

    assert subtask2.completada is True
    assert subtask2.orden == 2

    # Query from DB
    res = await session.exec(select(Subtask).where(Subtask.task_id == task.id).order_by(Subtask.orden))
    all_subtasks = res.all()
    assert len(all_subtasks) == 2
    assert all_subtasks[0].titulo == "Paso 1: Investigar"
    assert all_subtasks[1].titulo == "Paso 2: Implementar"


@pytest.mark.asyncio
async def test_subtask_cascade_delete(session: AsyncSession, user_a: Usuario, room_owner_a: Room):
    task = Task(
        titulo="Tarea para eliminar con cascada",
        categoria=CategoriaTarea.MANTENIMIENTO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    subtask = Subtask(task_id=task.id, titulo="Subtarea a borrar")
    session.add(subtask)
    await session.commit()
    await session.refresh(subtask)

    subtask_id = subtask.id

    # Physical delete of task triggers cascade deletion
    await session.delete(task)
    await session.commit()

    deleted_subtask = await session.get(Subtask, subtask_id)
    assert deleted_subtask is None


def test_task_model_subtask_properties():
    task = Task(
        titulo="Tarea de prueba en memoria",
        categoria=CategoriaTarea.OTRO,
        user_id=uuid4(),
        room_id=uuid4(),
    )
    # When subtasks relationship is not loaded
    assert task.subtasks_count == 0
    assert task.subtasks_completed_count == 0

    # When subtasks are populated
    sub1 = Subtask(task_id=task.id, titulo="Sub 1", completada=False)
    sub2 = Subtask(task_id=task.id, titulo="Sub 2", completada=True)
    sub3 = Subtask(task_id=task.id, titulo="Sub 3", completada=True)
    task.subtasks = [sub1, sub2, sub3]

    assert task.subtasks_count == 3
    assert task.subtasks_completed_count == 2

    # When a subtask is soft-deleted
    sub3.deleted_at = datetime.now(UTC)
    assert task.subtasks_count == 2
    assert task.subtasks_completed_count == 1


def test_subtask_schemas_validation():
    # SubtaskCreate
    create_schema = SubtaskCreate(titulo="Comprar manzanas", orden=5)
    assert create_schema.titulo == "Comprar manzanas"
    assert create_schema.orden == 5

    # SubtaskCreate default orden
    create_default = SubtaskCreate(titulo="Hacer limpieza")
    assert create_default.orden == 0

    # SubtaskCreate empty title fails
    with pytest.raises(ValidationError):
        SubtaskCreate(titulo="")

    # SubtaskUpdate
    update_schema = SubtaskUpdate(titulo="Comprar manzanas rojas", completada=True, orden=2)
    assert update_schema.titulo == "Comprar manzanas rojas"
    assert update_schema.completada is True
    assert update_schema.orden == 2

    # SubtaskUpdate partial
    update_partial = SubtaskUpdate(completada=True)
    assert update_partial.titulo is None
    assert update_partial.completada is True
    assert update_partial.orden is None

    # SubtaskUpdate forbids extra attributes
    with pytest.raises(ValidationError):
        SubtaskUpdate(extra_field="invalido")  # type: ignore[call-arg]

    # SubtaskRead
    now = datetime.now(UTC)
    read_schema = SubtaskRead(
        id=uuid4(),
        task_id=uuid4(),
        titulo="Revisar documentación",
        completada=False,
        orden=1,
        created_at=now,
        updated_at=now,
    )
    assert read_schema.completada is False
    assert read_schema.orden == 1


def test_task_read_subtask_enrichment():
    now = datetime.now(UTC)
    t_id = uuid4()
    sub_read1 = SubtaskRead(
        id=uuid4(),
        task_id=t_id,
        titulo="Item 1",
        completada=True,
        orden=1,
        created_at=now,
        updated_at=now,
    )
    sub_read2 = SubtaskRead(
        id=uuid4(),
        task_id=t_id,
        titulo="Item 2",
        completada=False,
        orden=2,
        created_at=now,
        updated_at=now,
    )

    # Empty subtasks default
    task_read_empty = TaskRead(
        id=t_id,
        titulo="Tarea sin subtareas",
        categoria=CategoriaTarea.OTRO,
        estado="TODO",
        peso=1.0,
        created_at=now,
        user_id=uuid4(),
    )
    assert task_read_empty.subtasks == []
    assert task_read_empty.subtasks_count == 0
    assert task_read_empty.subtasks_completed_count == 0

    # With subtasks provided
    task_read_populated = TaskRead(
        id=t_id,
        titulo="Tarea con subtareas",
        categoria=CategoriaTarea.OTRO,
        estado="TODO",
        peso=1.0,
        created_at=now,
        user_id=uuid4(),
        subtasks=[sub_read1, sub_read2],
    )
    assert len(task_read_populated.subtasks) == 2
    assert task_read_populated.subtasks_count == 2
    assert task_read_populated.subtasks_completed_count == 1

    # With soft-deleted subtask included in payload, it must be filtered out
    sub_read_deleted = SubtaskRead(
        id=uuid4(),
        task_id=t_id,
        titulo="Item Eliminado",
        completada=True,
        orden=3,
        created_at=now,
        updated_at=now,
        deleted_at=now,
    )
    task_read_with_deleted = TaskRead(
        id=t_id,
        titulo="Tarea con subtarea borrada",
        categoria=CategoriaTarea.OTRO,
        estado="TODO",
        peso=1.0,
        created_at=now,
        user_id=uuid4(),
        subtasks=[sub_read1, sub_read2, sub_read_deleted],
    )
    assert len(task_read_with_deleted.subtasks) == 2
    assert task_read_with_deleted.subtasks_count == 2
    assert task_read_with_deleted.subtasks_completed_count == 1
    assert all(s.id != sub_read_deleted.id for s in task_read_with_deleted.subtasks)


@pytest.mark.asyncio
async def test_subtask_soft_delete_db_persistence(session: AsyncSession, user_a: Usuario, room_owner_a: Room):
    """Test soft-delete in database: record is preserved with deleted_at set."""
    task = Task(
        titulo="Tarea para probar soft delete DB",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    subtask = Subtask(task_id=task.id, titulo="Subtarea a borrar suavemente")
    session.add(subtask)
    await session.commit()
    await session.refresh(subtask)

    subtask_id = subtask.id
    assert subtask.deleted_at is None

    # Apply soft delete
    now = datetime.now(UTC)
    subtask.deleted_at = now
    session.add(subtask)
    await session.commit()

    # Query active subtasks: must not find it
    active_res = await session.exec(
        select(Subtask).where(Subtask.task_id == task.id, Subtask.deleted_at.is_(None))
    )
    assert active_res.all() == []

    # Direct get by ID: record still exists physically
    persisted = await session.get(Subtask, subtask_id)
    assert persisted is not None
    assert persisted.deleted_at is not None
