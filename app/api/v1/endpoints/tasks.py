import json
import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import asc, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.expression import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models import CategoriaTarea, Room, Tag, TaskAssignment, TaskTag
from app.models.task import EstadoTarea, Task, TaskHistory
from app.models.user import Usuario
from app.schemas.history import TaskHistoryRead
from app.schemas.task import (
    TaskAssignmentCreate,
    TaskAssignmentRead,
    TaskCreate,
    TaskRead,
    TaskUpdate,
)
from app.services.auth import get_current_user
from app.services.task_assignment import TaskAssignmentService

router = APIRouter(prefix="/tasks", tags=["Gestión de tareas"])
room_tasks_router = APIRouter(prefix="/rooms", tags=["Hogar"])


async def _fetch_tasks(
    *,
    session: AsyncSession,
    current_user: Usuario,
    estado: EstadoTarea | None = None,
    categoria: CategoriaTarea | None = None,
    completadas: bool | None = None,
    desde: datetime | None = None,
    hasta: datetime | None = None,
    order_by: str | None = None,
    is_descending: bool = False,
    tag_id: UUID | None = None,
    room_id: UUID | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 10,
) -> list[Task]:
    """Retrieve tasks applying common filters."""
    filters = [Task.user_id == current_user.id, Task.deleted_at.is_(None)]

    if estado:
        filters.append(Task.estado == estado)
    if categoria:
        filters.append(Task.categoria == categoria)
    if completadas is not None:
        filters.append(Task.completed == completadas)
    if desde:
        filters.append(Task.due_date >= desde)
    if hasta:
        filters.append(Task.due_date <= hasta)
    if tag_id:
        filters.append(
            Task.id.in_(select(TaskTag.task_id).where(TaskTag.tag_id == tag_id))
        )
    if room_id:
        filters.append(Task.room_id == room_id)
    if search:
        filters.append(
            Task.titulo.ilike(f"%{search}%") | Task.descripcion.ilike(f"%{search}%")
        )

    if order_by in {"due_date", "peso", "created_at"}:
        order_attr = getattr(Task, order_by)
        order_clause = desc(order_attr) if is_descending else asc(order_attr)
    else:
        order_clause = (
            desc(func.coalesce(Task.created_at, func.now()))
            if is_descending
            else asc(func.coalesce(Task.created_at, func.now()))
        )

    result = await session.exec(
        select(Task)
        .options(selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta))
        .filter(*filters)
        .order_by(order_clause)
        .offset(skip)
        .limit(limit)
    )
    return result.all()

@router.get("", response_model=list[TaskRead], summary="Obtener tareas", description="Obtiene una lista de tareas del usuario actual con filtros opcionales.")
async def get_tasks(
        estado: EstadoTarea | None = Query(None),
        categoria: CategoriaTarea | None = Query(None),
        completadas: bool | None = Query(None),
        desde: datetime | None = Query(None),
        hasta: datetime | None = Query(None),
        search: str | None = Query(None),
        order_by: str | None = Query(None, description="due_date, peso o created_at"),
        is_descending: bool | None = Query(False),
        tag_id: UUID | None = Query(None),
        room_id: UUID | None = Query(None),
        skip: int = Query(0, ge=0),
        limit: int = Query(10, gt=0),
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):

    return await _fetch_tasks(
        session=session,
        current_user=current_user,
        estado=estado,
        categoria=categoria,
        completadas=completadas,
        desde=desde,
        hasta=hasta,
        search=search,
        order_by=order_by,
        is_descending=is_descending,
        tag_id=tag_id,
        room_id=room_id,
        skip=skip,
        limit=limit,
    )


@room_tasks_router.get("/{room_id}/tasks", response_model=list[TaskRead], summary="Obtener tareas de un hogar")
async def get_tasks_by_room(
    room_id: UUID,
    estado: EstadoTarea | None = Query(None),
    categoria: CategoriaTarea | None = Query(None),
    completadas: bool | None = Query(None),
    desde: datetime | None = Query(None),
    hasta: datetime | None = Query(None),
    search: str | None = Query(None),
    order_by: str | None = Query(None, description="due_date, peso o created_at"),
    is_descending: bool | None = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, gt=0),
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    room = await session.get(Room, room_id)
    if not room or room.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Hogar no encontrado")

    tag_result = await session.exec(
        select(Tag).where(Tag.nombre == room.nombre, Tag.user_id == current_user.id)
    )
    tag = tag_result.one_or_none()
    tag_id = tag.id if tag else None

    return await _fetch_tasks(
        session=session,
        current_user=current_user,
        estado=estado,
        categoria=categoria,
        completadas=completadas,
        desde=desde,
        hasta=hasta,
        search=search,
        order_by=order_by,
        is_descending=is_descending,
        tag_id=tag_id,
        skip=skip,
        limit=limit,
    )

