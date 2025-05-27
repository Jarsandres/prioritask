from app.schemas.task import PrioritizedTask, RewrittenTask
from app.models.task import Task
from typing import List, Dict


async def prioritize_tasks_mock(tasks: List[Task]) -> List[PrioritizedTask]:
    def simple_priority_logic(task: Task) -> str:
        if "urgente" in task.titulo.lower():
            return "alta"
        if task.due_date:
            return "media"
        return "baja"

    return [
        PrioritizedTask(
            id=task.id,
            titulo=task.titulo,
            prioridad=simple_priority_logic(task),
            motivo="Mock: basado en título y fecha de vencimiento"
        )
        for task in tasks
    ]
def detect_group(task_title: str) -> str:
    title = task_title.lower()
    if any(word in title for word in ["limpiar", "lavar", "fregar", "cocina"]):
        return "Limpieza"
    if any(word in title for word in ["currículum", "informe", "trabajo", "prácticas"]):
        return "Trabajo/Estudios"
    return "Otros"

async def group_tasks_mock(tasks: List[Task]) -> Dict[str, List[dict]]:
    grupos = {}
    for task in tasks:
        grupo = detect_group(task.titulo)
        grupos.setdefault(grupo, []).append({
            "id": str(task.id),
            "titulo": task.titulo
        })
    return grupos

def rewrite_task_title(title: str) -> str:
    return f"{title}. Por favor, realiza esta tarea lo antes posible y con atención."

async def rewrite_tasks_mock(tasks: List[Task]) -> List[RewrittenTask]:
    return [
        RewrittenTask(
            id=task.id,
            original=task.titulo,
            reformulada=rewrite_task_title(task.titulo)
        )
        for task in tasks
    ]
