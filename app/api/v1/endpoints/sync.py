import json
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.v1.endpoints.tasks import (
    _build_recurrence_rule_for_task,
    _fetch_tasks,
    _get_task_with_access,
)
from app.db.session import get_session
from app.models import CategoriaTarea, Room, RoomMember
from app.models.task import EstadoTarea, ProcessedSyncCommand, Task, TaskHistory
from app.models.user import Usuario
from app.schemas.sync import (
    SyncBatchRequest,
    SyncBatchResponse,
    SyncCommandError,
    SyncCommandIn,
)
from app.schemas.task import RecurrenceRuleInput, TaskRead
from app.services.auth import get_current_user
from app.services.events import event_broadcaster
from app.services.gamification import award_task_points

router = APIRouter(prefix="/sync", tags=["Gestión de tareas"])

_MUTABLE_TASK_FIELDS = {
    "titulo",
    "descripcion",
    "categoria",
    "estado",
    "peso",
    "due_date",
    "reminder_at",
    "completed",
    "is_recurring",
}


def _parse_datetime_utc(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    if isinstance(value, (int, float)):
        ts = value / 1000.0 if value > 1e11 else float(value)
        return datetime.fromtimestamp(ts, tz=UTC)
    if isinstance(value, str):
        dt = datetime.fromisoformat(value)
        return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)
    raise ValueError("Formato de fecha inválido")


