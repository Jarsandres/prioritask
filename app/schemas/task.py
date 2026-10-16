import os
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models.enums import (
    CategoriaTarea,
    EstadoTarea,
    RecurrenceFrequency,
    RecurrenceMode,
)

from .subtask import SubtaskRead
from .tag import TagRead


class RecurrenceRuleInput(BaseModel):
    frequency: RecurrenceFrequency = Field(
        default=RecurrenceFrequency.WEEKLY,
        description="Frecuencia base de repetición (DAILY, WEEKLY, MONTHLY).",
    )
    interval: int = Field(
        default=1,
        ge=1,
        le=365,
        description="Intervalo multiplicador entre ocurrencias (1..365).",
    )
    mode: RecurrenceMode = Field(
        default=RecurrenceMode.FIXED,
        description="Modo de recurrencia: FIXED (calendario fijo) o FLOATING (al completar).",
    )
    end_date: datetime | None = Field(
        default=None,
        description="Fecha límite opcional de la serie recurrente.",
    )
    anchor_day_of_month: int | None = Field(
        default=None,
        ge=1,
        le=31,
        description="Día ancla del mes (1..31) para evitar deriva en meses cortos.",
    )
    reset_subtasks: bool = Field(
        default=True,
        description="Reinicia automáticamente el checklist de subtareas al avanzar.",
    )
    by_weekdays: list[int] | None = Field(
        default=None,
        description="Días de la semana (0=Dom..6=Sáb) para reglas WEEKLY.",
    )
    is_last_day_of_month: bool = Field(
        default=False,
        description="Fuerza el último día del mes en reglas MONTHLY.",
    )

    @field_validator("by_weekdays")
    @classmethod
    def validate_by_weekdays(cls, value):
        if value is None:
            return None
        cleaned = sorted({int(day) for day in value})
        if any(day < 0 or day > 6 for day in cleaned):
            raise ValueError("by_weekdays debe contener días 0..6 (0=Domingo)")
        return cleaned

    @field_validator("end_date", mode="before")
    def validate_end_date(cls, value):
        if value:
            try:
                value = datetime.fromisoformat(value) if isinstance(value, str) else value
            except ValueError:
                raise ValueError("Formato de fecha de fin de recurrencia inválido")
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
        return value


class RecurrenceRuleRead(BaseModel):
    id: UUID
    frequency: RecurrenceFrequency
    interval: int
    mode: RecurrenceMode = RecurrenceMode.FIXED
    next_due: datetime
    end_date: datetime | None = None
    anchor_day_of_month: int | None = None
    by_weekdays: list[int] | None = None
    is_last_day_of_month: bool = False
    reset_subtasks: bool = True

    model_config = ConfigDict(from_attributes=True)


class TaskCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=100, description="Título de la tarea.", json_schema_extra={"example": "Comprar comida"})
    descripcion: str | None = Field(default=None, max_length=500, description="Descripción detallada de la tarea.", json_schema_extra={"example": "Comprar alimentos para la semana"})
    categoria: CategoriaTarea = Field(description="Categoría de la tarea.", json_schema_extra={"example": "OTRO"})
    estado: EstadoTarea = Field(default=EstadoTarea.TODO, description="Estado inicial de la tarea.", json_schema_extra={"example": "TODO"})
    peso: float = Field(default=1.0, description="Peso o importancia de la tarea.", json_schema_extra={"example": 1.0})
    due_date: datetime | None = Field(default=None, description="Fecha límite para completar la tarea.", json_schema_extra={"example": "2025-06-01T12:00:00"})
    reminder_at: datetime | None = Field(default=None, description="Fecha y hora de recordatorio opcional")
    room_id: UUID | None = Field(default=None, description="Hogar asociado", json_schema_extra={"example": None})
    is_recurring: bool = Field(default=False, description="Indica si la tarea es recurrente")
    recurrence_rule: RecurrenceRuleInput | None = Field(default=None, description="Regla de recurrencia opcional al crear la tarea")
    tag_ids: list[UUID] | None = Field(default=None, description="Lista opcional de IDs de etiquetas")

    @field_validator("due_date", mode="before")
    def validate_due_date(cls, value):
        if value:
            try:
                value = datetime.fromisoformat(value) if isinstance(value, str) else value
            except ValueError:
                raise ValueError("Formato de fecha inválido")
            # Permitir fechas pasadas en un entorno de pruebas
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
            if value < datetime.now(UTC) and not os.getenv("ALLOW_PAST_DUE_DATES"):
                raise ValueError("La fecha límite no puede ser anterior a la fecha actual")
        return value

    @field_validator("reminder_at", mode="before")
    def validate_reminder_at(cls, value):
        if value:
            try:
                value = datetime.fromisoformat(value) if isinstance(value, str) else value
            except ValueError:
                raise ValueError("Formato de fecha de recordatorio inválido")
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
        return value

