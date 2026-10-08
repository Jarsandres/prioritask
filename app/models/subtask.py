from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .task import Task


class Subtask(SQLModel, table=True):
    __tablename__ = "subtask"
    __table_args__ = (
        sa.Index("ix_subtask_task_deleted_orden", "task_id", "deleted_at", "orden"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="task.id", index=True, nullable=False)
    titulo: str = Field(min_length=1, max_length=255)
    completada: bool = Field(default=False, index=True)
    orden: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deleted_at: datetime | None = Field(default=None, index=True)

    task: Optional["Task"] = Relationship(back_populates="subtasks")
