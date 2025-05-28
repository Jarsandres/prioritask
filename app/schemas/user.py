from pydantic import BaseModel, EmailStr, ConfigDict, Field
from uuid import UUID


class UsuarioBase(BaseModel):
    email: EmailStr = Field(description="Correo electrónico del usuario.", json_schema_extra={"example": "usuario@ejemplo.com"})
    nombre: str | None = Field(default=None, description="Nombre del usuario.", json_schema_extra={"example": "Juan Pérez"})
    is_active: bool = Field(default=True, description="Estado de actividad del usuario.", json_schema_extra={"example": True})

class UsuarioCreate(UsuarioBase):
    password: str = Field(description="Contraseña del usuario.", json_schema_extra={"example": "contraseñaSegura123"})

class UsuarioRead(UsuarioBase):
    id: UUID = Field(description="Identificador único del usuario.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})

    model_config = ConfigDict(from_attributes=True)

class UsuarioLogin(BaseModel):
    email: EmailStr = Field(description="Correo electrónico del usuario.", json_schema_extra={"example": "usuario@ejemplo.com"})
    password: str = Field(description="Contraseña del usuario.", json_schema_extra={"example": "contraseñaSegura123"})

