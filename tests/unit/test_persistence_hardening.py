from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.comment import TaskComment
from app.models.enums import CategoriaTarea, RoomMemberRole
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.subtask import Subtask
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.user import Usuario


@pytest.mark.asyncio
async def test_sqlite_pragmas_configured(session: AsyncSession):
    """Verify that SQLite PRAGMAs are executed on connection."""
    # Check foreign keys
    fk_res = await session.exec(text("PRAGMA foreign_keys;"))
    assert fk_res.scalar() == 1

    # Check busy timeout
    timeout_res = await session.exec(text("PRAGMA busy_timeout;"))
    assert timeout_res.scalar() == 5000


@pytest.mark.asyncio
async def test_task_assignment_uuid_and_unique_constraint(
    session: AsyncSession, user_a: Usuario, user_b: Usuario, room_owner_a: Room
):
    """Verify TaskAssignment uses UUID id and enforces uq_task_assignment constraint."""
    task = Task(
        titulo="Hardened Assignment Task",
        categoria=CategoriaTarea.MANTENIMIENTO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    assignment = TaskAssignment(
        task_id=task.id,
        user_id=user_b.id,
        asignado_por=user_a.id,
    )
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)

    # 1. ID must be a UUID instance
    assert isinstance(assignment.id, UUID)

    # 2. Duplicate assignment (task_id, user_id) must fail IntegrityError
    dup_assignment = TaskAssignment(
        task_id=task.id,
        user_id=user_b.id,
        asignado_por=user_a.id,
    )
    session.add(dup_assignment)
    with pytest.raises(IntegrityError):
        await session.commit()
    await session.rollback()


@pytest.mark.asyncio
async def test_foreign_key_cascade_deletion(
    session: AsyncSession, user_a: Usuario, user_b: Usuario, room_owner_a: Room
):
    """Verify ondelete='CASCADE' cleans up dependent records upon task and room deletion."""
    # Create Task
    task = Task(
        titulo="Task To Cascade",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # Add RoomMember
    rm = RoomMember(user_id=user_b.id, room_id=room_owner_a.id, role=RoomMemberRole.MEMBER)
    session.add(rm)

    # Add Subtask
    subtask = Subtask(task_id=task.id, titulo="Subtask 1")
    session.add(subtask)

    # Add Comment
    comment = TaskComment(task_id=task.id, user_id=user_a.id, contenido="Test comment")
    session.add(comment)

    # Add Assignment
    assignment = TaskAssignment(task_id=task.id, user_id=user_b.id, asignado_por=user_a.id)
    session.add(assignment)

    await session.commit()

    # Delete Task directly via DB execution to trigger DB-level FK cascade
    await session.exec(text(f"DELETE FROM task WHERE id = '{task.id.hex}'"))
    await session.commit()

    # Subtask, Comment, Assignment must be cascaded
    subtasks = (await session.exec(select(Subtask).where(Subtask.task_id == task.id))).all()
    assert len(subtasks) == 0

    comments = (await session.exec(select(TaskComment).where(TaskComment.task_id == task.id))).all()
    assert len(comments) == 0

    assignments = (await session.exec(select(TaskAssignment).where(TaskAssignment.task_id == task.id))).all()
    assert len(assignments) == 0

    # Delete Room to test room cascade
    new_task = Task(
        titulo="Room Child Task",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(new_task)
    await session.commit()

    await session.exec(text(f"DELETE FROM room WHERE id = '{room_owner_a.id.hex}'"))
    await session.commit()

    # Tasks and RoomMembers of that room must be cascaded
    room_tasks = (await session.exec(select(Task).where(Task.room_id == room_owner_a.id))).all()
    assert len(room_tasks) == 0

    room_members = (await session.exec(select(RoomMember).where(RoomMember.room_id == room_owner_a.id))).all()
    assert len(room_members) == 0


@pytest.mark.asyncio
async def test_partial_unique_index_allows_duplicate_completed_titles(
    session: AsyncSession, user_a: Usuario, room_owner_a: Room
):
    """Verify that multiple completed tasks can share the same title, unlike unconditional unique."""
    t1 = Task(
        id=uuid4(),
        titulo="Tarea Recurrente Historial",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
        completed=True,
    )
    t2 = Task(
        id=uuid4(),
        titulo="Tarea Recurrente Historial",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
        completed=True,
    )
    session.add(t1)
    session.add(t2)
    await session.commit()

    # But active duplicate tasks (completed=False) for the same user must be rejected
    active1 = Task(
        id=uuid4(),
        titulo="Tarea Activa Unica",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
        completed=False,
    )
    active2 = Task(
        id=uuid4(),
        titulo="Tarea Activa Unica",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
        completed=False,
    )
    session.add(active1)
    await session.commit()

    session.add(active2)
    with pytest.raises(IntegrityError):
        await session.commit()
    await session.rollback()
