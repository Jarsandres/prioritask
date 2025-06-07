import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import desc, asc
from sqlalchemy.sql.expression import func
from app.db.session import get_session
from app.models import CategoriaTarea, TaskTag, TaskAssignment, Tag, Room
from app.services.auth import get_current_user
from app.models.task import Task, TaskHistory, EstadoTarea
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate, TaskAssignmentCreate, TaskAssignmentRead
from app.models.user import Usuario
from app.services.task_assignment import TaskAssignmentService
from app.schemas.responses import ERROR_BAD_REQUEST, ERROR_FORBIDDEN
from pydantic import BaseModel, ValidationError

router = APIRouter(prefix="/tasks", tags=["Gestión de tareas"])
room_tasks_router = APIRouter(prefix="/rooms", tags=["Hogar"])


async def _fetch_tasks(
    *,
    session: AsyncSession,
    current_user: Usuario,
    estado: Optional[EstadoTarea] = None,
    categoria: Optional[CategoriaTarea] = None,
    completadas: Optional[bool] = None,
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    order_by: Optional[str] = None,
    is_descending: bool = False,
    tag_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 10,
) -> List[Task]:
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
        estado: Optional[EstadoTarea] = Query(None),
        categoria: Optional[CategoriaTarea] = Query(None),
        completadas: Optional[bool] = Query(None),
        desde: Optional[datetime] = Query(None),
        hasta: Optional[datetime] = Query(None),
        order_by: Optional[str] = Query(None, description="due_date, peso o created_at"),
        is_descending: Optional[bool] = Query(False),
        tag_id: Optional[UUID] = Query(None),
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
        order_by=order_by,
        is_descending=is_descending,
        tag_id=tag_id,
        skip=skip,
        limit=limit,
    )


@room_tasks_router.get("/{room_id}/tasks", response_model=list[TaskRead], summary="Obtener tareas de un hogar")
async def get_tasks_by_room(
    room_id: UUID,
    estado: Optional[EstadoTarea] = Query(None),
    categoria: Optional[CategoriaTarea] = Query(None),
    completadas: Optional[bool] = Query(None),
    desde: Optional[datetime] = Query(None),
    hasta: Optional[datetime] = Query(None),
    order_by: Optional[str] = Query(None, description="due_date, peso o created_at"),
    is_descending: Optional[bool] = Query(False),
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
        order_by=order_by,
        is_descending=is_descending,
        tag_id=tag_id,
        skip=skip,
        limit=limit,
    )

@router.post("", response_model=TaskRead, status_code=201, summary="Crear tarea", description="Crea una nueva tarea para el usuario actual.")
async def create_task(
        payload: TaskCreate,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    room_id = payload.room_id
    if room_id is None:
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

    history = TaskHistory(
        task_id=new_task.id,
        user_id=current_user.id,
        action="CREATED",
    )

    session.add(history)
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/assigned/{user_id}", response_model=List[TaskAssignmentRead], summary="Tareas asignadas", description="Obtiene las tareas asignadas a un usuario específico.")
async def get_assigned_tasks(
        user_id: UUID,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    return await TaskAssignmentService.get_assigned_tasks(session=session, user_id=user_id)

@router.get("/{task_id}/history", summary="Historial de tarea", description="Obtiene el historial de cambios de una tarea específica. Devuelve un error 404 si la tarea no existe.")
async def get_task_history(
        task_id: str,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        return ERROR_BAD_REQUEST

    result = await session.exec(
        select(TaskHistory).filter(
            TaskHistory.task_id == task_uuid
        ).order_by(asc(TaskHistory.timestamp))
    )  # Ajuste para usar Select correctamente
    history = result.all()
    if not history:
        raise HTTPException(status_code=404, detail="Historial no encontrado")
    return history

@router.get("/{task_id}", response_model=TaskRead, summary="Obtener tarea específica", description="Obtiene una tarea específica del usuario actual.")
async def get_task(
        task_id: UUID,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    result = await session.exec(
        select(Task)
        .options(selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta))
        .where(
            Task.id == task_id,
            Task.deleted_at.is_(None)
        )
    )
    task = result.one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    if task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para acceder a esta tarea")

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
        .options(selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta))
        .where(
            Task.id == task_id,
            Task.user_id == current_user.id,
            Task.deleted_at.is_(None)
        )
    )
    task = result.one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    changes: Dict[str, Any] = {}
    for field, new_value in task_in.model_dump(exclude_unset=True).items():
        old_value = getattr(task, field)
        if new_value != old_value:
            changes[field] = {"old": old_value, "new": new_value}
            setattr(task, field, new_value)

    if not changes:
        return task

    task.updated_at = datetime.now(timezone.utc)
    session.add(task)

    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action="UPDATED",
        timestamp=datetime.now(timezone.utc),
        changes=json.dumps(changes, default=str),
    )
    session.add(history)

    await session.commit()
    await session.refresh(task)

    return task

@router.delete("/{task_id}", status_code=204, summary="Eliminar tarea", description="Elimina una tarea específica del usuario actual. Devuelve un error 403 si el usuario no tiene permisos para eliminar la tarea.")
async def delete_task(
        task_id: UUID,
        current_user: Usuario = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == current_user.id,
            Task.deleted_at.is_(None)
        )
    )
    task = result.one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    if task.user_id != current_user.id:
        return ERROR_FORBIDDEN

    await session.delete(task)
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
            .options(selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta))
            .where(
                Task.id == task_id,
                Task.deleted_at.is_(None),
                Task.user_id == current_user.id
            )
        )
        task = result.one_or_none()

        if not task:
            raise HTTPException(status_code=404, detail="Tarea no encontrada.")

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(task, key, value)

        task.updated_at = datetime.now(timezone.utc)

        session.add(task)
        await session.commit()
        await session.refresh(task)

        history = TaskHistory(
            task_id=task.id,
            user_id=current_user.id,
            action="UPDATED",
            changes=json.dumps(update_data, default=str),
        )
        session.add(history)
        await session.commit()

        return task
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
            .options(selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta))
            .where(
                Task.id == task_id,
                Task.user_id == current_user.id,
                Task.deleted_at.is_(None)
            )
        )
        task = result.one_or_none()

        if not task:
            raise HTTPException(status_code=404, detail="Tarea no encontrada.")

        task.estado = payload.estado
        task.updated_at = datetime.now(timezone.utc)

        session.add(task)
        await session.commit()
        await session.refresh(task)

        history = TaskHistory(
            task_id=task.id,
            user_id=current_user.id,
            action="STATUS_UPDATED",
            changes=json.dumps({"estado": payload.estado}, default=str),
        )
        session.add(history)
        await session.commit()

        return task
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

@router.delete("/{task_id}/assignees/{user_id}", status_code=204, summary="Eliminar asignación de tarea", description="Elimina la asignación de una tarea a un usuario específico.")
async def remove_task_assignment(
        task_id: UUID,
        user_id: UUID,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    # Verificar existencia de la asignación
    result = await session.exec(
        select(TaskAssignment).where(
            TaskAssignment.task_id == task_id,
            TaskAssignment.user_id == user_id
        )
    )
    assignment = result.one_or_none()

    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")

    # Eliminar la asignación
    await session.delete(assignment)
    await session.commit()
