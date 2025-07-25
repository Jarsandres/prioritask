from sqlmodel import SQLModel, Field, Relationship
from typing import List, Optional, TYPE_CHECKING
from uuid import uuid4, UUID
from datetime import datetime, timezone
import sqlalchemy as sa

from app.models import Usuario
from app.models.enums import CategoriaTarea, EstadoTarea
from .task_assignment import TaskAssignment


if TYPE_CHECKING:
    from .task_tag import TaskTag
    from .tag import Tag

class Task(SQLModel, table=True):
    __table_args__ = (
        sa.UniqueConstraint("user_id", "titulo", name="unique_user_task_title"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    titulo: str
    descripcion: Optional[str]
    categoria: CategoriaTarea
    estado: EstadoTarea = EstadoTarea.TODO
    peso : float = 1.0
    completed : bool = False
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted_at: Optional[datetime] = None

    user_id: UUID = Field(foreign_key="usuario.id")
    room_id: UUID = Field(foreign_key="room.id", nullable=False)
    usuario: Optional["Usuario"] = Relationship(back_populates="tasks")
    history: List["TaskHistory"] = Relationship(back_populates="task", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    colaboradores: List["TaskAssignment"] = Relationship(back_populates="task")
    etiquetas: List["TaskTag"] = Relationship(back_populates="tarea", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

    @property
    def tags(self) -> List["Tag"]:
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
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    changes: Optional[str] = None

    task: Optional["Task"] = Relationship(back_populates="history")
