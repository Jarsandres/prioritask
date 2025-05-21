import json
import uuid
from datetime import datetime
from typing import Dict, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.session import get_session
from app.services.auth import get_current_user
from app.models.task import Task, TaskHistory
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

    # 👉 Diagnóstico: ¿entra al bloque de historial?
    print("📝 Se va a guardar historial de creación de la tarea")

    session.add(history)
    await session.commit()
    return new_task


@router.get("", response_model=list[TaskRead])
async def get_tasks(
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    result = await session.exec(
        select(Task).where(
            Task.user_id == current_user.id,
            Task.deleted_at.is_(None),
            )
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


