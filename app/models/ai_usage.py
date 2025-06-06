from sqlmodel import SQLModel, Field, Relationship
from typing import Optional
from uuid import uuid4, UUID
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .user import Usuario

class AIUsage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="usuario.id")
    action: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    usuario: Optional["Usuario"] = Relationship(back_populates="ai_actions")
