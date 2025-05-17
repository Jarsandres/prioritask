from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint
from uuid import uuid4

if TYPE_CHECKING:
    from app.models.user import Usuario


class Room(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("nombre", "owner_id", name="uq_room_nombre_owner"),
    )

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    nombre: str = Field(max_length=100, nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    owner_id: str = Field(foreign_key="usuario.id", nullable=False)
    owner: Optional["Usuario"] = Relationship(back_populates="rooms")
