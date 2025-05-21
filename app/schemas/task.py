from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.models import CategoriaTarea, EstadoTarea

class TaskCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    categoria: CategoriaTarea
    estado: EstadoTarea = EstadoTarea.TODO
    peso : float = 1.0
    due_date: Optional[datetime] = None

class TaskRead(BaseModel):
    id: UUID
    titulo: str
    descripcion: Optional[str] = None
    categoria: CategoriaTarea
    estado: EstadoTarea
    peso : float
    due_date: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TaskUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    categoria: Optional[CategoriaTarea] = None
    estado: Optional[EstadoTarea] = None
    peso : Optional[float] = None
    due_date: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

