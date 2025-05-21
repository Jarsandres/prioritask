from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint
from uuid import uuid4, UUID

if TYPE_CHECKING:
    from app.models.user import Usuario


class Room(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("nombre", "owner_id", name="uq_room_nombre_owner"),
    )

    id : UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    nombre: str = Field(max_length=100, nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    owner_id: UUID = Field(foreign_key="usuario.id")
    owner: Optional["Usuario"] = Relationship(back_populates="rooms")
