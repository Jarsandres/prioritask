from pydantic import BaseModel, EmailStr, ConfigDict
from uuid import UUID


class UsuarioBase(BaseModel):
    email: EmailStr
    nombre : str | None = None
    is_active: bool = True

class UsuarioCreate(UsuarioBase):
    password: str

class UsuarioRead(UsuarioBase):
    id: UUID
    model_config = ConfigDict(from_attributes=True)

class UsuarioLogin(BaseModel):
    email: EmailStr
    password: str