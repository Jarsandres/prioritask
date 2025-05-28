from typing import List

from pydantic import BaseModel, Field
from uuid import UUID

class TagCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=50, description="Nombre de la etiqueta.", json_schema_extra={"example": "Urgente"})

class TagRead(BaseModel):
    id: UUID = Field(description="Identificador único de la etiqueta.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    nombre: str = Field(description="Nombre de la etiqueta.", json_schema_extra={"example": "Urgente"})

class TagAssignRequest(BaseModel):
    tag_ids: List[UUID] = Field(description="Lista de identificadores únicos de etiquetas.", json_schema_extra={"example": ["123e4567-e89b-12d3-a456-426614174000", "123e4567-e89b-12d3-a456-426614174001"]})