async def _get_task_with_access(
    session: AsyncSession,
    task_id: UUID,
    current_user: Usuario,
    allow_collaborator: bool = True,
) -> tuple[Task, bool]:
    """Retrieve task and verify owner or collaborator permissions."""
    result = await session.exec(
        select(Task)
        .options(
            selectinload(Task.colaboradores),
            selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta),
        )
        .where(
            Task.id == task_id,
            Task.deleted_at.is_(None),
        )
    )
    task = result.one_or_none()

    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")

    is_owner = (task.user_id == current_user.id)
    is_collaborator = any(c.user_id == current_user.id for c in task.colaboradores)

    if not is_owner and not (allow_collaborator and is_collaborator):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para acceder a esta tarea")

    return task, is_owner


@router.post("", response_model=TaskRead, status_code=201, summary="Crear tarea", description="Crea una nueva tarea para el usuario actual.")
async def create_task(
        payload: TaskCreate,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    room_id = payload.room_id
    if room_id is not None:
        room = await session.get(Room, room_id)
        if not room or room.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hogar no encontrado")
    else:
        result = await session.exec(
            select(Room.id).where(Room.owner_id == current_user.id)
        )
        first_room = result.first()
        if first_room:
            room_id = first_room[0] if isinstance(first_room, tuple) else first_room
        else:
            try:
                default_room = Room(nombre="Default", owner_id=current_user.id)
                session.add(default_room)
                await session.commit()
            except IntegrityError:
                await session.rollback()
                result = await session.exec(
                    select(Room.id).where(Room.owner_id == current_user.id, Room.nombre == "Default")
                )
                default_room = result.one()
            await session.refresh(default_room)
            room_id = default_room.id

    new_task = Task(
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        categoria=payload.categoria,
        peso=payload.peso,
        due_date=payload.due_date,
        is_recurring=payload.is_recurring,
        user_id=current_user.id,
        room_id=room_id,
    )

    session.add(new_task)
    try:
        await session.commit()
        await session.refresh(new_task)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Ya existe una tarea activa con este título para el usuario.")

    history_entry = TaskHistory(
        task_id=new_task.id,
        user_id=current_user.id,
        action="CREATED",
        changes="Tarea creada inicialmente",
    )

    session.add(history_entry)
    await session.commit()
    return new_task

@router.post("/assign", response_model=TaskAssignmentRead, status_code=201, summary="Asignar tarea", description="Asigna una tarea a otro usuario.")
async def assign_task(
        payload: TaskAssignmentCreate,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    try:
        assignment = await TaskAssignmentService.assign_task(
            session=session,
            task_id=payload.task_id,
            user_id=payload.user_id,
            assigned_by=current_user.id
        )
        return assignment
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        if str(e) == "Task not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/assigned/{user_id}", response_model=list[TaskAssignmentRead], summary="Tareas asignadas", description="Obtiene las tareas asignadas a un usuario específico.")
async def get_assigned_tasks(
        user_id: UUID,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    if current_user.id == user_id or getattr(current_user, "is_superuser", False):
        return await TaskAssignmentService.get_assigned_tasks(session=session, user_id=user_id)

    # Return assignments for user_id on tasks owned by current_user (tenant isolation for task owners)
    tasks_assigned = await TaskAssignmentService.get_assigned_tasks(
        session=session, user_id=user_id, filter_owner_id=current_user.id
    )
    if tasks_assigned:
        return tasks_assigned

    # Check if current_user owns any task in the system
    owner_tasks = await session.exec(
        select(Task.id).where(Task.user_id == current_user.id)
    )
    if owner_tasks.first() is not None:
        return []

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permiso para ver las tareas de este usuario",
    )


@router.get("/history", response_model=list[TaskHistoryRead], summary="Historial de tareas")
async def list_task_history(
    desde: datetime | None = Query(None),
    hasta: datetime | None = Query(None),
    room_id: UUID | None = Query(None),
    user_id: UUID | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    filters = [Task.user_id == current_user.id, Task.deleted_at.is_(None)]
    if desde:
        filters.append(TaskHistory.timestamp >= desde)
    if hasta:
        filters.append(TaskHistory.timestamp <= hasta)
    if user_id:
        filters.append(TaskHistory.user_id == user_id)
    if room_id:
        room = await session.get(Room, room_id)
        if not room or room.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Hogar no encontrado")
        filters.append(Task.room_id == room_id)
    stmt = (
        select(
            TaskHistory.id,
            TaskHistory.task_id,
            TaskHistory.user_id,
            TaskHistory.action,
            TaskHistory.timestamp,
            TaskHistory.changes,
            Task.titulo.label("task_title")
        )
        .join(Task, Task.id == TaskHistory.task_id)
        .where(*filters)
        .order_by(asc(TaskHistory.timestamp))
    )
    result = await session.exec(stmt)
    rows = result.all()

    # Log para depuración
    print("Resultados de la consulta:", rows)

    # Mapear los resultados al modelo TaskHistoryRead
    history = [
        TaskHistoryRead(
            id=row[0],
            task_id=row[1],
            user_id=row[2],
            action=row[3],
            timestamp=row[4],
            changes=row[5],
            task_title=row[6]  # Asegurarse de mapear correctamente el título de la tarea
        )
        for row in rows
    ]
    return history

@router.get("/{task_id}/history", summary="Historial de tarea", description="Obtiene el historial de cambios de una tarea específica. Devuelve un error 404 si la tarea no existe.")
async def get_task_history(
        task_id: str,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID de tarea inválido")

    # Validar propiedad del usuario o colaborador y que la tarea no esté eliminada
    task_result = await session.exec(
        select(Task)
        .options(selectinload(Task.colaboradores))
        .where(
            Task.id == task_uuid,
            Task.deleted_at.is_(None)
        )
    )
    task = task_result.one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Historial no encontrado")

    is_owner = (task.user_id == current_user.id)
    is_collaborator = any(c.user_id == current_user.id for c in task.colaboradores)

    if not is_owner and not is_collaborator:
        raise HTTPException(status_code=404, detail="Historial no encontrado")

    result = await session.exec(
        select(TaskHistory).filter(
            TaskHistory.task_id == task_uuid
        ).order_by(asc(TaskHistory.timestamp))
    )
    history = result.all()
    return history

@router.get("/{task_id}", response_model=TaskRead, summary="Obtener tarea específica", description="Obtiene una tarea específica del usuario actual.")
async def get_task(
        task_id: UUID,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)
    return task

@router.put("/{task_id}", response_model=TaskRead, status_code=status.HTTP_200_OK, summary="Actualizar tarea", description="Actualiza una tarea existente del usuario actual.")
async def update_task(
        task_id: UUID,
        task_in: TaskUpdate,
        current_user: Usuario = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Task)
        .options(
            selectinload(Task.colaboradores),
            selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta),
        )
        .where(
            Task.id == task_id,
            Task.deleted_at.is_(None)
        )
    )
    task = result.one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    is_owner = (task.user_id == current_user.id)
    is_collaborator = any(c.user_id == current_user.id for c in task.colaboradores)

    if not is_owner and not is_collaborator:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    changes: dict[str, Any] = {}
    for field, new_value in task_in.model_dump(exclude_unset=True).items():
        old_value = getattr(task, field)
        if new_value != old_value:
            changes[field] = {"old": old_value, "new": new_value}
            setattr(task, field, new_value)

    if not changes:
        return task

    task.updated_at = datetime.now(UTC)
    session.add(task)

    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action="UPDATED",
        timestamp=datetime.now(UTC),
        changes=json.dumps(changes, default=str),
    )
    session.add(history)

    await session.commit()
    await session.refresh(task)

    return task

