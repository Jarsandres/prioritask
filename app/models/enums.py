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
