"""Contratos Pydantic para la importación del modelo Sync de Todoist.

La entrada modela el volcado del *full sync* de Todoist (``POST /sync`` con
``sync_token='*'``). Es **tolerante a los campos extra** del Sync (``extra="ignore"``):
solo tipamos lo que el MVP consume y cualquier clave desconocida se descarta sin error.
La salida es un informe de importación con contadores y detalles.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TodoistDue(BaseModel):
    """Objeto ``due``/``deadline`` de Todoist (subconjunto relevante para el MVP)."""

    model_config = ConfigDict(extra="ignore")

    date: str | None = Field(default=None, description="Fecha ISO-8601 en cualquiera de sus 3 variantes.")
    timezone: str | None = Field(default=None, description="Nombre IANA; solo en la variante fija.")
    string: str | None = Field(default=None, description="Representación en lenguaje natural.")
    lang: str | None = Field(default=None, description="Idioma de la representación natural.")
    is_recurring: bool = Field(default=False, description="True si el string describe una recurrencia.")


class TodoistProject(BaseModel):
    """Proyecto de Todoist → ``Room``."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default="", description="ID base32 de Todoist (no UUID).")
    name: str = Field(default="", description="Nombre del proyecto.")
    parent_id: str | None = Field(default=None, description="ID del proyecto padre dentro del payload.")
    child_order: int | None = Field(default=None, description="Orden entre hermanos.")
    is_deleted: bool = Field(default=False, description="Tombstone.")
    is_archived: bool = Field(default=False, description="Proyecto archivado.")


class TodoistItem(BaseModel):
    """Item (tarea o subtarea) de Todoist → ``Task`` / ``Subtask``."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default="", description="ID base32 de Todoist.")
    project_id: str | None = Field(default=None, description="ID del proyecto contenedor.")
    content: str | None = Field(default=None, description="Texto principal (markdown).")
    description: str | None = Field(default=None, description="Descripción (markdown).")
    priority: int = Field(default=1, description="Prioridad Todoist 1..4 (4 = muy urgente).")
    due: TodoistDue | None = Field(default=None, description="Fecha de vencimiento.")
    deadline: TodoistDue | None = Field(default=None, description="Deadline (no soportado en el MVP).")
    parent_id: str | None = Field(default=None, description="ID del item padre → Subtask.")
    child_order: int | None = Field(default=None, description="Orden entre hermanos.")
    labels: list[str] = Field(default_factory=list, description="Nombres de etiquetas.")
    checked: bool = Field(default=False, description="Completado.")
    is_deleted: bool = Field(default=False, description="Tombstone.")


class TodoistLabel(BaseModel):
    """Etiqueta personal de Todoist → ``Tag``."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default="", description="ID de la etiqueta.")
    name: str = Field(default="", description="Nombre de la etiqueta.")
    is_deleted: bool = Field(default=False, description="Tombstone.")


class TodoistSyncPayload(BaseModel):
    """Sobre del *full sync* de Todoist.

    Solo ``projects``, ``items`` y ``labels`` se importan. El resto de colecciones se
    declaran para poder **reportarlas como no soportadas** y para contabilizarlas en el
    límite anti JSON-bomb.
    """

    model_config = ConfigDict(extra="ignore")

    projects: list[TodoistProject] = Field(default_factory=list)
    items: list[TodoistItem] = Field(default_factory=list)
    labels: list[TodoistLabel] = Field(default_factory=list)
    sections: list[dict[str, Any]] = Field(default_factory=list)
    notes: list[dict[str, Any]] = Field(default_factory=list)
    project_notes: list[dict[str, Any]] = Field(default_factory=list)
    reminders: list[dict[str, Any]] = Field(default_factory=list)
    reminders_location: list[dict[str, Any]] = Field(default_factory=list)
    filters: list[dict[str, Any]] = Field(default_factory=list)


class TodoistImportIssue(BaseModel):
    """Detalle de una entidad omitida o fallida durante la importación."""

    entity: str = Field(description="Tipo de entidad: project, item, subtask o label.")
    external_id: str | None = Field(default=None, description="ID de Todoist de la entidad, si lo tenía.")
    title: str | None = Field(default=None, description="Título/nombre de la entidad, si aplica.")
    reason: str = Field(description="Motivo legible de la omisión o el fallo.")


class TodoistImportReport(BaseModel):
    """Informe de resultado de la importación."""

    rooms_created: int = Field(default=0, description="Hogares (proyectos) creados.")
    tasks_created: int = Field(default=0, description="Tareas creadas.")
    subtasks_created: int = Field(default=0, description="Subtareas creadas.")
    tags_created: int = Field(default=0, description="Etiquetas creadas.")
    task_tags_created: int = Field(default=0, description="Asociaciones tarea-etiqueta creadas.")
    skipped: int = Field(default=0, description="Entidades omitidas (tombstones, validación, referencias rotas).")
    failed: int = Field(default=0, description="Entidades que fallaron al persistirse.")
    renamed: int = Field(default=0, description="Entidades renombradas para evitar colisiones de unicidad.")
    truncated: int = Field(default=0, description="Campos truncados a los límites del dominio.")
    clamped_due_dates: int = Field(default=0, description="Fechas de vencimiento pasadas normalizadas a 'ahora'.")
    already_imported: bool = Field(
        default=False,
        description="True cuando la petición es un reintento idempotente ya procesado (no se escribió nada).",
    )
    warnings: list[str] = Field(default_factory=list, description="Características de Todoist no soportadas en el MVP.")
    skipped_details: list[TodoistImportIssue] = Field(
        default_factory=list, description="Ejemplos de entidades omitidas (lista acotada)."
    )
    failed_details: list[TodoistImportIssue] = Field(
        default_factory=list, description="Ejemplos de entidades fallidas (lista acotada)."
    )


__all__ = [
    "TodoistDue",
    "TodoistImportIssue",
    "TodoistImportReport",
    "TodoistItem",
    "TodoistLabel",
    "TodoistProject",
    "TodoistSyncPayload",
]
