from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import datetime, timezone
from uuid import UUID

if TYPE_CHECKING:
    from .task import Task
    from .user import Usuario

class TaskAssignment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: UUID = Field(foreign_key="usuario.id", nullable=False)
    task_id: UUID = Field(foreign_key="task.id", nullable=False)
    asignado_por: UUID = Field(foreign_key="usuario.id", nullable=False)
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    task: Optional["Task"] = Relationship(back_populates="colaboradores")
    user: Optional["Usuario"] = Relationship(
        back_populates="tasks_asignadas",
        sa_relationship_kwargs={"foreign_keys": "[TaskAssignment.user_id]"}
    )

    asignador: Optional["Usuario"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[TaskAssignment.asignado_por]"}
    )
