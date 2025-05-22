from sqlmodel import SQLModel, Field, Relationship
from typing import List, Optional
from uuid import uuid4, UUID
from datetime import datetime
from enum import Enum
import sqlalchemy as sa

from app.models import Usuario


class CategoriaTarea(str, Enum):
    LIMPIEZA = "LIMPIEZA"
    COMPRA = "COMPRA"
    MANTENIMIENTO = "MANTENIMIENTO"
    OTRO = "OTRO"

class EstadoTarea(str, Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"

class Task(SQLModel, table=True):
    __table_args__ = (
        sa.Index('unique_user_task_title', 'user_id', 'titulo', unique=True, postgresql_where=sa.text('deleted_at IS NULL')),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    titulo: str
    descripcion: Optional[str]
    categoria: CategoriaTarea
    estado: EstadoTarea = EstadoTarea.TODO
    peso : float = 1.0
    completed : bool = False
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    user_id: UUID = Field(foreign_key="usuario.id")
    usuario: Optional["Usuario"] = Relationship(back_populates="tasks")
    history: List["TaskHistory"] = Relationship(back_populates="task")

class TaskHistory(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="task.id")
    user_id: UUID = Field(foreign_key="usuario.id")
    action: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    changes : Optional[str] = None
    task: Optional["Task"] = Relationship(back_populates="history")
