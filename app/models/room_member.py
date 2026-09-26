from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlmodel import Field, Relationship, SQLModel

from app.models.enums import RoomMemberRole

if TYPE_CHECKING:
    from app.models.room import Room
    from app.models.user import Usuario


class RoomMember(SQLModel, table=True):
    __tablename__ = "roommember"

    user_id: UUID = Field(foreign_key="usuario.id", primary_key=True)
    room_id: UUID = Field(foreign_key="room.id", primary_key=True)
    joined_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    role: RoomMemberRole = Field(default=RoomMemberRole.MEMBER)

    user: Optional["Usuario"] = Relationship(back_populates="rooms_member")
    room: Optional["Room"] = Relationship(back_populates="members")
