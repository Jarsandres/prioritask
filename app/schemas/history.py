from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from datetime import datetime

class TaskHistoryRead(BaseModel):
    id: UUID = Field(description="Identificador del registro de historial.")
    task_id: UUID = Field(description="Identificador de la tarea asociada.")
    user_id: UUID = Field(description="Usuario que realizó la acción.")
    action: str = Field(description="Acción registrada.")
    timestamp: datetime = Field(description="Momento en que ocurrió la acción.")
    changes: str | None = Field(default=None, description="Cambios realizados.")

    model_config = ConfigDict(from_attributes=True)
