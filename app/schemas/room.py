from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import RoomMemberRole
from app.schemas.room_member import RoomMemberRead


class RoomBase(BaseModel):
    nombre: str = Field(description="Nombre del hogar.",
                         json_schema_extra={"example": "Mi Casa"})
    parent_id: UUID | None = Field(
        default=None,
        description="ID del hogar padre",
        json_schema_extra={"example": None},
    )


class RoomCreate(RoomBase):
    pass

class RoomRead(BaseModel):
    id: UUID = Field(description="Identificador único de la sala.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    nombre: str = Field(description="Nombre de la sala.", json_schema_extra={"example": "Sala de reuniones"})
    owner_id: UUID = Field(description="Identificador único del propietario.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174001"})
    owner: str = Field(description="Nombre del propietario.", json_schema_extra={"example": "Juan Pérez"})
    parent_id: UUID | None = Field(default=None, description="ID del hogar padre", json_schema_extra={"example": None})
    members: list[RoomMemberRead] = Field(default_factory=list, description="Lista de convivientes del hogar.")
    is_owner: bool = Field(default=False, description="Indica si el usuario actual es el propietario.")
    my_role: RoomMemberRole | None = Field(default=None, description="Rol del usuario actual en el hogar.")

    model_config = ConfigDict(from_attributes=True)


class RoomUpdate(BaseModel):
    nombre: str = Field(description="Nuevo nombre del hogar.",
                         json_schema_extra={"example": "Mi Casa"})

