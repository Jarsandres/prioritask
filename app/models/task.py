from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, Relationship, SQLModel

from app.models.enums import CategoriaTarea, EstadoTarea

if TYPE_CHECKING:
    from .attachment import TaskAttachment
    from .comment import TaskComment
    from .recurrence_rule import RecurrenceRule
    from .room import Room
    from .subtask import Subtask
    from .tag import Tag
    from .task_assignment import TaskAssignment
    from .task_tag import TaskTag
    from .user import Usuario


class Task(SQLModel, table=True):
    __table_args__ = (
        sa.Index(
            "unique_user_active_task_title",
            "user_id",
            "titulo",
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL AND completed = false"),
            sqlite_where=sa.text("deleted_at IS NULL AND completed = 0"),
        ),
        sa.Index(
            "ix_task_room_deleted_completed_created",
            "room_id",
            "deleted_at",
            "completed",
            "created_at",
        ),
        sa.Index(
            "ix_task_room_analytics_covering",
            "room_id",
            "deleted_at",
            "completed",
            "estado",
            "peso",
            "due_date",
            "user_id",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    titulo: str
    descripcion: str | None = None
    categoria: CategoriaTarea
    estado: EstadoTarea = EstadoTarea.TODO
    peso: float = 1.0
    completed: bool = Field(default=False, index=True)
    due_date: datetime | None = None
    is_recurring: bool = Field(default=False, description="Indica si la tarea es recurrente")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deleted_at: datetime | None = Field(default=None, index=True)

    user_id: UUID = Field(foreign_key="usuario.id", index=True)
    room_id: UUID = Field(foreign_key="room.id", nullable=False, index=True)

    usuario: Optional["Usuario"] = Relationship(back_populates="tasks")
    room: Optional["Room"] = Relationship(back_populates="tasks")
    history: list["TaskHistory"] = Relationship(
        back_populates="task",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    colaboradores: list["TaskAssignment"] = Relationship(back_populates="task")
    etiquetas: list["TaskTag"] = Relationship(
        back_populates="tarea",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    recurrence_rule: Optional["RecurrenceRule"] = Relationship(
        back_populates="task",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"},
    )
    subtasks: list["Subtask"] = Relationship(
        back_populates="task",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    comments: list["TaskComment"] = Relationship(
        back_populates="task",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    attachments: list["TaskAttachment"] = Relationship(
        back_populates="task",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    @property
    def tags(self) -> list["Tag"]:
        """Return associated Tag objects for this task without lazy loading."""
        if "etiquetas" not in self.__dict__:
            return []
        return [tt.etiqueta for tt in self.etiquetas if tt.etiqueta]

    @property
    def subtasks_count(self) -> int:
        """Return count of active subtasks without triggering lazy load."""
        if "subtasks" not in self.__dict__:
            return 0
        return sum(1 for s in self.subtasks if getattr(s, "deleted_at", None) is None)

    @property
    def subtasks_completed_count(self) -> int:
        """Return count of completed active subtasks without triggering lazy load."""
        if "subtasks" not in self.__dict__:
            return 0
        return sum(1 for s in self.subtasks if s.completada and getattr(s, "deleted_at", None) is None)

    @property
    def owner_id(self) -> UUID:
        return self.user_id

    @owner_id.setter
    def owner_id(self, value: UUID):
        self.user_id = value


class TaskHistory(SQLModel, table=True):
    __tablename__ = "taskhistory"
    __table_args__ = (
        sa.Index("ix_task_history_task_id_timestamp", "task_id", "timestamp"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="task.id", index=True)
    user_id: UUID = Field(foreign_key="usuario.id", index=True)
    action: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    changes: str | None = None

    task: Optional["Task"] = Relationship(back_populates="history")
