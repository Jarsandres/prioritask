from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .task import Task
    from .user import Usuario

class TaskAssignment(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: UUID = Field(foreign_key="usuario.id", nullable=False, index=True)
    task_id: UUID = Field(foreign_key="task.id", nullable=False, index=True)
    asignado_por: UUID = Field(foreign_key="usuario.id", nullable=False, index=True)
    fecha: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)

    task: Optional["Task"] = Relationship(back_populates="colaboradores")
    user: Optional["Usuario"] = Relationship(
        back_populates="tasks_asignadas",
        sa_relationship_kwargs={"foreign_keys": "[TaskAssignment.user_id]"}
    )

    asignador: Optional["Usuario"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[TaskAssignment.asignado_por]"}
    )

