from pydantic import BaseModel, ConfigDict
from uuid import UUID

class RoomRead(BaseModel):
    id: UUID
    nombre: str
    owner_id: UUID
    owner : str

    model_config = ConfigDict(from_attributes=True)