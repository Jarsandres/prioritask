from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field, Relationship
from uuid import UUID, uuid4
from typing import Optional, List , TYPE_CHECKING


if TYPE_CHECKING:
    from .user import Usuario
    from .task_tag import TaskTag

class Tag(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    nombre: str = Field(index=True, max_length=50)
    user_id: UUID = Field(foreign_key="usuario.id")

    usuario: Optional["Usuario"] = Relationship(back_populates="etiquetas")
    tareas: List["TaskTag"] = Relationship(back_populates="etiqueta", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

    __table_args__ = (
        UniqueConstraint("nombre", "user_id", name="uq_tag_nombre_user"),
    )

