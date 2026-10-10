from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint

if TYPE_CHECKING:
    from .task import Task
    from .user import Usuario


class TaskAssignment(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_assignment"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="usuario.id", nullable=False, index=True)
    task_id: UUID = Field(
        foreign_key="task.id", ondelete="CASCADE", nullable=False, index=True
    )
    asignado_por: UUID = Field(foreign_key="usuario.id", nullable=False, index=True)
    fecha: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)

    task: Optional["Task"] = Relationship(back_populates="colaboradores")
    user: Optional["Usuario"] = Relationship(
        back_populates="tasks_asignadas",
        sa_relationship_kwargs={"foreign_keys": "[TaskAssignment.user_id]"},
    )

    asignador: Optional["Usuario"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[TaskAssignment.asignado_por]"},
    )

