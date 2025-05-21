from datetime import datetime
from uuid import uuid4, UUID
from sqlmodel import SQLModel, Field, Relationship
from typing import List, Optional

class Usuario(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)   # ①  <── era str
    email: str = Field(index=True, sa_column_kwargs={"unique": True})
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)

    rooms:   List["Room"]  = Relationship(back_populates="owner")
    tasks:   List["Task"]  = Relationship(back_populates="usuario")
