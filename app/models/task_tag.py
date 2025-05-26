from uuid import UUID
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .task import Task
    from .tag import Tag

class TaskTag(SQLModel, table=True):
    task_id: UUID = Field(foreign_key="task.id", primary_key=True)
    tag_id: UUID = Field(foreign_key="tag.id", primary_key=True)

    tarea: "Task" = Relationship(back_populates="etiquetas")
    etiqueta: "Tag" = Relationship(back_populates="tareas")
