from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Dict
from uuid import UUID
from datetime import datetime
from app.models.enums import CategoriaTarea, EstadoTarea

class TaskCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=100, description="Título de la tarea.", json_schema_extra={"example": "Comprar comida"})
    descripcion: Optional[str] = Field(default=None, max_length=500, description="Descripción detallada de la tarea.", json_schema_extra={"example": "Comprar alimentos para la semana"})
    categoria: CategoriaTarea = Field(description="Categoría de la tarea.", json_schema_extra={"example": "OTRO"})
    estado: EstadoTarea = Field(default=EstadoTarea.TODO, description="Estado inicial de la tarea.", json_schema_extra={"example": "TODO"})
    peso: float = Field(default=1.0, description="Peso o importancia de la tarea.", json_schema_extra={"example": 1.0})
    due_date: Optional[datetime] = Field(default=None, description="Fecha límite para completar la tarea.", json_schema_extra={"example": "2025-06-01T12:00:00"})

class TaskRead(BaseModel):
    id: UUID = Field(description="Identificador único de la tarea.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    titulo: str = Field(description="Título de la tarea.", json_schema_extra={"example": "Comprar comida"})
    descripcion: Optional[str] = Field(default=None, description="Descripción detallada de la tarea.", json_schema_extra={"example": "Comprar alimentos para la semana"})
    categoria: CategoriaTarea = Field(description="Categoría de la tarea.", json_schema_extra={"example": "OTRO"})
    estado: EstadoTarea = Field(description="Estado actual de la tarea.", json_schema_extra={"example": "TODO"})
    peso: float = Field(gt=0, lt=100, description="Peso o importancia de la tarea.", json_schema_extra={"example": 1.0})
    due_date: Optional[datetime] = Field(default=None, description="Fecha límite para completar la tarea.", json_schema_extra={"example": "2025-06-01T12:00:00"})
    created_at: datetime = Field(description="Fecha de creación de la tarea.", json_schema_extra={"example": "2025-05-27T12:00:00"})

    @field_validator("due_date", mode="before")
    def validate_due_date(cls, value):
        if value:
            try:
                value = datetime.fromisoformat(value) if isinstance(value, str) else value
            except ValueError:
                raise ValueError("Formato de fecha inválido")
            if value < datetime.now():
                raise ValueError("La fecha límite no puede ser anterior a la fecha actual")
        return value

    model_config = ConfigDict(from_attributes=True)

class TaskUpdate(BaseModel):
    titulo: Optional[str] = Field(None, min_length=3, max_length=100, description="Título de la tarea.", json_schema_extra={"example": "Comprar comida"})
    descripcion: Optional[str] = Field(None, max_length=500, description="Descripción detallada de la tarea.", json_schema_extra={"example": "Comprar alimentos para la semana"})
    categoria: Optional[CategoriaTarea] = Field(None, description="Categoría de la tarea.", json_schema_extra={"example": "OTRO"})
    estado: Optional[EstadoTarea] = Field(None, description="Estado actual de la tarea.", json_schema_extra={"example": "TODO"})
    peso: Optional[float] = Field(None, description="Peso o importancia de la tarea.", json_schema_extra={"example": 1.0})
    due_date: Optional[datetime] = Field(None, description="Fecha límite para completar la tarea.", json_schema_extra={"example": "2025-06-01T12:00:00"})

    @field_validator("due_date", mode="before")
    def validate_due_date(cls, value):
        if value:
            try:
                value = datetime.fromisoformat(value) if isinstance(value, str) else value
            except ValueError:
                raise ValueError("Formato de fecha inválido")
            if value < datetime.now():
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

class GroupedTasks (BaseModel):
    id : UUID
    titulo: str

class GroupedTasksResponse(BaseModel):
    grupos: Dict[str, List[GroupedTasks]]

class TaskRewriteRequest(BaseModel):
    task_ids: Optional[List[UUID]] = None

class RewrittenTask(BaseModel):
    id : UUID
    original : str
    reformulada : str
    motivo: str