@router.delete("/{task_id}", status_code=204, summary="Eliminar tarea", description="Elimina una tarea específica del usuario actual marcándola como eliminada (Soft Delete).")
async def delete_task(
        task_id: UUID,
        current_user: Usuario = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Task)
        .options(selectinload(Task.colaboradores))
        .where(
            Task.id == task_id,
            Task.deleted_at.is_(None)
        )
    )
    task = result.one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    is_owner = (task.user_id == current_user.id)
    is_collaborator = any(c.user_id == current_user.id for c in task.colaboradores)

    if is_collaborator and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el propietario puede eliminar la tarea"
        )

    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarea no encontrada"
        )

    task.deleted_at = datetime.now(UTC)
    session.add(task)

    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action="DELETED",
    )
    session.add(history)
    await session.commit()

class UpdateTaskStatus(BaseModel):
    estado: EstadoTarea

@router.patch("/{task_id}", response_model=TaskRead, summary="Actualizar tarea parcialmente", description="Actualiza parcialmente una tarea, como cambiar su estado.")
async def patch_task(
        task_id: UUID,
        payload: TaskUpdate,  # Usar esquema de validación
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    try:
        result = await session.exec(
            select(Task)
            .options(
                selectinload(Task.colaboradores),
                selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta),
            )
            .where(
                Task.id == task_id,
                Task.deleted_at.is_(None)
            )
        )
        task = result.one_or_none()

        if not task:
            raise HTTPException(status_code=404, detail="Tarea no encontrada.")

        is_owner = (task.user_id == current_user.id)
        is_collaborator = any(c.user_id == current_user.id for c in task.colaboradores)

        if not is_owner and not is_collaborator:
            raise HTTPException(status_code=404, detail="Tarea no encontrada.")

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(task, key, value)

        task.updated_at = datetime.now(UTC)

        session.add(task)

        history = TaskHistory(
            task_id=task.id,
            user_id=current_user.id,
            action="UPDATED",
            changes=json.dumps(update_data, default=str),
        )
        session.add(history)
        await session.commit()
        await session.refresh(task)

        return task
    except HTTPException:
        raise
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

