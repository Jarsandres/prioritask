from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from typing import List
from app.db.session import get_session
from app.schemas.task import GroupedTasks
from app.models.task import Task
from app.models.user import Usuario
from app.schemas.task import (
    PrioritizedTask,
    GroupedTasksResponse,
    TaskGroupRequest,
    TaskRewriteRequest,
    RewrittenTask,
    PrioritySuggestRequest,
    PrioritySuggestion,
)
from app.services.auth import get_current_user
from app.schemas.responses import PRIORITIZED_TASK_EXAMPLE, GROUPED_TASKS_EXAMPLE, REWRITTEN_TASK_EXAMPLE
from app.services.AI.priority_classifier import clasificar_prioridad
from app.services.AI.reformulator import reformular_titulo_con_traduccion
from app.services.AI.task_organizer import agrupar_tareas_por_similitud
from datetime import datetime, timezone, timedelta
import re

router = APIRouter(prefix="/tasks/ai", tags=["Tareas con IA"])


PALABRAS_URGENCIA = ["urgente", "hoy", "mañana", "prioritario", "inmediato", "rápido", "entregar", "última hora"]

def contiene_palabra_clave(titulo: str) -> bool:
    titulo_lower = titulo.lower()
    return any(re.search(rf"\b{palabra}\b", titulo_lower) for palabra in PALABRAS_URGENCIA)

def clasificar_prioridad_batch(tasks: List[Task]) -> List[PrioritizedTask]:
    resultado = []
    for task in tasks:
        if contiene_palabra_clave(task.titulo):
            prioridad = "alta"
            motivo = "Palabra clave de urgencia detectada en el título."
        else:
            prioridad = clasificar_prioridad(task.titulo)
            motivo = "IA personalizada basada en entrenamiento en tareas reales."

        resultado.append(PrioritizedTask(
            id=task.id,
            titulo=task.titulo,
            prioridad=prioridad,
            motivo=motivo
        ))
        print(f"[PRIORITY-IA+H] '{task.titulo}' → {prioridad} ({motivo})")
    return resultado




@router.post("/prioritize", response_model=List[PrioritizedTask], summary="Priorizar tareas", description="Prioriza las tareas del usuario autenticado según criterios específicos.",
              responses={200: {"description": "Ejemplo de respuesta", "content": {"application/json": {"example": PRIORITIZED_TASK_EXAMPLE}}}})
async def prioritize(
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    result = await session.exec(select(Task).where(Task.user_id == current_user.id))
    tasks_list = result.all()
    prioritized_tasks = clasificar_prioridad_batch(tasks_list)
    return prioritized_tasks

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

    group = agrupar_tareas_por_similitud(tasks)
    response = {
        nombre_grupo: [
            GroupedTasks(id=task.id, titulo=task.titulo)
            for task in tareas
        ]
        for nombre_grupo, tareas in group.items()
    }
    return {"grupos": response}


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

    result = []
    for task in tasks:
        resultado =  reformular_titulo_con_traduccion(task.titulo)
        result.append(RewrittenTask(
            id=task.id,
            original=task.titulo,
            reformulada=resultado["reformulada"],
            motivo=resultado["motivo"]
        ))
    return result


@router.post(
    "/suggest",
    response_model=PrioritySuggestion,
    summary="Sugerir prioridad de una tarea",
    description="Devuelve una prioridad sugerida para la tarea enviada.",
)
async def suggest_priority(payload: PrioritySuggestRequest) -> PrioritySuggestion:
    texto = f"{payload.titulo} {payload.descripcion or ''}"
    if contiene_palabra_clave(texto):
        prioridad = "alta"
        motivo = "Palabra clave de urgencia detectada."
    elif payload.due_date:
        limite = payload.due_date
        ahora = datetime.now(timezone.utc)
        if limite.tzinfo is None:
            limite = limite.replace(tzinfo=timezone.utc)
        if limite - ahora <= timedelta(days=1):
            prioridad = "alta"
            motivo = "La fecha límite está muy próxima."
        else:
            prioridad = clasificar_prioridad(payload.titulo)
            motivo = "IA personalizada basada en entrenamiento en tareas reales."
    else:
        prioridad = clasificar_prioridad(payload.titulo)
        motivo = "IA personalizada basada en entrenamiento en tareas reales."
    return PrioritySuggestion(prioridad=prioridad, motivo=motivo)

