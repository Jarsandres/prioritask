from datetime import datetime, timezone
from uuid import uuid4, UUID
from sqlmodel import SQLModel, Field, Relationship
from typing import List, TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .room import Room
    from .task import Task
    from .task_assignment import TaskAssignment
    from .tag import Tag
    from .ai_usage import AIUsage



class Usuario(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(index=True, sa_column_kwargs={"unique": True})
    nombre : Optional[str] = Field(default="Sin nombre", max_length=50)
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)

    rooms:   List["Room"]  = Relationship(back_populates="owner")
    tasks:   List["Task"]  = Relationship(back_populates="usuario")
    tasks_asignadas: List["TaskAssignment"] = Relationship(back_populates="user", sa_relationship_kwargs={"foreign_keys": "TaskAssignment.user_id"})
    etiquetas: List["Tag"] = Relationship(back_populates="usuario", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    ai_actions: List["AIUsage"] = Relationship(back_populates="usuario")
