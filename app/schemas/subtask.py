from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SubtaskBase(BaseModel):
    titulo: str = Field(
        min_length=1,
        max_length=255,
        description="Título o descripción de la subtarea.",
        json_schema_extra={"example": "Comprar pan"},
    )
    orden: int = Field(
        default=0,
        description="Orden de la subtarea dentro de la tarea.",
        json_schema_extra={"example": 0},
    )


class SubtaskCreate(SubtaskBase):
    titulo: str = Field(
        min_length=1,
        max_length=255,
        description="Título o descripción de la subtarea.",
        json_schema_extra={"example": "Comprar pan"},
    )
    orden: int = Field(
        default=0,
        description="Orden de la subtarea dentro de la tarea.",
        json_schema_extra={"example": 0},
    )


class SubtaskUpdate(BaseModel):
    titulo: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="Título o descripción actualizada de la subtarea.",
        json_schema_extra={"example": "Comprar pan integral"},
    )
    completada: bool | None = Field(
        default=None,
        description="Estado de completitud de la subtarea.",
        json_schema_extra={"example": True},
    )
    orden: int | None = Field(
        default=None,
        description="Nuevo orden de la subtarea.",
        json_schema_extra={"example": 1},
    )

    model_config = ConfigDict(extra="forbid")


class SubtaskRead(SubtaskBase):
    id: UUID = Field(
        description="Identificador único de la subtarea.",
        json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"},
    )
    task_id: UUID = Field(
        description="Identificador de la tarea a la que pertenece la subtarea.",
        json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"},
    )
    titulo: str = Field(
        description="Título o descripción de la subtarea.",
        json_schema_extra={"example": "Comprar pan"},
    )
    completada: bool = Field(
        default=False,
        description="Indica si la subtarea ha sido completada.",
        json_schema_extra={"example": False},
    )
    orden: int = Field(
        default=0,
        description="Orden relativo de la subtarea.",
        json_schema_extra={"example": 0},
    )
    created_at: datetime = Field(description="Fecha y hora de creación de la subtarea.")
    updated_at: datetime = Field(description="Fecha y hora de última actualización.")
    deleted_at: datetime | None = Field(
        default=None,
        description="Fecha y hora de eliminación lógica si aplica.",
    )

    model_config = ConfigDict(from_attributes=True)
