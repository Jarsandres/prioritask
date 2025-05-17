from pydantic import BaseModel, EmailStr

class UsuarioBase(BaseModel):
    email: EmailStr
    nombre : str | None = None
    is_active: bool = True

class UsuarioCreate(UsuarioBase):
    password: str

class UsuarioRead(UsuarioBase):
    id: str

class UsuarioLogin(BaseModel):
    email: EmailStr
    password: str