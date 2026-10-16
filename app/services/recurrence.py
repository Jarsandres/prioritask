import calendar
from datetime import UTC, datetime, timedelta

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import EstadoTarea, RecurrenceFrequency, RecurrenceMode
from app.models.recurrence_rule import RecurrenceRule
from app.models.subtask import Subtask
from app.models.task import Task, TaskHistory


def calculate_next_due(
    current_due: datetime,
    frequency: RecurrenceFrequency,
    interval: int = 1,
    anchor_day_of_month: int | None = None,
    by_weekdays: list[int] | None = None,
    is_last_day_of_month: bool = False,
) -> datetime:
    """Calculates the next due date based on frequency, interval, and optional monthly anchor day."""
    if interval < 1:
        raise ValueError("Interval must be at least 1")

    if frequency == RecurrenceFrequency.DAILY:
        return current_due + timedelta(days=interval)

    if frequency == RecurrenceFrequency.WORKDAYS:
        return _add_workdays(current_due, interval)

    if frequency == RecurrenceFrequency.WEEKLY:
        if by_weekdays:
            return _step_by_weekdays(current_due, interval, by_weekdays)
        return current_due + timedelta(days=interval * 7)

    if frequency == RecurrenceFrequency.MONTHLY:
        total_months = (current_due.year * 12 + (current_due.month - 1)) + interval
        target_year = total_months // 12
        target_month = (total_months % 12) + 1
        max_day = calendar.monthrange(target_year, target_month)[1]
        if is_last_day_of_month:
            target_day = max_day
        else:
            desired_day = (
                max(1, min(31, anchor_day_of_month))
                if anchor_day_of_month is not None
                else current_due.day
            )
            target_day = min(desired_day, max_day)
        return current_due.replace(year=target_year, month=target_month, day=target_day)

    if frequency == RecurrenceFrequency.YEARLY:
        target_year = current_due.year + interval
        max_day = calendar.monthrange(target_year, current_due.month)[1]
        desired_day = (
            max(1, min(31, anchor_day_of_month))
            if anchor_day_of_month is not None
            else current_due.day
        )
        target_day = min(desired_day, max_day)
        return current_due.replace(year=target_year, day=target_day)

    raise ValueError(f"Frecuencia no soportada: {frequency}")


def _add_workdays(current_due: datetime, workdays: int) -> datetime:
    """Avanza `workdays` días laborables (lunes a viernes)."""
    cursor = current_due
    remaining = workdays
    while remaining > 0:
        cursor = cursor + timedelta(days=1)
        if cursor.weekday() < 5:  # 0=Lunes .. 4=Viernes
            remaining -= 1
    return cursor


def _step_by_weekdays(
    current_due: datetime, interval_weeks: int, by_weekdays: list[int]
) -> datetime:
    """Avanza a los días configurados (convención JS: 0=Dom..6=Sáb) respetando `interval_weeks`."""

    def js_dow_to_iso(js: int) -> int:
        return 7 if js == 0 else js

    sorted_iso = sorted({js_dow_to_iso(d) for d in by_weekdays if 0 <= d <= 6})
    if not sorted_iso:
        return current_due + timedelta(days=interval_weeks * 7)

    current_js = (current_due.weekday() + 1) % 7
    current_iso = js_dow_to_iso(current_js)

    next_iso = next((d for d in sorted_iso if d > current_iso), None)
    if next_iso is not None:
        return current_due + timedelta(days=next_iso - current_iso)

    first_iso = sorted_iso[0]
    days_until_next_week = 7 - current_iso + first_iso
    extra_weeks = (interval_weeks - 1) * 7
    return current_due + timedelta(days=days_until_next_week + extra_weeks)


