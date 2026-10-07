from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TaskCommentBase(BaseModel):
    contenido: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Contenido del comentario (máximo 2000 caracteres)",
        json_schema_extra={"example": "Comenzando la revisión del informe."},
    )


class TaskCommentCreate(TaskCommentBase):
    pass


class TaskCommentUpdate(BaseModel):
    contenido: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Contenido actualizado del comentario",
        json_schema_extra={"example": "Comentario modificado."},
    )

    model_config = ConfigDict(extra="forbid")


class TaskCommentRead(TaskCommentBase):
    id: UUID = Field(description="Identificador único del comentario")
    task_id: UUID = Field(description="Identificador de la tarea vinculada")
    user_id: UUID = Field(description="Identificador del usuario autor")
    created_at: datetime = Field(description="Fecha y hora de creación")
    updated_at: datetime = Field(description="Fecha y hora de última modificación")
    deleted_at: datetime | None = Field(default=None, description="Fecha de eliminación si aplica")
    author_name: str | None = Field(default=None, description="Nombre visible del autor para el frontend")

    model_config = ConfigDict(from_attributes=True)
