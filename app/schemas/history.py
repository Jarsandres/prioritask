from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TaskHistoryRead(BaseModel):
    id: UUID = Field(description="Identificador del registro de historial.")
    task_id: UUID = Field(description="Identificador de la tarea asociada.")
    user_id: UUID = Field(description="Usuario que realizó la acción.")
    action: str = Field(description="Acción registrada.")
    timestamp: datetime = Field(description="Momento en que ocurrió la acción.")
    changes: str | None = Field(default=None, description="Cambios realizados.")
    task_title: str | None = Field(default=None, description="Título de la tarea asociada.")

    model_config = ConfigDict(from_attributes=True)
