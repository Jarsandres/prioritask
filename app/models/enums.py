from enum import Enum


class CategoriaTarea(str, Enum):
    LIMPIEZA = "LIMPIEZA"
    COMPRA = "COMPRA"
    MANTENIMIENTO = "MANTENIMIENTO"
    OTRO = "OTRO"

class EstadoTarea(str, Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"


class RoomMemberRole(str, Enum):
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"


class RecurrenceFrequency(str, Enum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"

