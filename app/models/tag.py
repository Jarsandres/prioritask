from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .task_tag import TaskTag
    from .user import Usuario

class Tag(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    nombre: str = Field(index=True, max_length=50)
    user_id: UUID = Field(foreign_key="usuario.id", index=True)

    usuario: Optional["Usuario"] = Relationship(back_populates="etiquetas")
    tareas: list["TaskTag"] = Relationship(back_populates="etiqueta", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

    __table_args__ = (
        UniqueConstraint("nombre", "user_id", name="uq_tag_nombre_user"),
    )


