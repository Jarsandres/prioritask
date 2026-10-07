from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LeaderboardEntry(BaseModel):
    user_id: UUID = Field(..., description="ID del usuario")
    nombre: str = Field(..., description="Nombre del usuario")
    points_balance: int = Field(..., description="Balance actual de puntos")
    lifetime_points: int = Field(..., description="Puntos históricos totales acumulados")
    current_streak: int = Field(..., description="Racha diaria actual de tareas")
    level: int = Field(default=1, description="Nivel calculado según puntos históricos")


class GamificationOverview(BaseModel):
    user_balance: int = Field(..., description="Balance de puntos del usuario actual")
    user_current_streak: int = Field(..., description="Racha actual en días del usuario")
    user_longest_streak: int = Field(..., description="Mejor racha histórica del usuario")
    streak_freeze_available: int = Field(..., description="Protecciones de racha restantes")
    last_completed_date: date | None = Field(None, description="Última fecha en que completó tareas")
    leaderboard: list[LeaderboardEntry] = Field(default_factory=list, description="Tabla de clasificación del hogar")


class RewardCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150, description="Título de la recompensa")
    description: str | None = Field(None, max_length=500, description="Descripción de la recompensa")
    cost_points: int = Field(..., gt=0, description="Costo en puntos para canjear")
    icon_name: str | None = Field("gift", max_length=50, description="Identificador del icono ilustrativo")


class RewardRead(BaseModel):
    id: UUID = Field(..., description="ID único de la recompensa")
    room_id: UUID = Field(..., description="ID del hogar")
    title: str = Field(..., description="Título de la recompensa")
    description: str | None = Field(None, description="Descripción")
    cost_points: int = Field(..., description="Costo en puntos")
    icon_name: str | None = Field("gift", description="Icono")
    is_active: bool = Field(True, description="Estado de activación")
    created_at: datetime = Field(..., description="Fecha de creación")

    model_config = ConfigDict(from_attributes=True)


class RedemptionCreate(BaseModel):
    reward_id: UUID | None = Field(None, description="ID de la recompensa a canjear")


class RedemptionRead(BaseModel):
    id: UUID = Field(..., description="ID único del canje")
    reward_id: UUID = Field(..., description="ID de la recompensa canjeada")
    room_id: UUID = Field(..., description="ID del hogar")
    user_id: UUID = Field(..., description="ID del usuario que canjeó")
    status: str = Field(..., description="Estado del canje (APPROVED, PENDING, REJECTED)")
    points_spent: int = Field(..., description="Puntos gastados en el canje")
    created_at: datetime = Field(..., description="Fecha y hora del canje")

    model_config = ConfigDict(from_attributes=True)
