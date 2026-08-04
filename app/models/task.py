from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, Relationship, SQLModel

from app.models.enums import CategoriaTarea, EstadoTarea
from app.models.user import Usuario

from .task_assignment import TaskAssignment

if TYPE_CHECKING:
    from .tag import Tag
    from .task_tag import TaskTag

class Task(SQLModel, table=True):
    __table_args__ = (
        sa.Index(
            "unique_user_active_task_title",
            "user_id",
            "titulo",
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
            sqlite_where=sa.text("deleted_at IS NULL"),
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    titulo: str
    descripcion: str | None
    categoria: CategoriaTarea
    estado: EstadoTarea = EstadoTarea.TODO
    peso : float = 1.0
    completed : bool = False
    due_date: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deleted_at: datetime | None = None

    user_id: UUID = Field(foreign_key="usuario.id")
    room_id: UUID = Field(foreign_key="room.id", nullable=False)
    usuario: Optional["Usuario"] = Relationship(back_populates="tasks")
    history: list["TaskHistory"] = Relationship(back_populates="task", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    colaboradores: list["TaskAssignment"] = Relationship(back_populates="task")
    etiquetas: list["TaskTag"] = Relationship(back_populates="tarea", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

    @property
    def tags(self) -> list["Tag"]:
        """Return associated Tag objects for this task without lazy loading."""
        if "etiquetas" not in self.__dict__:
            return []
        return [tt.etiqueta for tt in self.etiquetas if tt.etiqueta]

    @property
    def owner_id(self) -> UUID:
        return self.user_id

    @owner_id.setter
    def owner_id(self, value: UUID):
        self.user_id = value

class TaskHistory(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="task.id")
    user_id: UUID = Field(foreign_key="usuario.id")
    action: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    changes: str | None = None

    task: Optional["Task"] = Relationship(back_populates="history")
