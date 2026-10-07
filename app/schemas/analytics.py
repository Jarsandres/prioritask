from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MemberWorkload(BaseModel):
    user_id: UUID
    nombre: str
    tareas_asignadas: int = Field(default=0, description="Total de tareas asignadas al miembro")
    tareas_completadas: int = Field(default=0, description="Tareas completadas asignadas al miembro")
    peso_total_completado: float = Field(
        default=0.0, description="Suma acumulada del peso de las tareas completadas asignadas"
    )

    model_config = ConfigDict(from_attributes=True)


class RoomAnalyticsResponse(BaseModel):
    room_id: UUID
    total_tareas_activas: int = Field(description="Total de tareas activas (no completadas)")
    total_tareas_completadas: int = Field(description="Total de tareas completadas")
    tasa_completitud: float = Field(
        description="Porcentaje de completitud de tareas en el hogar (0.0 a 100.0)"
    )
    distribucion_por_categoria: dict[str, int] = Field(
        description="Conteo de tareas distribuidas por categoría"
    )
    distribucion_por_miembro: list[MemberWorkload] = Field(
        description="Distribución y balance de carga por miembro conviviente"
    )
    tareas_vencidas: int = Field(
        description="Total de tareas activas cuya fecha límite ha expirado"
    )

    model_config = ConfigDict(from_attributes=True)