@router.patch("/{task_id}/status", response_model=TaskRead, summary="Actualizar estado de tarea", description="Actualiza el estado de una tarea específica.")
async def patch_task_status(
        task_id: UUID,
        payload: UpdateTaskStatus,  # Usar esquema de validación
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    try:
        result = await session.exec(
            select(Task)
            .options(
                selectinload(Task.colaboradores),
                selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta),
            )
            .where(
                Task.id == task_id,
                Task.deleted_at.is_(None)
            )
        )
        task = result.one_or_none()

        if not task:
            raise HTTPException(status_code=404, detail="Tarea no encontrada.")

        is_owner = (task.user_id == current_user.id)
        is_collaborator = any(c.user_id == current_user.id for c in task.colaboradores)

        if not is_owner and not is_collaborator:
            raise HTTPException(status_code=404, detail="Tarea no encontrada.")

        task.estado = payload.estado
        task.updated_at = datetime.now(UTC)

        session.add(task)

        history = TaskHistory(
            task_id=task.id,
            user_id=current_user.id,
            action="STATUS_UPDATED",
            changes=json.dumps({"estado": payload.estado}, default=str),
        )
        session.add(history)
        await session.commit()
        await session.refresh(task)

        return task
    except HTTPException:
        raise
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

@router.delete("/{task_id}/assignees/{user_id}", status_code=204, summary="Eliminar asignación de tarea", description="Elimina la asignación de una tarea a un usuario específico.")
async def remove_task_assignment(
        task_id: UUID,
        user_id: UUID,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    # Verificar que la tarea existe y no está eliminada
    result_task = await session.exec(
        select(Task).where(
            Task.id == task_id,
            Task.deleted_at.is_(None)
        )
    )
    task = result_task.one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")

    # Solo el propietario de la tarea o el propio usuario asignado pueden eliminar la asignación
    if task.user_id != current_user.id and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para modificar asignaciones de esta tarea"
        )

    # Verificar existencia de la asignación
    result = await session.exec(
        select(TaskAssignment).where(
            TaskAssignment.task_id == task_id,
            TaskAssignment.user_id == user_id
        )
    )
    assignment = result.one_or_none()

    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asignación no encontrada")

    # Eliminar la asignación
    await session.delete(assignment)
    await session.commit()