def _normalize_utc(dt: datetime) -> datetime:
    """Ensures a datetime is timezone-aware in UTC."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


async def advance_recurring_task(
    task: Task,
    session: AsyncSession,
    completed_at: datetime | None = None,
) -> Task | None:
    """
    Advances a recurring task supporting both FIXED ('every') and FLOATING ('every!') modes:
    - If not recurring or no recurrence_rule, returns None.
    - In FIXED mode: uses rule.next_due as the next due date and steps from rule.next_due
      (preserving anchor_day_of_month on monthly schedules).
    - In FLOATING mode ('every!'): calculates the next occurrence starting from the actual
      completion timestamp (`completed_at` or `datetime.now(UTC)`).
    - If recurrence_rule.end_date is defined and the candidate due date exceeds end_date, returns None.
    - Marks current task as EstadoTarea.DONE and completed = True.
    - Creates and persists a cloned Task instance in state EstadoTarea.TODO, completed = False.
    - Clones and resets active subtasks (`completada = False`) when `rule.reset_subtasks` is True.
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

    by_weekdays = getattr(rule, "by_weekdays", None)
    is_last_day = bool(getattr(rule, "is_last_day_of_month", False))

    now_utc = _normalize_utc(completed_at) if completed_at is not None else datetime.now(UTC)
    rule_mode = getattr(rule, "mode", RecurrenceMode.FIXED) or RecurrenceMode.FIXED

    if rule_mode == RecurrenceMode.FLOATING:
        # En modo FLOATING ("every!"), el nuevo vencimiento se calcula a partir del momento real de finalización
        anchor_day = now_utc.day
        cloned_due_date = calculate_next_due(
            now_utc,
            rule.frequency,
            rule.interval,
            anchor_day_of_month=anchor_day,
            by_weekdays=by_weekdays,
            is_last_day_of_month=is_last_day,
        )
        subsequent_due = calculate_next_due(
            cloned_due_date,
            rule.frequency,
            rule.interval,
            anchor_day_of_month=anchor_day,
            by_weekdays=by_weekdays,
            is_last_day_of_month=is_last_day,
        )
    else:
        # En modo FIXED ("every"), el nuevo vencimiento sigue la rejilla fija de calendario
        cloned_due_date = rule.next_due
        anchor_day = getattr(rule, "anchor_day_of_month", None)
        if anchor_day is None and task.due_date is not None:
            anchor_day = task.due_date.day
        subsequent_due = calculate_next_due(
            cloned_due_date,
            rule.frequency,
            rule.interval,
            anchor_day_of_month=anchor_day,
            by_weekdays=by_weekdays,
            is_last_day_of_month=is_last_day,
        )

    if rule.end_date is not None:
        next_dt = _normalize_utc(cloned_due_date)
        end_dt = _normalize_utc(rule.end_date)
        if next_dt > end_dt:
            return None

    task.estado = EstadoTarea.DONE
    task.completed = True
    task.updated_at = now_utc
    session.add(task)

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

    # Reiniciar automáticamente el checklist de subtareas activas para el nuevo ciclo
    if getattr(rule, "reset_subtasks", True):
        subtasks_res = await session.exec(
            select(Subtask)
            .where(Subtask.task_id == task.id, Subtask.deleted_at.is_(None))
            .order_by(Subtask.orden)  # type: ignore[arg-type]
        )
        active_subtasks = subtasks_res.all()
        for idx, st in enumerate(active_subtasks):
            cloned_subtask = Subtask(
                task_id=new_task.id,
                titulo=st.titulo,
                completada=False,
                orden=idx,
            )
            session.add(cloned_subtask)

    task.recurrence_rule = None
    rule.task_id = new_task.id
    rule.next_due = subsequent_due
    if rule_mode == RecurrenceMode.FIXED and anchor_day is not None:
        rule.anchor_day_of_month = anchor_day
    new_task.recurrence_rule = rule
    session.add(rule)

    mode_label = "flotante (al completar)" if rule_mode == RecurrenceMode.FLOATING else "fija (calendario)"
    history_entry = TaskHistory(
        task_id=task.id,
        user_id=task.user_id,
        action="RECURRENCE_ADVANCED",
        changes=(
            f"Tarea completada y avanzada automáticamente ({mode_label}) "
            f"a nueva fecha: {new_task.due_date}"
        ),
    )
    session.add(history_entry)

    await session.commit()
    await session.refresh(new_task)
    return new_task

