from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .task import Task
    from .user import Usuario


class TaskComment(SQLModel, table=True):
    __tablename__ = "taskcomment"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="task.id", index=True, nullable=False)
    user_id: UUID = Field(foreign_key="usuario.id", index=True, nullable=False)
    contenido: str = Field(min_length=1, max_length=2000, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deleted_at: datetime | None = Field(default=None, index=True)

    task: Optional["Task"] = Relationship(back_populates="comments")
    user: Optional["Usuario"] = Relationship(back_populates="comments")

    @property
    def author_name(self) -> str | None:
        """Nombre visible del autor si la relación 'user' está disponible."""
        if "user" in self.__dict__ and self.user:
            return self.user.nombre
        return None
