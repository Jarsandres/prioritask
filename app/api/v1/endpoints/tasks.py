import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from sqlalchemy.exc import IntegrityError

from app.db.session import get_session
from app.models import CategoriaTarea
from app.services.auth import get_current_user
from app.models.task import Task, TaskHistory, EstadoTarea
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate, TaskAssignmentCreate, TaskAssignmentRead
from app.models.user import Usuario
from app.services.task_assignment import TaskAssignmentService

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("", response_model=TaskRead, status_code=201)
async def create_task(
        payload: TaskCreate,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    new_task = Task(
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        categoria=payload.categoria,
        peso=payload.peso,
        due_date=payload.due_date,
        user_id=current_user.id,
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


@router.get("", response_model=list[TaskRead])
async def get_tasks(
        estado: Optional[EstadoTarea] = Query(None),
        categoria: Optional[CategoriaTarea] = Query(None),
        completadas: Optional[bool] = Query(None),
        desde: Optional[datetime] = Query(None),
        hasta: Optional[datetime] = Query(None),
        order_by: Optional[str] = Query(None, description="due_date, peso o created_at"),
        is_descending: Optional[bool] = Query(False),
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):

    filters = [
        Task.user_id == current_user.id,
    ]

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

    # Corrección en la lógica de ordenamiento
    if order_by in {"due_date", "peso", "created_at"}:
        order_attr = getattr(Task, order_by)
        order_clause = order_attr.desc() if is_descending else order_attr.asc()
    else:
        order_clause = Task.created_at.desc()

    result = await session.exec(
        select(Task).filter(
            *filters
        ).order_by(order_clause)
    )
    return result.all()


@router.put("/{task_id}", response_model=TaskRead, status_code=status.HTTP_200_OK)
async def update_task(
        task_id: UUID,
        task_in: TaskUpdate,
        current_user: Usuario = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == current_user.id,
            Task.deleted_at.is_(None),
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

@router.get("/{task_id}/history")
async def get_task_history(
        task_id: str,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID inválido")

    result = await session.exec(
        select(TaskHistory).where(TaskHistory.task_id == task_uuid)
    )
    history = result.all()
    return history

@router.delete("/{task_id}", status_code=204)
async def delete_task(
        task_id: UUID,
        current_user: Usuario = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == current_user.id,
            Task.deleted_at.is_(None),
        )
    )
    task = result.one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    # Borrado lógico
    task.deleted_at = datetime.now(timezone.utc)
    task.updated_at = datetime.now(timezone.utc)
    session.add(task)

    # Historial

    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action="DELETED",
        timestamp=datetime.now(timezone.utc),
    )
    session.add(history)
    await session.commit()
    await session.refresh(task)

@router.post("/assign", response_model=TaskAssignmentRead, status_code=201)
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

@router.get("/assigned/{user_id}", response_model=List[TaskAssignmentRead])
async def get_assigned_tasks(
        user_id: UUID,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    return await TaskAssignmentService.get_assigned_tasks(session=session, user_id=user_id)
