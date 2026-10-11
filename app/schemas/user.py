from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class UsuarioBase(BaseModel):
    email: EmailStr = Field(description="Correo electrónico del usuario.", json_schema_extra={"example": "usuario@ejemplo.com"})
    nombre: str | None = Field(default=None, description="Nombre del usuario.", json_schema_extra={"example": "Juan Pérez"})
    is_active: bool = Field(default=True, description="Estado de actividad del usuario.", json_schema_extra={"example": True})

class UsuarioCreate(UsuarioBase):
    password: str = Field(description="Contraseña del usuario.", json_schema_extra={"example": "contraseñaSegura123"})

class UsuarioRead(UsuarioBase):
    id: UUID = Field(description="Identificador único del usuario.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    is_superuser: bool = Field(default=False, description="Indica si el usuario tiene privilegios de administrador.")
    role: UserRole = Field(default=UserRole.USER, description="Rol del usuario en el sistema.")
    preferences: dict[str, Any] = Field(default_factory=dict, description="Preferencias persistidas del usuario.")

    model_config = ConfigDict(from_attributes=True)


class UsuarioUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    preferences: dict[str, Any] | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UsuarioLogin(BaseModel):
    email: EmailStr = Field(description="Correo electrónico del usuario.", json_schema_extra={"example": "usuario@ejemplo.com"})
    password: str = Field(description="Contraseña del usuario.", json_schema_extra={"example": "contraseñaSegura123"})

class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(description="Token de refresco de sesión.")

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


