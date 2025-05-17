from sqlmodel import SQLModel, Field, Relationship
from uuid import uuid4
from datetime import datetime
from typing import List , TYPE_CHECKING
from app.models.room import Room

if TYPE_CHECKING:
    from app.models.room import Room

class Usuario(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    email: str = Field(index=True, sa_column_kwargs={"unique": True})
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)

    rooms : List[Room] = Relationship(back_populates="owner")