class TaskRead(BaseModel):
    id: UUID = Field(description="Identificador único de la tarea.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    titulo: str = Field(description="Título de la tarea.", json_schema_extra={"example": "Comprar comida"})
    descripcion: str | None = Field(default=None, description="Descripción detallada de la tarea.", json_schema_extra={"example": "Comprar alimentos para la semana"})
    categoria: CategoriaTarea = Field(description="Categoría de la tarea.", json_schema_extra={"example": "OTRO"})
    estado: EstadoTarea = Field(description="Estado actual de la tarea.", json_schema_extra={"example": "TODO"})
    peso: float = Field(gt=0, lt=100, description="Peso o importancia de la tarea.", json_schema_extra={"example": 1.0})
    completed: bool = Field(default=False, description="Indica si la tarea está completada")
    due_date: datetime | None = Field(default=None, description="Fecha límite para completar la tarea.", json_schema_extra={"example": "2025-06-01T12:00:00"})
    reminder_at: datetime | None = Field(default=None, description="Fecha y hora de recordatorio opcional")
    created_at: datetime = Field(description="Fecha de creación de la tarea.", json_schema_extra={"example": "2025-05-27T12:00:00"})
    updated_at: datetime | None = Field(default=None, description="Fecha de última actualización de la tarea.")
    user_id: UUID = Field(description="Identificador del usuario asociado a la tarea.", json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    room_id: UUID | None = Field(default=None, description="Hogar asociado", json_schema_extra={"example": None})
    deleted_at: datetime | None = Field(default=None, description="Fecha de eliminación de la tarea, si aplica.", json_schema_extra={"example": None})
    is_recurring: bool = Field(default=False, description="Indica si la tarea es recurrente")
    version: int = Field(default=1, description="Versión OCC de la tarea")
    field_hlc: dict[str, str] = Field(default_factory=dict, description="Mapa HLC por campo")
    recurrence_rule: RecurrenceRuleRead | None = Field(
        default=None,
        validation_alias=AliasChoices("loaded_recurrence_rule", "recurrence_rule"),
        description="Regla de recurrencia activa asociada a la tarea",
    )
    tags: list[TagRead] = Field(default_factory=list, description="Etiquetas asociadas a la tarea")
    subtasks: list[SubtaskRead] = Field(default_factory=list, description="Lista de subtareas asociadas")
    subtasks_count: int = Field(default=0, description="Cantidad total de subtareas")
    subtasks_completed_count: int = Field(default=0, description="Cantidad de subtareas completadas")

    @model_validator(mode="after")
    def sync_subtasks_counts(self):
        if self.subtasks:
            active_subtasks = [s for s in self.subtasks if getattr(s, "deleted_at", None) is None]
            self.subtasks = active_subtasks
            self.subtasks_count = len(active_subtasks)
            self.subtasks_completed_count = sum(1 for s in active_subtasks if s.completada)
        return self

    model_config = ConfigDict(from_attributes=True)

class TaskUpdate(BaseModel):
    titulo: str | None = Field(None, min_length=3, max_length=100, description="Título de la tarea.", json_schema_extra={"example": "Comprar comida"})
    descripcion: str | None = Field(None, max_length=500, description="Descripción detallada de la tarea.", json_schema_extra={"example": "Comprar alimentos para la semana"})
    categoria: CategoriaTarea | None = Field(None, description="Categoría de la tarea.", json_schema_extra={"example": "OTRO"})
    estado: EstadoTarea | None = Field(None, description="Estado actual de la tarea.", json_schema_extra={"example": "TODO"})
    peso: float | None = Field(None, description="Peso o importancia de la tarea.", json_schema_extra={"example": 1.0})
    due_date: datetime | None = Field(None, description="Fecha límite para completar la tarea.", json_schema_extra={"example": "2025-06-01T12:00:00"})
    reminder_at: datetime | None = Field(default=None, description="Fecha y hora de recordatorio opcional")
    room_id: UUID | None = Field(default=None, description="Hogar asociado", json_schema_extra={"example": None})
    is_recurring: bool = Field(default=False, description="Indica si la tarea es recurrente")
    recurrence_rule: RecurrenceRuleInput | None = Field(default=None, description="Configuración de la regla de recurrencia")
    tag_ids: list[UUID] | None = Field(default=None, description="Lista opcional de IDs de etiquetas")
    completed: bool | None = Field(default=None, description="Indica si la tarea está completada")
    expected_version: int | None = Field(default=None, description="Versión esperada para control de concurrencia optimista")
    field_hlc: dict[str, str] | None = Field(default=None, description="Relojes HLC por campo")

    @field_validator("due_date", mode="before")
    def validate_due_date(cls, value):
        if value:
            try:
                value = datetime.fromisoformat(value) if isinstance(value, str) else value
            except ValueError:
                raise ValueError("Formato de fecha inválido")
            # Permitir fechas pasadas en un entorno de pruebas
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
            if value < datetime.now(UTC) and not os.getenv("ALLOW_PAST_DUE_DATES"):
                raise ValueError("La fecha límite no puede ser anterior a la fecha actual")
        return value

    @field_validator("reminder_at", mode="before")
    def validate_reminder_at(cls, value):
        if value:
            try:
                value = datetime.fromisoformat(value) if isinstance(value, str) else value
            except ValueError:
                raise ValueError("Formato de fecha de recordatorio inválido")
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
        return value

    model_config = ConfigDict(extra="forbid")

class TaskAssignmentCreate(BaseModel):
    task_id: UUID
    user_id: UUID

class TaskAssignmentRead(BaseModel):
    id: UUID
    task_id: UUID
    user_id: UUID
    asignado_por: UUID
    fecha: datetime

    model_config = ConfigDict(from_attributes=True)

class TaskPrioritizeRequest(BaseModel):
    task_ids: list[UUID] | None = None

class PrioritizedTask(BaseModel):
    id : UUID
    titulo: str
    prioridad : str
    motivo : str
    model_config = ConfigDict(from_attributes=True)

class TaskGroupRequest(BaseModel):
    task_ids: list[UUID] | None = None

class GroupedTasks (BaseModel):
    id : UUID
    titulo: str

class GroupedTasksResponse(BaseModel):
    grupos: dict[str, list[GroupedTasks]]

class TaskRewriteRequest(BaseModel):
    task_ids: list[UUID] | None = None

class RewrittenTask(BaseModel):
    id : UUID
    original : str
    reformulada : str
    motivo: str

class PrioritySuggestRequest(BaseModel):
    titulo: str
    descripcion: str | None = None
    due_date: datetime | None = None

class PrioritySuggestion(BaseModel):
    prioridad: str
    motivo: str


class AIHealthResponse(BaseModel):
    status: str = Field(description="Estado de salud general ('healthy' o 'degraded')", json_schema_extra={"example": "healthy"})
    circuit_state: str = Field(description="Estado del Circuit Breaker ('CLOSED', 'OPEN', 'HALF_OPEN')", json_schema_extra={"example": "CLOSED"})
    failure_count: int = Field(description="Número de fallos registrados", json_schema_extra={"example": 0})
    success_count: int = Field(description="Número de llamadas exitosas registradas", json_schema_extra={"example": 10})
    last_failure: datetime | None = Field(default=None, description="Timestamp del último fallo", json_schema_extra={"example": None})
    model: str = Field(description="Modelo configurado de IA", json_schema_extra={"example": "qwen2.5:7b"})
    cache_stats: dict[str, Any] = Field(description="Estadísticas de la caché en memoria", json_schema_extra={"example": {"hits": 5, "misses": 2, "size": 3}})

    model_config = ConfigDict(from_attributes=True)
