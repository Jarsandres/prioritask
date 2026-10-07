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


class TaskAction(str, Enum):
    CREATED = "CREATED"
    UPDATED = "UPDATED"
    DELETED = "DELETED"
    STATUS_UPDATED = "STATUS_UPDATED"
    RECURRENCE_ADVANCED = "RECURRENCE_ADVANCED"
    SUBTASK_CREATED = "SUBTASK_CREATED"
    SUBTASK_TOGGLED = "SUBTASK_TOGGLED"
    SUBTASK_DELETED = "SUBTASK_DELETED"
    ATTACHMENT_ADDED = "ATTACHMENT_ADDED"
    ATTACHMENT_DELETED = "ATTACHMENT_DELETED"

