from sqlmodel import SQLModel, Field, Relationship
from typing import Optional
from uuid import uuid4, UUID
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from .user import Usuario

class AIUsage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="usuario.id")
    action: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    usuario: Optional["Usuario"] = Relationship(back_populates="ai_actions")

async def log_ai_usage(user_id: UUID, action: str, session: AsyncSession):
    """
    Registra una acción de uso de IA en la base de datos.

    Args:
        user_id (UUID): ID del usuario que realiza la acción.
        action (str): Descripción de la acción realizada.
        session (AsyncSession): Sesión activa de la base de datos.
    """
    nuevo_log = AIUsage(user_id=user_id, action=action)
    session.add(nuevo_log)
    await session.commit()
    return nuevo_log
