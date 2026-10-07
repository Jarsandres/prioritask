from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AttachmentRead(BaseModel):
    id: UUID = Field(description="Identificador único del adjunto")
    task_id: UUID = Field(description="Identificador de la tarea vinculada")
    user_id: UUID = Field(description="Identificador del usuario que subió el adjunto")
    filename: str = Field(description="Nombre original sanitizado del archivo")
    content_type: str = Field(description="MIME type verificado por magic bytes")
    file_size_bytes: int = Field(description="Tamaño del archivo en bytes")
    caption: str | None = Field(default=None, description="Descripción opcional del archivo")
    download_url: str = Field(description="URL para descargar el adjunto")
    created_at: datetime = Field(description="Fecha y hora de subida")

    model_config = ConfigDict(from_attributes=True)
