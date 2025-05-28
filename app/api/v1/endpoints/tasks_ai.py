from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from sqlalchemy.sql.expression import or_
from typing import List

from app.db.session import get_session
from app.models.task import Task
from app.models.user import Usuario
from app.schemas.task import PrioritizedTask, TaskPrioritizeRequest, GroupedTasksResponse, TaskGroupRequest, TaskRewriteRequest, RewrittenTask
from app.services.auth import get_current_user
from app.services.intelligence import prioritize_tasks_mock as prioritize_tasks, group_tasks_mock, rewrite_tasks_mock
from app.schemas.responses import PRIORITIZED_TASK_EXAMPLE, GROUPED_TASKS_EXAMPLE, REWRITTEN_TASK_EXAMPLE

router = APIRouter(prefix="/tasks/ai", tags=["Tareas con IA"])

@router.post("/prioritize", response_model=List[PrioritizedTask], summary="Priorizar tareas", description="Prioriza las tareas del usuario autenticado según criterios específicos.",
              responses={200: {"description": "Ejemplo de respuesta", "content": {"application/json": {"example": PRIORITIZED_TASK_EXAMPLE}}}})
async def prioritize(
        payload: TaskPrioritizeRequest,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    stmt = select(Task).where(Task.user_id == current_user.id)
    if payload.task_ids:
        stmt = stmt.where(or_(*[Task.id == task_id for task_id in payload.task_ids]))

    tasks = (await session.exec(stmt)).all()
    if not tasks:
        raise HTTPException(status_code=404, detail="No se encontraron tareas.")

    result = await prioritize_tasks(tasks)
    return result

@router.post("/group", response_model=GroupedTasksResponse, summary="Agrupar tareas", description="Agrupa las tareas del usuario autenticado en categorías específicas.",
              responses={200: {"description": "Ejemplo de respuesta", "content": {"application/json": {"example": GROUPED_TASKS_EXAMPLE}}}})
async def group_tasks(
        payload: TaskGroupRequest,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    stmt = select(Task).where(Task.user_id == current_user.id)
    if payload.task_ids:
        stmt = stmt.where(Task.id.in_(payload.task_ids))

    tasks = (await session.exec(stmt)).all()
    if not tasks:
        raise HTTPException(status_code=404, detail="No se encontraron tareas.")

    result = await group_tasks_mock(tasks)
    return {"grupos": result}

@router.post("/rewrite", response_model=List[RewrittenTask], summary="Reescribir tareas", description="Reescribe las tareas del usuario autenticado para mejorar su claridad y enfoque.",
              responses={200: {"description": "Ejemplo de respuesta", "content": {"application/json": {"example": REWRITTEN_TASK_EXAMPLE}}}})
async def rewrite_tasks(
        payload: TaskRewriteRequest,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    stmt = select(Task).where(Task.user_id == current_user.id)
    if payload.task_ids:
        stmt = stmt.where(Task.id.in_(payload.task_ids))

    tasks = (await session.exec(stmt)).all()
    if not tasks:
        raise HTTPException(status_code=404, detail="No se encontraron tareas.")

    result = await rewrite_tasks_mock(tasks)
    return result

