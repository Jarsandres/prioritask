import calendar
from datetime import UTC, datetime, timedelta

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import EstadoTarea, RecurrenceFrequency
from app.models.recurrence_rule import RecurrenceRule
from app.models.task import Task, TaskHistory


def calculate_next_due(
    current_due: datetime,
    frequency: RecurrenceFrequency,
    interval: int = 1,
) -> datetime:
    """Calculates the next due date based on frequency and interval."""
    if interval < 1:
        raise ValueError("Interval must be at least 1")

    if frequency == RecurrenceFrequency.DAILY:
        return current_due + timedelta(days=interval)

    if frequency == RecurrenceFrequency.WEEKLY:
        return current_due + timedelta(days=interval * 7)

    if frequency == RecurrenceFrequency.MONTHLY:
        total_months = (current_due.year * 12 + (current_due.month - 1)) + interval
        target_year = total_months // 12
        target_month = (total_months % 12) + 1
        max_day = calendar.monthrange(target_year, target_month)[1]
        target_day = min(current_due.day, max_day)
        return current_due.replace(year=target_year, month=target_month, day=target_day)

    raise ValueError(f"Frecuencia no soportada: {frequency}")


async def advance_recurring_task(
    task: Task,
    session: AsyncSession,
) -> Task | None:
    """
    Advances a recurring task:
    - If not recurring or no recurrence_rule, returns None.
    - If recurrence_rule.end_date is defined and recurrence_rule.next_due > recurrence_rule.end_date, returns None.
    - Marks current task as EstadoTarea.DONE and completed = True.
    - Calculates the next due date using calculate_next_due.
    - Creates and persists a cloned Task instance (same title, description, category, weight, room_id, user_id)
      in state EstadoTarea.TODO, completed = False, due_date = recurrence_rule.next_due.
    - Associates and updates recurrence rule with the new next_due and task_id.
    - Returns the newly created Task.
    """
    if not task.is_recurring:
        return None

    rule = getattr(task, "recurrence_rule", None)
    if rule is None:
        result = await session.exec(
            select(RecurrenceRule).where(RecurrenceRule.task_id == task.id)
        )
        rule = result.one_or_none()

    if rule is None:
        return None

    if rule.end_date is not None:
        next_dt = rule.next_due
        end_dt = rule.end_date
        if next_dt.tzinfo is None and end_dt.tzinfo is not None:
            next_dt = next_dt.replace(tzinfo=UTC)
        elif next_dt.tzinfo is not None and end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=UTC)

        if next_dt > end_dt:
            return None

    task.estado = EstadoTarea.DONE
    task.completed = True
    task.updated_at = datetime.now(UTC)
    session.add(task)

    cloned_due_date = rule.next_due
    subsequent_due = calculate_next_due(
        cloned_due_date,
        rule.frequency,
        rule.interval,
    )

    new_task = Task(
        titulo=task.titulo,
        descripcion=task.descripcion,
        categoria=task.categoria,
        peso=task.peso,
        room_id=task.room_id,
        user_id=task.user_id,
        estado=EstadoTarea.TODO,
        completed=False,
        due_date=cloned_due_date,
        is_recurring=True,
    )
    session.add(new_task)
    await session.flush()

    task.recurrence_rule = None
    rule.task_id = new_task.id
    rule.next_due = subsequent_due
    new_task.recurrence_rule = rule
    session.add(rule)

    history_entry = TaskHistory(
        task_id=task.id,
        user_id=task.user_id,
        action="RECURRENCE_ADVANCED",
        changes=f"Tarea completada y avanzada automáticamente a nueva fecha: {new_task.due_date}",
    )
    session.add(history_entry)

    await session.commit()
    await session.refresh(new_task)
    return new_task
