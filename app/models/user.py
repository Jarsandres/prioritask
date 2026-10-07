from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

from .enums import UserRole

if TYPE_CHECKING:
    from .attachment import TaskAttachment
    from .comment import TaskComment
    from .room import Room
    from .room_member import RoomMember
    from .tag import Tag
    from .task import Task
    from .task_assignment import TaskAssignment



class Usuario(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(index=True, sa_column_kwargs={"unique": True})
    nombre : str | None = Field(default="Sin nombre", max_length=50)
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)

    rooms:   list["Room"]  = Relationship(back_populates="owner")
    rooms_member: list["RoomMember"] = Relationship(back_populates="user")
    tasks:   list["Task"]  = Relationship(back_populates="usuario")
    tasks_asignadas: list["TaskAssignment"] = Relationship(back_populates="user", sa_relationship_kwargs={"foreign_keys": "TaskAssignment.user_id"})
    etiquetas: list["Tag"] = Relationship(back_populates="usuario", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    comments: list["TaskComment"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    attachments: list["TaskAttachment"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

    @property
    def role(self) -> UserRole:
        return UserRole.ADMIN if self.is_superuser else UserRole.USER

