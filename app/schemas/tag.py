from typing import List

from pydantic import BaseModel, constr
from uuid import UUID

class TagCreate(BaseModel):
    nombre: constr(min_length=2, max_length=50)

class TagRead(BaseModel):
    id: UUID
    nombre: str

class TagAssignRequest(BaseModel):
    tag_ids: List[UUID]
