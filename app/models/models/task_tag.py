from sqlmodel import SQLModel, Field, Relationship
from uuid import UUID
from typing import Optional , TYPE_CHECKING


if TYPE_CHECKING:
    from  app.models.task import Task
    from  app.models.tag import Tag

class TaskTag(SQLModel, table=True):
    task_id: UUID = Field(foreign_key="task.id", primary_key=True)
    tag_id: UUID = Field(foreign_key="tag.id", primary_key=True)

    tarea: Optional["Task"] = Relationship(back_populates="etiquetas")
    etiqueta: Optional["Tag"] = Relationship(back_populates="tareas")

