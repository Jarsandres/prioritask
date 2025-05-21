import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status , Query
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.session import get_session
from app.models import CategoriaTarea
from app.services.auth import get_current_user
from app.models.task import Task, TaskHistory, EstadoTarea
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.models.user import Usuario

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
    await session.commit()
    await session.refresh(new_task)

    print("Se ha creado la tarea")

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
        estado : Optional[EstadoTarea] = Query(None),
        categoria: Optional[CategoriaTarea] = Query(None),
        completadas: Optional[bool] = Query(None),
        desde: Optional[datetime] = Query(None),
        hasta: Optional[datetime] = Query(None),
        order_by: Optional[str] = Query(None, description="due_date, peso o created_at"),
        desc: Optional[bool] = Query(False),
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):

    filters = [
        Task.user_id == current_user.id,
        Task.deleted_at.is_(None),
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

    if order_by in {"due_date", "peso", "created_at"}:
        order_attr = getattr(Task, order_by)
        order_clause = order_attr.desc() if desc else order_attr.asc()
    else:
        order_clause = Task.created_at.desc()

    result = await session.exec(
        select(Task).where(
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

    task.updated_at = datetime.utcnow()
    session.add(task)

    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action="UPDATED",
        timestamp=datetime.utcnow(),
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

@router.delete("/{task_id}", status_code= 204)
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
    task.deleted_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    session.add(task)

    #Historial

    history = TaskHistory(
        task_id= task.id,
        user_id = current_user.id,
        action = "DELETED",
        timestamp = datetime.utcnow(),
    )
    session.add(history)
    await session.commit()
    await session.refresh(task)