async def _resolve_room_for_user(
    session: AsyncSession,
    current_user: Usuario,
    requested_room_id: UUID | None,
) -> UUID:
    if requested_room_id is not None:
        room = await session.get(Room, requested_room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Hogar no encontrado")
        if room.owner_id != current_user.id:
            member_res = await session.exec(
                select(RoomMember).where(
                    RoomMember.room_id == requested_room_id,
                    RoomMember.user_id == current_user.id,
                )
            )
            if member_res.first() is None:
                raise HTTPException(status_code=404, detail="Hogar no encontrado")
        return requested_room_id

    result = await session.exec(
        select(Room.id).where(Room.owner_id == current_user.id)
    )
    first_room = result.first()
    if first_room:
        return first_room[0] if isinstance(first_room, tuple) else first_room

    try:
        default_room = Room(nombre="Default", owner_id=current_user.id)
        session.add(default_room)
        await session.flush()
        return default_room.id
    except IntegrityError:
        await session.rollback()
        result = await session.exec(
            select(Room.id).where(
                Room.owner_id == current_user.id, Room.nombre == "Default"
            )
        )
        first_room = result.first()
        return first_room[0] if isinstance(first_room, tuple) else first_room


def _extract_candidate_fields(cmd: SyncCommandIn) -> dict[str, Any]:
    if cmd.type == "task_complete":
        return {"completed": True, "estado": EstadoTarea.DONE}
    if cmd.type == "task_uncomplete":
        return {"completed": False, "estado": EstadoTarea.TODO}
    if cmd.type == "task_schedule_reminder":
        return {"reminder_at": _parse_datetime_utc(cmd.args.get("reminder_at"))}

    candidates: dict[str, Any] = {}
    for key, val in cmd.args.items():
        if key not in _MUTABLE_TASK_FIELDS:
            continue
        if key == "titulo":
            if not isinstance(val, str) or not (3 <= len(val.strip()) <= 100):
                raise ValueError("El título debe tener entre 3 y 100 caracteres")
            candidates[key] = val
        elif key == "descripcion":
            if val is not None and (not isinstance(val, str) or len(val) > 500):
                raise ValueError("La descripción no puede superar 500 caracteres")
            candidates[key] = val
        elif key == "categoria":
            candidates[key] = val if isinstance(val, CategoriaTarea) else CategoriaTarea(val)
        elif key == "estado":
            candidates[key] = val if isinstance(val, EstadoTarea) else EstadoTarea(val)
        elif key == "peso":
            peso_val = float(val)
            if peso_val <= 0 or peso_val >= 100:
                raise ValueError("El peso debe ser mayor a 0 y menor a 100")
            candidates[key] = peso_val
        elif key in {"due_date", "reminder_at"}:
            candidates[key] = _parse_datetime_utc(val)
        elif key in {"completed", "is_recurring"}:
            candidates[key] = bool(val)
    return candidates


def _resolve_task_uuid(
    cmd: SyncCommandIn, temp_id_mapping: dict[str, str]
) -> UUID:
    raw_id = cmd.args.get("id") or cmd.args.get("task_id") or cmd.temp_id
    if not raw_id:
        raise ValueError("Falta el identificador de la tarea")
    resolved_str = temp_id_mapping.get(str(raw_id), str(raw_id))
    return UUID(resolved_str)


@router.post(
    "/batch",
    response_model=SyncBatchResponse,
    summary="Sincronización por lotes offline-first",
    description="Procesa una cola de comandos offline con idempotencia, control de concurrencia optimista (OCC) y fusión por campo con HLC.",
)
async def sync_batch(
    payload: SyncBatchRequest,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> SyncBatchResponse:
    sync_status: dict[str, Literal["ok"] | SyncCommandError] = {}
    temp_id_mapping: dict[str, str] = {}
    pending_events: list[tuple[UUID, str, dict[str, Any]]] = []
    touched_tasks: dict[UUID, Task] = {}

    for cmd in payload.commands:
        existing_cmd = await session.get(ProcessedSyncCommand, cmd.uuid)
        if existing_cmd is not None:
            if existing_cmd.user_id != current_user.id:
                sync_status[cmd.uuid] = SyncCommandError(
                    error_code=403,
                    error="UUID de comando ya registrado por otro usuario",
                    error_tag="FORBIDDEN",
                    retryable=False,
                )
                continue

            sync_status[cmd.uuid] = "ok"
            if cmd.temp_id and existing_cmd.task_id:
                temp_id_mapping[cmd.temp_id] = str(existing_cmd.task_id)
            raw_arg_temp = cmd.args.get("temp_id") or cmd.args.get("id")
            if isinstance(raw_arg_temp, str) and existing_cmd.task_id:
                temp_id_mapping[raw_arg_temp] = str(existing_cmd.task_id)
            continue

        if cmd.type == "task_create":
            try:
                titulo = cmd.args.get("titulo")
                if not isinstance(titulo, str) or not (3 <= len(titulo.strip()) <= 100):
                    raise ValueError("El título debe tener entre 3 y 100 caracteres")

                raw_cat = cmd.args.get("categoria", CategoriaTarea.OTRO)
                categoria = (
                    raw_cat
                    if isinstance(raw_cat, CategoriaTarea)
                    else CategoriaTarea(raw_cat)
                )
                raw_estado = cmd.args.get("estado", EstadoTarea.TODO)
                estado = (
                    raw_estado
                    if isinstance(raw_estado, EstadoTarea)
                    else EstadoTarea(raw_estado)
                )
                peso = float(cmd.args.get("peso", 1.0))
                due_date = _parse_datetime_utc(cmd.args.get("due_date"))
                reminder_at = _parse_datetime_utc(cmd.args.get("reminder_at"))
                completed = bool(cmd.args.get("completed", estado == EstadoTarea.DONE))
                if completed:
                    estado = EstadoTarea.DONE

                raw_room_id = cmd.args.get("room_id") or payload.room_id
                target_room_uuid = (
                    UUID(str(raw_room_id)) if raw_room_id is not None else None
                )
                room_id = await _resolve_room_for_user(
                    session, current_user, target_room_uuid
                )

                rec_rule_raw = cmd.args.get("recurrence_rule")
                rec_rule_in = (
                    RecurrenceRuleInput.model_validate(rec_rule_raw)
                    if isinstance(rec_rule_raw, dict)
                    else None
                )
                is_recurring = bool(
                    cmd.args.get("is_recurring", False) or rec_rule_in is not None
                )

                initial_hlc: dict[str, str] = {}
                if isinstance(cmd.field_hlc, dict):
                    initial_hlc.update(cmd.field_hlc)
                elif cmd.hlc_timestamp:
                    for k in ("titulo", "descripcion", "categoria", "estado", "peso", "due_date", "reminder_at", "completed"):
                        if k in cmd.args:
                            initial_hlc[k] = cmd.hlc_timestamp

                new_task = Task(
                    titulo=titulo,
                    descripcion=cmd.args.get("descripcion"),
                    categoria=categoria,
                    estado=estado,
                    peso=peso,
                    completed=completed,
                    due_date=due_date,
                    reminder_at=reminder_at,
                    is_recurring=is_recurring,
                    version=1,
                    field_hlc=initial_hlc,
                    user_id=current_user.id,
                    room_id=room_id,
                )
                session.add(new_task)
                await session.flush()

                if is_recurring:
                    rec_rule = _build_recurrence_rule_for_task(new_task, rec_rule_in)
                    session.add(rec_rule)

                session.add(
                    TaskHistory(
                        task_id=new_task.id,
                        user_id=current_user.id,
                        action="CREATED",
                        changes="Tarea creada mediante sincronización por lotes",
                    )
                )
                session.add(
                    ProcessedSyncCommand(
                        command_uuid=cmd.uuid,
                        user_id=current_user.id,
                        room_id=new_task.room_id,
                        task_id=new_task.id,
                        command_type=cmd.type,
                        status="ok",
                    )
                )
                await session.flush()
                await session.refresh(
                    new_task, ["etiquetas", "subtasks", "colaboradores", "recurrence_rule"]
                )

                if cmd.temp_id:
                    temp_id_mapping[cmd.temp_id] = str(new_task.id)
                arg_temp = cmd.args.get("temp_id") or cmd.args.get("id")
                if isinstance(arg_temp, str) and arg_temp != str(new_task.id):
                    temp_id_mapping[arg_temp] = str(new_task.id)

                sync_status[cmd.uuid] = "ok"
                touched_tasks[new_task.id] = new_task
                if new_task.room_id:
                    pending_events.append(
                        (
                            new_task.room_id,
                            "TASK_CREATED",
                            TaskRead.model_validate(new_task).model_dump(mode="json"),
                        )
                    )
            except HTTPException as exc:
                sync_status[cmd.uuid] = SyncCommandError(
                    error_code=exc.status_code,
                    error=str(exc.detail),
                    error_tag="ENTITY_NOT_FOUND" if exc.status_code == 404 else "FORBIDDEN",
                    retryable=False,
                )
            except IntegrityError:
                await session.rollback()
                sync_status[cmd.uuid] = SyncCommandError(
                    error_code=422,
                    error="Ya existe una tarea activa con este título para el usuario.",
                    error_tag="VALIDATION_ERROR",
                    retryable=False,
                )
            except (ValueError, TypeError) as exc:
                sync_status[cmd.uuid] = SyncCommandError(
                    error_code=422,
                    error=str(exc),
                    error_tag="VALIDATION_ERROR",
                    retryable=False,
                )
            continue

        if cmd.type == "task_delete":
            try:
                task_uuid = _resolve_task_uuid(cmd, temp_id_mapping)
            except ValueError as exc:
                sync_status[cmd.uuid] = SyncCommandError(
                    error_code=422,
                    error=str(exc),
                    error_tag="VALIDATION_ERROR",
                    retryable=False,
                )
                continue

            result = await session.exec(
                select(Task)
                .options(selectinload(Task.colaboradores))
                .where(Task.id == task_uuid, Task.deleted_at.is_(None))
            )
            task = result.one_or_none()
            if not task or task.user_id != current_user.id:
                sync_status[cmd.uuid] = SyncCommandError(
                    error_code=404,
                    error="Tarea no encontrada",
                    error_tag="ENTITY_NOT_FOUND",
                    retryable=False,
                )
                continue

            task.deleted_at = datetime.now(UTC)
            task.updated_at = datetime.now(UTC)
            task.version = (task.version or 1) + 1
            session.add(task)
            session.add(
                TaskHistory(
                    task_id=task.id,
                    user_id=current_user.id,
                    action="DELETED",
                )
            )
            session.add(
                ProcessedSyncCommand(
                    command_uuid=cmd.uuid,
                    user_id=current_user.id,
                    room_id=task.room_id,
                    task_id=task.id,
                    command_type=cmd.type,
                    status="ok",
                )
            )
            await session.flush()
            sync_status[cmd.uuid] = "ok"
            touched_tasks.pop(task.id, None)
            if task.room_id:
                pending_events.append(
                    (
                        task.room_id,
                        "TASK_DELETED",
                        {
                            "id": str(task.id),
                            "task_id": str(task.id),
                            "room_id": str(task.room_id),
                        },
                    )
                )
            continue

        # Mutaciones sobre tareas existentes: task_update, task_complete, task_uncomplete, task_schedule_reminder
        try:
            task_uuid = _resolve_task_uuid(cmd, temp_id_mapping)
        except ValueError as exc:
            sync_status[cmd.uuid] = SyncCommandError(
                error_code=422,
                error=str(exc),
                error_tag="VALIDATION_ERROR",
                retryable=False,
            )
            continue

        try:
            task, _ = await _get_task_with_access(
                session, task_uuid, current_user, allow_collaborator=True
            )
        except HTTPException:
            sync_status[cmd.uuid] = SyncCommandError(
                error_code=404,
                error="Tarea no encontrada",
                error_tag="ENTITY_NOT_FOUND",
                retryable=False,
            )
            continue

        try:
            candidate_fields = _extract_candidate_fields(cmd)
        except (ValueError, TypeError) as exc:
            sync_status[cmd.uuid] = SyncCommandError(
                error_code=422,
                error=str(exc),
                error_tag="VALIDATION_ERROR",
                retryable=False,
            )
            continue

        was_completed = bool(task.completed)
        server_version = task.version or 1
        is_conflict = False

        if cmd.base_version is not None and cmd.base_version < server_version:
            is_conflict = True

        expected_updated_raw = cmd.args.get("expected_updated_at")
        if expected_updated_raw is not None and task.updated_at is not None:
            try:
                expected_dt = _parse_datetime_utc(expected_updated_raw)
                task_updated_utc = (
                    task.updated_at
                    if task.updated_at.tzinfo
                    else task.updated_at.replace(tzinfo=UTC)
                )
                if expected_dt is not None and expected_dt < task_updated_utc:
                    is_conflict = True
            except ValueError:
                pass

        current_field_hlc = dict(task.field_hlc or {})
        applied_changes: dict[str, Any] = {}

        if is_conflict:
            has_hlc = bool(cmd.field_hlc or cmd.hlc_timestamp)
            if has_hlc:
                for field, new_val in candidate_fields.items():
                    incoming_hlc = (cmd.field_hlc or {}).get(field) or cmd.hlc_timestamp
                    server_field_hlc = current_field_hlc.get(field)
                    if server_field_hlc is None or (
                        incoming_hlc is not None and incoming_hlc >= server_field_hlc
                    ):
                        old_val = getattr(task, field, None)
                        setattr(task, field, new_val)
                        applied_changes[field] = {"old": old_val, "new": new_val}
                        if incoming_hlc is not None:
                            current_field_hlc[field] = incoming_hlc
            else:
                task_updated_utc = (
                    task.updated_at
                    if task.updated_at and task.updated_at.tzinfo
                    else (task.updated_at or datetime.now(UTC)).replace(tzinfo=UTC)
                )
                server_ts_ms = int(task_updated_utc.timestamp() * 1000)
                if cmd.timestamp >= server_ts_ms:
                    for field, new_val in candidate_fields.items():
                        old_val = getattr(task, field, None)
                        setattr(task, field, new_val)
                        applied_changes[field] = {"old": old_val, "new": new_val}

            if "completed" in applied_changes and "estado" not in applied_changes:
                task.estado = EstadoTarea.DONE if task.completed else EstadoTarea.TODO
            elif "estado" in applied_changes and "completed" not in applied_changes:
                task.completed = task.estado == EstadoTarea.DONE

            if applied_changes:
                task.field_hlc = current_field_hlc
                task.version = (task.version or 1) + 1
                task.updated_at = datetime.now(UTC)
                session.add(task)
                session.add(
                    TaskHistory(
                        task_id=task.id,
                        user_id=current_user.id,
                        action="UPDATED",
                        timestamp=datetime.now(UTC),
                        changes=json.dumps(applied_changes, default=str),
                    )
                )

            session.add(
                ProcessedSyncCommand(
                    command_uuid=cmd.uuid,
                    user_id=current_user.id,
                    room_id=task.room_id,
                    task_id=task.id,
                    command_type=cmd.type,
                    status="conflict_reconciled",
                )
            )
            await session.flush()
            await session.refresh(
                task, ["etiquetas", "subtasks", "colaboradores", "recurrence_rule"]
            )

            if not was_completed and task.completed:
                await award_task_points(task, current_user, session)

            validated_task = TaskRead.model_validate(task)
            sync_status[cmd.uuid] = SyncCommandError(
                error_code=409,
                error="Conflicto de estado detectado y reconciliado con el servidor",
                error_tag="CONFLICT_STALE_TIMESTAMP",
                retryable=False,
                server_record=validated_task,
            )
            touched_tasks[task.id] = task
            if applied_changes and task.room_id:
                pending_events.append(
                    (
                        task.room_id,
                        "TASK_UPDATED",
                        validated_task.model_dump(mode="json"),
                    )
                )
            continue

        # Sin conflicto: aplicación directa
        for field, new_val in candidate_fields.items():
            old_val = getattr(task, field, None)
            if new_val != old_val:
                applied_changes[field] = {"old": old_val, "new": new_val}
            setattr(task, field, new_val)
            incoming_hlc = (cmd.field_hlc or {}).get(field) or cmd.hlc_timestamp
            if incoming_hlc is not None:
                current_field_hlc[field] = incoming_hlc

        if isinstance(cmd.field_hlc, dict):
            current_field_hlc.update(cmd.field_hlc)

        if "completed" in candidate_fields and "estado" not in candidate_fields:
            task.estado = EstadoTarea.DONE if task.completed else EstadoTarea.TODO
        elif "estado" in candidate_fields and "completed" not in candidate_fields:
            task.completed = task.estado == EstadoTarea.DONE

        task.field_hlc = current_field_hlc
        task.version = (task.version or 1) + 1
        task.updated_at = datetime.now(UTC)
        session.add(task)
        session.add(
            TaskHistory(
                task_id=task.id,
                user_id=current_user.id,
                action="UPDATED",
                timestamp=datetime.now(UTC),
                changes=json.dumps(applied_changes, default=str),
            )
        )
        session.add(
            ProcessedSyncCommand(
                command_uuid=cmd.uuid,
                user_id=current_user.id,
                room_id=task.room_id,
                task_id=task.id,
                command_type=cmd.type,
                status="ok",
            )
        )
        await session.flush()
        await session.refresh(
            task, ["etiquetas", "subtasks", "colaboradores", "recurrence_rule"]
        )

        if not was_completed and task.completed:
            await award_task_points(task, current_user, session)

        sync_status[cmd.uuid] = "ok"
        touched_tasks[task.id] = task
        if task.room_id:
            pending_events.append(
                (
                    task.room_id,
                    "TASK_UPDATED",
                    TaskRead.model_validate(task).model_dump(mode="json"),
                )
            )

    await session.commit()

    for room_id, event_type, event_payload in pending_events:
        await event_broadcaster.broadcast(room_id, event_type, event_payload)

    full_sync = payload.sync_token == "*" or not payload.sync_token
    fetched_tasks = await _fetch_tasks(
        session=session,
        current_user=current_user,
        room_id=payload.room_id,
        limit=100,
        is_room_scoped=False,
    )
    items_by_id: dict[UUID, TaskRead] = {
        t.id: TaskRead.model_validate(t) for t in fetched_tasks
    }
    for t_id, t_obj in touched_tasks.items():
        if t_obj.deleted_at is None:
            items_by_id[t_id] = TaskRead.model_validate(t_obj)

    return SyncBatchResponse(
        sync_token=datetime.now(UTC).isoformat(),
        full_sync=full_sync,
        sync_status=sync_status,
        temp_id_mapping=temp_id_mapping,
        items=list(items_by_id.values()),
    )
