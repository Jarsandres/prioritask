from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.tag import Tag
    from app.models.task import Task

class TaskTag(SQLModel, table=True):
    task_id: UUID = Field(foreign_key="task.id", primary_key=True)
    tag_id: UUID = Field(foreign_key="tag.id", primary_key=True)

    tarea: Optional["Task"] = Relationship(back_populates="etiquetas")
    etiqueta: Optional["Tag"] = Relationship(back_populates="tareas")

