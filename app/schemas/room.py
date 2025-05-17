from pydantic import BaseModel
from uuid import UUID

class RoomRead(BaseModel):
    id: str
    nombre: str
    owner_id: UUID
    owner : str
