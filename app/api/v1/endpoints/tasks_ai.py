from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.rate_limit import rate_limit
from app.db.session import get_session
from app.models.enums import CategoriaTarea
from app.models.task import Task
from app.models.user import Usuario
from app.schemas.responses import (
    GROUPED_TASKS_EXAMPLE,
    PRIORITIZED_TASK_EXAMPLE,
    REWRITTEN_TASK_EXAMPLE,
)
from app.schemas.task import (
    AIHealthResponse,
    GroupedTasks,
    GroupedTasksResponse,
    PrioritizedTask,
    PrioritySuggestion,
    PrioritySuggestRequest,
    RewrittenTask,
    TaskGroupRequest,
    TaskPrioritizeRequest,
    TaskRewriteRequest,
)
from app.services.AI.cache import ai_cache
from app.services.AI.circuit_breaker import circuit_breaker
from app.services.AI.priority_classifier import (
    PALABRAS_URGENCIA,
    evaluar_prioridad_contextual,
)
from app.services.AI.reformulator import reformular_titulo_con_traduccion
from app.services.AI.task_organizer import agrupar_tareas_por_similitud
from app.services.auth import get_current_user

router = APIRouter(prefix="/tasks/ai", tags=["Tareas con IA"])


def contiene_palabra_clave(titulo: str) -> bool:
    import re
    titulo_lower = titulo.lower()
    return any(re.search(rf"\b{re.escape(palabra)}\b", titulo_lower) for palabra in PALABRAS_URGENCIA)


async def clasificar_prioridad_batch(tasks: list[Task]) -> list[PrioritizedTask]:
    resultado = []
    for task in tasks:
        prioridad, motivo = await evaluar_prioridad_contextual(task)
        resultado.append(PrioritizedTask(
            id=task.id,
            titulo=task.titulo,
            prioridad=prioridad,
            motivo=motivo
        ))
        print(f"[PRIORITY-IA+H] '{task.titulo}' → {prioridad} ({motivo})")
    return resultado


@router.post(
    "/prioritize",
    response_model=list[PrioritizedTask],
    summary="Priorizar tareas",
    description="Prioriza las tareas del usuario autenticado según criterios específicos.",
    responses={200: {"description": "Ejemplo de respuesta", "content": {"application/json": {"example": PRIORITIZED_TASK_EXAMPLE}}}},
    dependencies=[Depends(rate_limit(max_requests=30, window_seconds=60))],
)
async def prioritize(
        payload: TaskPrioritizeRequest | None = None,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    stmt = (
        select(Task)
        .options(selectinload(Task.colaboradores))
        .where(
            Task.user_id == current_user.id,
            Task.deleted_at.is_(None)
        )
    )
    if payload and payload.task_ids:
        stmt = stmt.where(Task.id.in_(payload.task_ids))

    result = await session.exec(stmt)
    tasks_list = result.all()

    prioritized_tasks = []
    for task in tasks_list:
        prioridad, motivo = await evaluar_prioridad_contextual(task)
        prioritized_tasks.append(
            PrioritizedTask(
                id=task.id,
                titulo=task.titulo,
                prioridad=prioridad,
                motivo=motivo,
            )
        )
    return prioritized_tasks

@router.post("/group", response_model=GroupedTasksResponse, summary="Agrupar tareas", description="Agrupa las tareas del usuario autenticado en categorías específicas.",
              responses={200: {"description": "Ejemplo de respuesta", "content": {"application/json": {"example": GROUPED_TASKS_EXAMPLE}}}})
async def group_tasks(
        payload: TaskGroupRequest,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    stmt = select(Task).where(
        Task.user_id == current_user.id,
        Task.deleted_at.is_(None)
    )
    if payload.task_ids:
        stmt = stmt.where(Task.id.in_(payload.task_ids))

    tasks = (await session.exec(stmt)).all()
    if not tasks:
        raise HTTPException(status_code=404, detail="No se encontraron tareas.")

    group = await agrupar_tareas_por_similitud(tasks)
    response = {
        nombre_grupo: [
            GroupedTasks(id=task.id, titulo=task.titulo)
            for task in tareas
        ]
        for nombre_grupo, tareas in group.items()
    }
    return {"grupos": response}


@router.post("/rewrite", response_model=list[RewrittenTask], summary="Reescribir tareas", description="Reescribe las tareas del usuario autenticado para mejorar su claridad y enfoque.",
              responses={200: {"description": "Ejemplo de respuesta", "content": {"application/json": {"example": REWRITTEN_TASK_EXAMPLE}}}})
async def rewrite_tasks(
        payload: TaskRewriteRequest,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user),
):
    stmt = select(Task).where(
        Task.user_id == current_user.id,
        Task.deleted_at.is_(None)
    )
    if payload.task_ids:
        stmt = stmt.where(Task.id.in_(payload.task_ids))

    tasks = (await session.exec(stmt)).all()
    if not tasks:
        raise HTTPException(status_code=404, detail="No se encontraron tareas.")

    result = []
    for task in tasks:
        resultado = await reformular_titulo_con_traduccion(task.titulo)
        result.append(RewrittenTask(
            id=task.id,
            original=task.titulo,
            reformulada=str(resultado["reformulada"]),
            motivo=str(resultado["motivo"])
        ))
    return result


@router.post(
    "/suggest",
    response_model=PrioritySuggestion,
    summary="Sugerir prioridad de una tarea",
    description="Devuelve una prioridad sugerida para la tarea enviada.",
    dependencies=[Depends(rate_limit(max_requests=30, window_seconds=60))],
)
async def suggest_priority(
    payload: PrioritySuggestRequest,
    current_user: Usuario = Depends(get_current_user),
) -> PrioritySuggestion:
    task = Task(
        id=uuid4(),
        user_id=current_user.id,
        room_id=uuid4(),
        categoria=CategoriaTarea.OTRO,
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        due_date=payload.due_date,
        peso=1.0,
        is_recurring=False,
        colaboradores=[],
    )
    prioridad, motivo = await evaluar_prioridad_contextual(task)
    return PrioritySuggestion(prioridad=prioridad, motivo=motivo)



@router.get(
    "/health",
    response_model=AIHealthResponse,
    summary="Estado de salud y telemetría de IA",
    description="Retorna el estado del Circuit Breaker, métricas operativas y estadísticas de la caché en memoria.",
)
async def get_ai_health(
    current_user: Usuario = Depends(get_current_user),
) -> AIHealthResponse:
    metrics = circuit_breaker.get_metrics()
    cache_stats = await ai_cache.stats()
    return AIHealthResponse(
        **metrics,
        cache_stats=cache_stats,
    )

