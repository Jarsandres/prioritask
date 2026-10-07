from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .task import Task
    from .user import Usuario


class TaskAttachment(SQLModel, table=True):
    __tablename__ = "task_attachment"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="task.id", index=True, nullable=False)
    user_id: UUID = Field(foreign_key="usuario.id", index=True, nullable=False)
    filename: str = Field(nullable=False)
    file_key: str = Field(nullable=False, unique=True, index=True)
    content_type: str = Field(nullable=False)
    file_size_bytes: int = Field(nullable=False)
    caption: str | None = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    deleted_at: datetime | None = Field(default=None, index=True)

    task: Optional["Task"] = Relationship(back_populates="attachments")
    user: Optional["Usuario"] = Relationship(back_populates="attachments")
