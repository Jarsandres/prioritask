from app.schemas.task import PrioritizedTask
from app.models.task import Task
from typing import List

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
