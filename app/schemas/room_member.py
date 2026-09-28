from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import RoomMemberRole


class RoomMemberBase(BaseModel):
    role: RoomMemberRole = Field(
        default=RoomMemberRole.MEMBER,
        description="Rol del conviviente en el hogar.",
    )


class RoomMemberCreate(BaseModel):
    user_id: UUID = Field(description="Identificador del usuario conviviente.")
    role: RoomMemberRole = Field(
        default=RoomMemberRole.MEMBER,
        description="Rol asignado al conviviente.",
    )


class RoomMemberUpdate(BaseModel):
    role: RoomMemberRole = Field(description="Nuevo rol del conviviente.")


class RoomMemberRead(BaseModel):
    user_id: UUID = Field(description="Identificador del usuario.")
    room_id: UUID = Field(description="Identificador del hogar.")
    role: RoomMemberRole = Field(description="Rol del conviviente en el hogar.")
    joined_at: datetime = Field(description="Fecha en la que se unió al hogar.")
    user_email: str | None = Field(default=None, description="Correo electrónico del conviviente.")
    user_nombre: str | None = Field(default=None, description="Nombre del conviviente.")

    model_config = ConfigDict(from_attributes=True)
