from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID

class RoomRead(BaseModel):
    id: UUID = Field(description="Identificador único de la sala.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    nombre: str = Field(description="Nombre de la sala.", json_schema_extra={"example": "Sala de reuniones"})
    owner_id: UUID = Field(description="Identificador único del propietario.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174001"})
    owner: str = Field(description="Nombre del propietario.", json_schema_extra={"example": "Juan Pérez"})
    parent_id: UUID | None = Field(default=None, description="ID del hogar padre", json_schema_extra={"example": None})

    model_config = ConfigDict(from_attributes=True)


class RoomUpdate(BaseModel):
    nombre: str = Field(description="Nuevo nombre del hogar.",
                         json_schema_extra={"example": "Mi Casa"})

