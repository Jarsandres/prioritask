from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import CategoriaTarea, EstadoTarea, RecurrenceFrequency
from app.models.recurrence_rule import RecurrenceRule
from app.models.room import Room
from app.models.task import Task, TaskHistory
from app.models.user import Usuario
from app.services.recurrence import advance_recurring_task, calculate_next_due


def test_calculate_next_due_daily():
    base = datetime(2026, 1, 1, 10, 0, 0, tzinfo=UTC)
    res = calculate_next_due(base, RecurrenceFrequency.DAILY, interval=1)
    assert res == datetime(2026, 1, 2, 10, 0, 0, tzinfo=UTC)

    res3 = calculate_next_due(base, RecurrenceFrequency.DAILY, interval=3)
    assert res3 == datetime(2026, 1, 4, 10, 0, 0, tzinfo=UTC)


def test_calculate_next_due_weekly():
    base = datetime(2026, 1, 1, 10, 0, 0, tzinfo=UTC)
    res = calculate_next_due(base, RecurrenceFrequency.WEEKLY, interval=1)
    assert res == datetime(2026, 1, 8, 10, 0, 0, tzinfo=UTC)

    res2 = calculate_next_due(base, RecurrenceFrequency.WEEKLY, interval=2)
    assert res2 == datetime(2026, 1, 15, 10, 0, 0, tzinfo=UTC)


def test_calculate_next_due_monthly():
    base = datetime(2026, 1, 15, 10, 0, 0, tzinfo=UTC)
    res = calculate_next_due(base, RecurrenceFrequency.MONTHLY, interval=1)
    assert res == datetime(2026, 2, 15, 10, 0, 0, tzinfo=UTC)

    # Month-end clamping: Jan 31 -> Feb 28 (2026 is non-leap)
    base_jan31 = datetime(2026, 1, 31, 12, 0, 0, tzinfo=UTC)
    res_feb = calculate_next_due(base_jan31, RecurrenceFrequency.MONTHLY, interval=1)
    assert res_feb == datetime(2026, 2, 28, 12, 0, 0, tzinfo=UTC)

    # Leap year: Jan 31, 2028 -> Feb 29, 2028
    base_leap = datetime(2028, 1, 31, 12, 0, 0, tzinfo=UTC)
    res_leap = calculate_next_due(base_leap, RecurrenceFrequency.MONTHLY, interval=1)
    assert res_leap == datetime(2028, 2, 29, 12, 0, 0, tzinfo=UTC)

    # Year overflow: Nov 30, 2026 + 3 months -> Feb 28, 2027
    base_nov = datetime(2026, 11, 30, 8, 0, 0, tzinfo=UTC)
    res_next_year = calculate_next_due(base_nov, RecurrenceFrequency.MONTHLY, interval=3)
    assert res_next_year == datetime(2027, 2, 28, 8, 0, 0, tzinfo=UTC)


def test_calculate_next_due_invalid_interval():
    base = datetime(2026, 1, 1, 10, 0, 0, tzinfo=UTC)
    with pytest.raises(ValueError, match="Interval must be at least 1"):
        calculate_next_due(base, RecurrenceFrequency.DAILY, interval=0)


@pytest.mark.asyncio
async def test_advance_recurring_task_not_recurring(session: AsyncSession):
    task = Task(
        titulo="Non recurring",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=uuid4(),
        room_id=uuid4(),
        is_recurring=False,
    )
    result = await advance_recurring_task(task, session)
    assert result is None


@pytest.mark.asyncio
async def test_advance_recurring_task_no_rule(session: AsyncSession):
    task = Task(
        titulo="Recurring without rule",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=uuid4(),
        room_id=uuid4(),
        is_recurring=True,
    )
    result = await advance_recurring_task(task, session)
    assert result is None


@pytest.mark.asyncio
async def test_advance_recurring_task_past_end_date(session: AsyncSession):
    user = Usuario(email=f"user_{uuid4().hex[:6]}@example.com", hashed_password="pw")
    session.add(user)
    await session.commit()
    await session.refresh(user)

    room = Room(nombre=f"Room_{uuid4().hex[:6]}", owner_id=user.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)

    due = datetime(2026, 6, 1, 10, 0, 0, tzinfo=UTC)
    end = datetime(2026, 5, 1, 10, 0, 0, tzinfo=UTC)

    task = Task(
        titulo="Task past end date",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user.id,
        room_id=room.id,
        is_recurring=True,
        due_date=datetime(2026, 4, 1, 10, 0, 0, tzinfo=UTC),
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    rule = RecurrenceRule(
        task_id=task.id,
        frequency=RecurrenceFrequency.MONTHLY,
        interval=1,
        next_due=due,
        end_date=end,
    )
    session.add(rule)
    await session.commit()
    await session.refresh(rule)

    task.recurrence_rule = rule

    res = await advance_recurring_task(task, session)
    assert res is None


@pytest.mark.asyncio
async def test_advance_recurring_task_success(session: AsyncSession):
    user = Usuario(email=f"rec_user_{uuid4().hex[:6]}@example.com", hashed_password="pw")
    session.add(user)
    await session.commit()
    await session.refresh(user)

    room = Room(nombre=f"Rec_Room_{uuid4().hex[:6]}", owner_id=user.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)

    initial_due = datetime(2026, 5, 1, 10, 0, 0, tzinfo=UTC)
    next_due_date = datetime(2026, 5, 8, 10, 0, 0, tzinfo=UTC)

    task = Task(
        titulo="Sacar la basura",
        descripcion="Bolsas de reciclaje",
        categoria=CategoriaTarea.LIMPIEZA,
        peso=2.5,
        user_id=user.id,
        room_id=room.id,
        estado=EstadoTarea.TODO,
        completed=False,
        due_date=initial_due,
        is_recurring=True,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    rule = RecurrenceRule(
        task_id=task.id,
        frequency=RecurrenceFrequency.WEEKLY,
        interval=1,
        next_due=next_due_date,
    )
    session.add(rule)
    await session.commit()
    await session.refresh(rule)

    task.recurrence_rule = rule

    new_task = await advance_recurring_task(task, session)

    assert new_task is not None
    assert new_task.id != task.id
    assert new_task.titulo == task.titulo
    assert new_task.descripcion == task.descripcion
    assert new_task.categoria == task.categoria
    assert new_task.peso == task.peso
    assert new_task.room_id == task.room_id
    assert new_task.user_id == task.user_id
    assert new_task.estado == EstadoTarea.TODO
    due_date_utc = new_task.due_date.replace(tzinfo=UTC) if new_task.due_date and new_task.due_date.tzinfo is None else new_task.due_date
    assert due_date_utc == next_due_date
    assert new_task.is_recurring is True

    # Original task must be DONE and completed
    assert task.estado == EstadoTarea.DONE
    assert task.completed is True

    # Rule must now belong to new_task and next_due updated by +1 week
    await session.refresh(rule)
    assert rule.task_id == new_task.id
    expected_subsequent = datetime(2026, 5, 15, 10, 0, 0, tzinfo=UTC)
    rule_next_due_utc = rule.next_due.replace(tzinfo=UTC) if rule.next_due and rule.next_due.tzinfo is None else rule.next_due
    assert rule_next_due_utc == expected_subsequent

    # History audit check
    hist_res = await session.exec(select(TaskHistory).where(TaskHistory.task_id == task.id))
    history_entries = hist_res.all()
    assert any(h.action == "RECURRENCE_ADVANCED" and f"{new_task.due_date}" in (h.changes or "") for h in history_entries)
