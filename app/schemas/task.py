from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Dict
from uuid import UUID
from datetime import datetime
from app.models.enums import CategoriaTarea, EstadoTarea

class TaskCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=100)
    descripcion: Optional[str] = Field(default=None, max_length=500)
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
    peso : float = Field(gt=0,lt=100)
    due_date: Optional[datetime] = None
    created_at: datetime

    @field_validator("due_date", mode="before")
    def validate_due_date(cls, value):
        if value and value < datetime.now():
            raise ValueError("La fecha límite no puede ser anterior a la fecha actual")
        return value

    model_config = ConfigDict(from_attributes=True)

class TaskUpdate(BaseModel):
    titulo: Optional[str] = Field(None, min_length=3, max_length=100)
    descripcion: Optional[str] = Field(None, max_length=500)
    categoria: Optional[CategoriaTarea] = None
    estado: Optional[EstadoTarea] = None
    peso : Optional[float] = None
    due_date: Optional[datetime] = None

    @field_validator("due_date", mode="before")
    def validate_due_date(cls, value):
        if value and value < datetime.now():
            raise ValueError("La fecha límite no puede ser anterior a la fecha actual")
        return value

    model_config = ConfigDict(from_attributes=True)

class TaskAssignmentCreate(BaseModel):
    task_id: UUID
    user_id: UUID

class TaskAssignmentRead(BaseModel):
    id: int
    task_id: UUID
    user_id: UUID
    asignado_por: UUID
    fecha: datetime

    model_config = ConfigDict(from_attributes=True)

class TaskPrioritizeRequest(BaseModel):
    task_ids: Optional[List[UUID]] = None

class PrioritizedTask(BaseModel):
    id : UUID
    titulo: str
    prioridad : str
    motivo : str
    model_config = ConfigDict(from_attributes=True)

class TaskGroupRequest(BaseModel):
    task_ids: Optional[List[UUID]] = None

class GroupedTasksResponse(BaseModel):
    grupos: Dict[str, List[dict]]

class TaskRewriteRequest(BaseModel):
    task_ids: Optional[List[UUID]] = None

class RewrittenTask(BaseModel):
    id : UUID
    original : str
    reformulada : str
