"""Servicio de importación de un volcado *Sync* de Todoist a las entidades de Prioritask.

Mapeo aplicado (REA `notes/06-todoist-import-export-rea.md` §5):

* ``projects`` → ``Room`` (propiedad del usuario autenticado). ``parent_id`` se resuelve
  **solo dentro del propio payload**.
* ``items`` raíz → ``Task``. ``content``→``titulo``, ``description``→``descripcion``,
  ``due.date``→``due_date`` y ``priority``→``peso`` (mapeo **monotónico** a la escala canónica
  del dominio ``1..5`` con ``P1/Urgente = 5``: Todoist 4→peso 5 … Todoist 1→peso 2; ver §5.2)
  con categoría ``OTRO``.
* ``items`` con ``parent_id`` presente en el payload → ``Subtask`` de la tarea raíz.
* ``labels`` (personales y compartidas referenciadas por los items) → ``Tag`` + ``TaskTag``.

Seguridad: se ignora cualquier ``user_id``/``owner_id``/``room_id`` del archivo. Todo se ata al
usuario autenticado y a salas propias; ninguna referencia externa resuelve una sala existente.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import (
    CategoriaTarea,
    ProcessedSyncCommand,
    Room,
    Subtask,
    Tag,
    Task,
    TaskTag,
)
from app.models.enums import EstadoTarea
from app.models.user import Usuario
from app.schemas.todoist_import import (
    TodoistImportIssue,
    TodoistImportReport,
    TodoistItem,
    TodoistSyncPayload,
)
from app.services.analytics import invalidate_room_analytics_cache
from app.services.events import event_broadcaster

logger = logging.getLogger(__name__)

# ── Límites duros (anti JSON-bomb) ──────────────────────────────────────────────
MAX_PAYLOAD_BYTES = 5 * 1024 * 1024
MAX_ENTITIES = 5000
MAX_NESTING_DEPTH = 25
MAX_DETAIL_EXAMPLES = 50

# ── Límites de dominio de Prioritask (más estrictos que Todoist) ────────────────
MIN_TITLE_LENGTH = 3
MAX_TITLE_LENGTH = 100
MAX_DESCRIPTION_LENGTH = 500
MAX_TAG_NAME_LENGTH = 50
MAX_ROOM_NAME_LENGTH = 100
MAX_SUBTASK_TITLE_LENGTH = 255

_ENTITY_COLLECTIONS = (
    "projects",
    "items",
    "labels",
    "sections",
    "notes",
    "project_notes",
    "reminders",
    "reminders_location",
    "filters",
)

_UNSAFE_ID_CHARS = re.compile(r"[^A-Za-z0-9_-]")


class TodoistImportError(Exception):
    """Error base de la importación."""


class PayloadTooLargeError(TodoistImportError):
    """El cuerpo de la petición excede el tamaño máximo permitido."""


class InvalidPayloadError(TodoistImportError):
    """El cuerpo no es un JSON válido con la forma esperada del Sync."""


class ImportLimitExceededError(TodoistImportError):
    """El payload excede un límite de entidades o de profundidad de anidamiento."""


class ImportPersistenceError(TodoistImportError):
    """El lote no se pudo persistir: la transacción completa fue revertida (0 cambios)."""


# ── Helpers puros (testables sin base de datos) ─────────────────────────────────

# Escala canónica de prioridad del dominio: ``peso`` continuo 1..5 con ``P1 = 5``
# (``prioritask-frontend/src/utils/navigationRouter.test.ts`` y ``nlpTaskParser.ts``).
# Todoist solo expresa 4 niveles (p1..p4), por lo que se mapean sobre los 4 niveles
# semánticos P1..P4 de Prioritask (peso 5..2). El peso ``1`` (``P5``) queda reservado
# como nivel propio de Prioritask no expresable en Todoist, y NO se usa aquí para
# evitar colisiones con las tareas creadas por defecto (``peso=1.0``).
_TODOIST_PRIORITY_TO_PESO: dict[int, float] = {1: 2.0, 2: 3.0, 3: 4.0, 4: 5.0}
_LOWEST_PESO = _TODOIST_PRIORITY_TO_PESO[1]  # Todoist p4 "natural" / valor inválido
_HIGHEST_PESO = _TODOIST_PRIORITY_TO_PESO[4]  # Todoist p1 "muy urgente"


def priority_to_peso(priority: object) -> float:
    """Mapea la prioridad de Todoist (1..4) al ``peso`` canónico de Prioritask (1..5).

    El mapeo es **monotónico y sin colisiones**, alineado con la escala canónica del
    dominio (``P1/Urgente = 5``, ver ``navigationRouter.test.ts`` / ``nlpTaskParser.ts``):

    ============  ============  =================
    Todoist       ``peso``      Nivel Prioritask
    ============  ============  =================
    ``4`` (p1)    ``5.0``       P1 (Urgente)
    ``3`` (p2)    ``4.0``       P2 (Alta)
    ``2`` (p3)    ``3.0``       P3 (Media)
    ``1`` (p4)    ``2.0``       P4 (Baja)
    ============  ============  =================

    Así una tarea urgente de Todoist (``4``) **sí** entra en el filtro "P1 (Urgente)".
    Valores inválidos o fuera de rango se recortan: ``< 1`` → ``2.0`` (nivel más bajo
    representable por Todoist) y ``> 4`` → ``5.0``.
    """
    try:
        value = int(priority)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return _LOWEST_PESO
    if value < 1:
        return _LOWEST_PESO
    if value > 4:
        return _HIGHEST_PESO
    return _TODOIST_PRIORITY_TO_PESO[value]


def _allow_past_due_dates() -> bool:
    """Respeta fechas pasadas (estado "atrasada") cuando ``ALLOW_PAST_DUE_DATES`` está activo."""
    return os.getenv("ALLOW_PAST_DUE_DATES", "").strip().lower() in {"1", "true", "yes", "on"}


def normalize_title(content: str | None) -> str | None:
    """Normaliza el ``content`` de Todoist al rango ``titulo`` (3..100).

    Devuelve ``None`` cuando el título no alcanza la longitud mínima (se omitirá).
    """
    if content is None:
        return None
    title = content.strip()
    if len(title) < MIN_TITLE_LENGTH:
        return None
    return title


def truncate(value: str, max_length: int) -> str:
    """Recorta ``value`` al máximo permitido."""
    return value if len(value) <= max_length else value[:max_length]


def unique_name(base: str, used: set[str], max_length: int) -> tuple[str, bool]:
    """Devuelve un nombre único respecto a ``used`` sufijando `` (n)`` si hace falta.

    Retorna ``(nombre, renombrado)``.
    """
    if base not in used:
        return base, False

    counter = 2
    while counter <= 9999:
        suffix = f" ({counter})"
        candidate = base[: max_length - len(suffix)] + suffix
        if candidate not in used:
            return candidate, True
        counter += 1

    suffix = f" ({uuid4().hex[:6]})"
    return base[: max_length - len(suffix)] + suffix, True


def _safe_external_id(raw: str) -> str:
    cleaned = _UNSAFE_ID_CHARS.sub("", str(raw or ""))[:32]
    return cleaned or "sin-id"


def parse_due_date(raw: str | None) -> datetime | None:
    """Parsea ``due.date`` (fecha pura, flotante o UTC) a un ``datetime`` aware de UTC.

    Devuelve ``None`` si la fecha es ausente o inválida.
    """
    if not raw:
        return None
    value = raw.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _project_depths(projects: list) -> dict[str, int]:
    """Calcula la profundidad de anidamiento de cada proyecto (raíz = 1).

    Lanza ``ImportLimitExceededError`` ante un ciclo en la jerarquía.
    """
    parents = {p.id: p.parent_id for p in projects if p.id}
    memo: dict[str, int] = {}

    def depth(pid: str, visiting: set[str]) -> int:
        if pid in memo:
            return memo[pid]
        if pid in visiting:
            raise ImportLimitExceededError("Se detectó un ciclo en la jerarquía de proyectos.")
        parent = parents.get(pid)
        if parent is None or parent not in parents:
            result = 1
        else:
            visiting.add(pid)
            result = 1 + depth(parent, visiting)
            visiting.discard(pid)
        memo[pid] = result
        return result

    for pid in parents:
        depth(pid, set())
    return memo


def _validate_limits(payload: TodoistSyncPayload) -> None:
    total = sum(len(getattr(payload, name, []) or []) for name in _ENTITY_COLLECTIONS)
    if total > MAX_ENTITIES:
        raise ImportLimitExceededError(
            f"El payload contiene {total} entidades y el máximo permitido es {MAX_ENTITIES}."
        )

    visible_projects = [p for p in payload.projects if p.id and not p.is_deleted]
    if visible_projects:
        depths = _project_depths(visible_projects)
        if depths and max(depths.values()) > MAX_NESTING_DEPTH:
            raise ImportLimitExceededError(
                f"La jerarquía de proyectos supera la profundidad máxima de {MAX_NESTING_DEPTH}."
            )

    visible_items = [i for i in payload.items if i.id and not i.is_deleted]
    if visible_items:
        parents = {i.id: i.parent_id for i in visible_items}
        for item_id in parents:
            chain = 1
            current = parents.get(item_id)
            seen = {item_id}
            while current and current in parents:
                if current in seen:
                    break
                seen.add(current)
                chain += 1
                current = parents.get(current)
            if chain > MAX_NESTING_DEPTH:
                raise ImportLimitExceededError(
                    f"La jerarquía de tareas supera la profundidad máxima de {MAX_NESTING_DEPTH}."
                )


# ── Estado interno de la importación ────────────────────────────────────────────


@dataclass
class _State:
    session: AsyncSession
    current_user: Usuario
    report: TodoistImportReport = field(default_factory=TodoistImportReport)
    warnings_seen: set[str] = field(default_factory=set)
    rooms: dict[str, UUID] = field(default_factory=dict)
    tasks: dict[str, UUID] = field(default_factory=dict)
    tags: dict[str, UUID] = field(default_factory=dict)
    active_titles: set[str] = field(default_factory=set)
    affected_rooms: set[UUID] = field(default_factory=set)

    def warn(self, message: str) -> None:
        if message not in self.warnings_seen:
            self.warnings_seen.add(message)
            self.report.warnings.append(message)

    def skip(self, entity: str, reason: str, *, external_id: str | None = None, title: str | None = None) -> None:
        self.report.skipped += 1
        if len(self.report.skipped_details) < MAX_DETAIL_EXAMPLES:
            self.report.skipped_details.append(
                TodoistImportIssue(entity=entity, external_id=external_id, title=title, reason=reason)
            )


async def _add_pending(session: AsyncSession, obj: object) -> None:
    """Añade ``obj`` al lote en curso y lo hace *flush* **sin** abrir un SAVEPOINT.

    R2 (atomicidad): el grafo y el marcador de idempotencia comparten una única
    transacción. En SQLite, ``RELEASE SAVEPOINT`` cuando la conexión no tiene una
    transacción externa explícita **confirma** (COMMIT) los cambios ya escritos, lo que
    dejaba salas/tareas persistidas sin marcador ante un fallo posterior. Por eso aquí
    solo se hace ``flush``: cualquier ``IntegrityError`` invalida la transacción completa
    y el llamador (``run_todoist_import``) revierte el lote entero.
    """
    session.add(obj)
    await session.flush()


async def _marker_exists(session: AsyncSession, import_key: str) -> bool:
    """Indica si el marcador de idempotencia ya está confirmado en la base de datos.

    Se consulta **después** de revertir el lote para distinguir un doble envío
    concurrente (el ganador ya confirmó su marcador) de un conflicto de datos real.
    """
    try:
        result = await session.exec(
            select(ProcessedSyncCommand.command_uuid).where(
                ProcessedSyncCommand.command_uuid == import_key
            )
        )
        return result.first() is not None
    except Exception as exc:  # pragma: no cover - salvaguarda defensiva
        # Sin ``exc_info``: el traceback de SQLAlchemy puede incluir parámetros con
        # contenido del usuario (títulos/descripciones). Solo se registra el tipo.
        logger.error(
            "Todoist import: no se pudo verificar el marcador tras el conflicto: %s",
            type(exc).__name__,
        )
        return False


async def _rollback_quietly(session: AsyncSession) -> None:
    """Revierte la transacción sin enmascarar la excepción original."""
    try:
        await session.rollback()
    except Exception as exc:  # pragma: no cover - salvaguarda defensiva
        # Sin ``exc_info``: nunca se arrastra el mensaje crudo ni los parámetros SQL.
        logger.error(
            "Todoist import: fallo al revertir la transacción del lote: %s",
            type(exc).__name__,
        )


# ── Carga de estado existente ───────────────────────────────────────────────────


async def _load_existing_active_titles(session: AsyncSession, user_id: UUID) -> set[str]:
    result = await session.exec(
        select(Task.titulo).where(
            Task.user_id == user_id,
            Task.deleted_at.is_(None),
            Task.completed == False,
        )
    )
    titles: set[str] = set()
    for row in result.all():
        titles.add(row[0] if isinstance(row, tuple) else row)
    return titles


async def _load_existing_room_names(session: AsyncSession, user_id: UUID) -> set[str]:
    result = await session.exec(select(Room.nombre).where(Room.owner_id == user_id))
    names: set[str] = set()
    for row in result.all():
        names.add(row[0] if isinstance(row, tuple) else row)
    return names


async def _load_existing_tags(session: AsyncSession, user_id: UUID) -> dict[str, UUID]:
    result = await session.exec(select(Tag).where(Tag.user_id == user_id))
    return {tag.nombre: tag.id for tag in result.all()}


# ── Importación ─────────────────────────────────────────────────────────────────


def _report_unsupported_features(payload: TodoistSyncPayload, state: _State) -> None:
    if payload.sections:
        state.warn("Secciones (sections): no soportadas en el MVP, se ignoran.")
    if payload.notes or payload.project_notes:
        state.warn("Comentarios/notas: no soportados en el MVP, se ignoran.")
    if payload.reminders or payload.reminders_location:
        state.warn("Recordatorios (incluidos los de ubicación): no soportados en el MVP, se ignoran.")
    if payload.filters:
        state.warn("Filtros guardados: no soportados en el MVP, se ignoran.")
    if any(item.deadline is not None for item in payload.items):
        state.warn("Deadlines: no soportados en el MVP, se ignoran.")
    if any(item.due is not None and item.due.is_recurring for item in payload.items):
        state.warn("Recurrencia (due.is_recurring/due.string): no soportada en el MVP, se importa como no recurrente.")
    if any(item.due is not None and item.due.timezone for item in payload.items):
        state.warn("Zona horaria fija en 'due': se normaliza a UTC, se pierde la intención flotante/fija.")
    if any(item.labels for item in payload.items if item.parent_id):
        state.warn("Etiquetas en subtareas: no soportadas (Subtask no admite etiquetas), se ignoran.")


def _report_duplicate_ids(payload: TodoistSyncPayload, state: _State) -> None:
    """M4: contabiliza IDs externos duplicados (actualmente colapsados en silencio).

    Al indexar por ``id`` en un diccionario, solo sobrevive la última aparición. Aquí se
    hace explícita esa pérdida: cada duplicado suma a ``skipped`` y, si corresponde, añade
    un aviso agregado por colección (sin loggear contenido sensible).
    """
    for collection, entity in (("projects", "project"), ("items", "item"), ("labels", "label")):
        seen: set[str] = set()
        duplicates = 0
        for obj in getattr(payload, collection, []) or []:
            external_id = getattr(obj, "id", None)
            if not external_id:
                continue
            if external_id in seen:
                duplicates += 1
                state.skip(
                    entity,
                    "ID externo duplicado en el payload: se conserva la última aparición.",
                    external_id=str(external_id),
                )
            else:
                seen.add(external_id)
        if duplicates:
            state.warn(
                f"Se detectaron {duplicates} entidades con ID duplicado en '{collection}'; "
                "se conserva la última aparición de cada ID."
            )


async def _create_rooms(payload: TodoistSyncPayload, state: _State) -> None:
    session = state.session
    projects = [p for p in payload.projects if p.id and not p.is_deleted]
    if not projects:
        return

    used_names = await _load_existing_room_names(session, state.current_user.id)
    children: dict[str, list[str]] = {}
    project_ids = {p.id for p in projects}
    roots: list[str] = []
    for project in projects:
        if project.parent_id and project.parent_id in project_ids:
            children.setdefault(project.parent_id, []).append(project.id)
        else:
            roots.append(project.id)

    by_id = {p.id: p for p in projects}

    async def create(project_id: str) -> None:
        project = by_id[project_id]
        raw_name = (project.name or "").strip()
        if not raw_name:
            raw_name = f"Proyecto {_safe_external_id(project.id)}"
        base = truncate(raw_name, MAX_ROOM_NAME_LENGTH)
        if len(base) < len(raw_name):
            state.report.truncated += 1
        name, renamed = unique_name(base, used_names, MAX_ROOM_NAME_LENGTH)
        used_names.add(name)
        if renamed:
            state.report.renamed += 1

        parent_uuid = None
        if project.parent_id and project.parent_id in state.rooms:
            parent_uuid = state.rooms[project.parent_id]

        room = Room(
            nombre=name,
            owner_id=state.current_user.id,
            parent_id=parent_uuid,
        )
        await _add_pending(session, room)

        state.rooms[project.id] = room.id
        state.report.rooms_created += 1

    # Orden topológico: padres antes que hijos (BFS desde las raíces).
    queue = list(roots)
    visited: set[str] = set()
    while queue:
        project_id = queue.pop(0)
        if project_id in visited:
            continue
        visited.add(project_id)
        await create(project_id)
        queue.extend(children.get(project_id, []))

    # Proyectos huérfanos por ciclo: se importan como raíz para no perder datos.
    for project in projects:
        if project.id not in visited:
            await create(project.id)


async def _create_tags(payload: TodoistSyncPayload, state: _State) -> None:
    session = state.session
    state.tags = await _load_existing_tags(session, state.current_user.id)

    needed: list[str] = []
    for label in payload.labels:
        if label.is_deleted or not label.name:
            continue
        needed.append(label.name)
    for item in payload.items:
        needed.extend(item.labels or [])

    for raw_name in needed:
        clean = truncate(raw_name.strip(), MAX_TAG_NAME_LENGTH)
        if not clean:
            continue
        if clean in state.tags:
            continue
        if len(clean) < len(raw_name.strip()):
            state.report.truncated += 1
        tag = Tag(nombre=clean, user_id=state.current_user.id)
        await _add_pending(session, tag)
        state.tags[clean] = tag.id
        state.report.tags_created += 1


def _root_id(item: TodoistItem, items_index: dict[str, TodoistItem]) -> str:
    """Devuelve el id del item raíz de la cadena de ``parent_id`` (rompe ciclos)."""
    seen = {item.id}
    current = item
    while True:
        parent = items_index.get(current.parent_id) if current.parent_id else None
        if parent is None or parent.id in seen:
            return current.id
        seen.add(parent.id)
        current = parent


async def _create_tasks(payload: TodoistSyncPayload, state: _State) -> None:
    session = state.session
    state.active_titles = await _load_existing_active_titles(session, state.current_user.id)

    items_index = {i.id: i for i in payload.items if i.id and not i.is_deleted}
    roots = [item for item in items_index.values() if _root_id(item, items_index) == item.id]

    for item in roots:
        await _create_single_task(item, state)


async def _create_single_task(item: TodoistItem, state: _State) -> bool:
    session = state.session

    room_id = state.rooms.get(item.project_id) if item.project_id else None
    if room_id is None:
        state.skip("item", "El proyecto referenciado no está en el payload.", external_id=item.id, title=item.content)
        return False

    title = normalize_title(item.content)
    if title is None:
        state.skip("item", "Título vacío o más corto que el mínimo de 3 caracteres.", external_id=item.id, title=item.content)
        return False
    if len(title) > MAX_TITLE_LENGTH:
        title = truncate(title, MAX_TITLE_LENGTH)
        state.report.truncated += 1

    description = item.description
    if description is not None:
        description = description.strip() or None
        if description is not None and len(description) > MAX_DESCRIPTION_LENGTH:
            description = truncate(description, MAX_DESCRIPTION_LENGTH)
            state.report.truncated += 1

    due_date = None
    if item.due is not None and item.due.date:
        due_date = parse_due_date(item.due.date)
        if (
            due_date is not None
            and due_date < datetime.now(UTC)
            and not _allow_past_due_dates()
        ):
            # M6: sin ``ALLOW_PAST_DUE_DATES`` se re-ancla a ``now()`` (se pierde el
            # estado "atrasada"). Con la bandera activa se conserva la fecha pasada.
            due_date = datetime.now(UTC)
            state.report.clamped_due_dates += 1

    completed = bool(item.checked)
    if not completed:
        title, renamed = unique_name(title, state.active_titles, MAX_TITLE_LENGTH)
        if renamed:
            state.report.renamed += 1
        state.active_titles.add(title)

    task = Task(
        titulo=title,
        descripcion=description,
        categoria=CategoriaTarea.OTRO,
        estado=EstadoTarea.DONE if completed else EstadoTarea.TODO,
        peso=priority_to_peso(item.priority),
        completed=completed,
        due_date=due_date,
        is_recurring=False,
        user_id=state.current_user.id,
        room_id=room_id,
    )
    await _add_pending(session, task)

    state.tasks[item.id] = task.id
    state.report.tasks_created += 1
    state.affected_rooms.add(room_id)

    # TODO(M1): registrar el evento CREATED en TaskHistory para las tareas importadas
    # (diferido a una iteración posterior; hoy solo se registra historial vía /sync).

    await _attach_labels(item, task.id, state)
    return True


async def _attach_labels(item: TodoistItem, task_id: UUID, state: _State) -> None:
    session = state.session
    seen_tags: set[UUID] = set()
    for raw_name in item.labels or []:
        clean = truncate(raw_name.strip(), MAX_TAG_NAME_LENGTH)
        tag_id = state.tags.get(clean)
        if tag_id is None or tag_id in seen_tags:
            continue
        seen_tags.add(tag_id)
        link = TaskTag(task_id=task_id, tag_id=tag_id)
        await _add_pending(session, link)
        state.report.task_tags_created += 1


async def _create_subtasks(payload: TodoistSyncPayload, state: _State) -> None:
    items_index = {i.id: i for i in payload.items if i.id and not i.is_deleted}
    for item in items_index.values():
        root = _root_id(item, items_index)
        if root == item.id:
            continue  # es una tarea raíz
        parent_task_id = state.tasks.get(root)
        raw_title = (item.content or "").strip()
        if parent_task_id is None:
            state.skip(
                "subtask",
                "La tarea padre fue omitida o no está en el payload.",
                external_id=item.id,
                title=raw_title or None,
            )
            continue
        if not raw_title:
            state.skip("subtask", "Subtarea sin título.", external_id=item.id)
            continue
        subtask_title = truncate(raw_title, MAX_SUBTASK_TITLE_LENGTH)
        if len(subtask_title) < len(raw_title):
            state.report.truncated += 1

        subtask = Subtask(
            task_id=parent_task_id,
            titulo=subtask_title,
            completada=bool(item.checked),
            orden=int(item.child_order or 0),
        )
        await _add_pending(state.session, subtask)
        state.report.subtasks_created += 1


def _import_idempotency_key(
    raw_body: bytes, current_user: Usuario, idempotency_key: str | None
) -> str:
    """R2: deriva una clave de idempotencia estable y namespaced por usuario.

    Material: la cabecera ``Idempotency-Key`` si el cliente la envía; en su defecto, el
    **hash de contenido** del cuerpo (así un reintento byte-idéntico —fallo de red o doble
    envío— produce la misma clave sin requerir cabecera). La clave se namespacia con el
    ``user_id`` para que dos usuarios que importen el mismo archivo no colisionen.

    El resultado mide ≤ 64 caracteres (límite de ``ProcessedSyncCommand.command_uuid``).
    """
    material = idempotency_key if idempotency_key else hashlib.sha256(raw_body).hexdigest()
    digest = hashlib.sha256(f"{current_user.id}:{material}".encode()).hexdigest()
    return f"ti-{digest[:61]}"


async def run_todoist_import(
    raw_body: bytes,
    *,
    session: AsyncSession,
    current_user: Usuario,
    idempotency_key: str | None = None,
) -> TodoistImportReport:
    """Importa un volcado *Sync* de Todoist para ``current_user`` y devuelve el informe.

    Idempotente (R2): si ya se procesó una petición con la misma clave (cabecera
    ``Idempotency-Key`` o hash de contenido del cuerpo, namespaced por usuario), no se
    vuelve a escribir nada y se devuelve ``already_imported=True`` con contadores en cero.
    El marcador reutiliza ``ProcessedSyncCommand`` (misma PK única, ya migrada).

    Atómico (R2): el grafo y el marcador se confirman en una única transacción. Si la
    persistencia falla en cualquier punto se revierte el lote completo (0 filas en
    ``Room``/``Task``/``Subtask``/``Tag``/``TaskTag`` y 0 marcadores) y se lanza
    :class:`ImportPersistenceError`; un reintento posterior importa limpio.
    """
    if len(raw_body) > MAX_PAYLOAD_BYTES:
        raise PayloadTooLargeError(
            f"El payload excede el tamaño máximo de {MAX_PAYLOAD_BYTES} bytes."
        )

    try:
        payload = TodoistSyncPayload.model_validate_json(raw_body or b"{}")
    except ValidationError as exc:
        raise InvalidPayloadError("El payload no es un JSON con la forma esperada del Sync de Todoist.") from exc

    _validate_limits(payload)

    import_key = _import_idempotency_key(raw_body, current_user, idempotency_key)
    existing = await session.get(ProcessedSyncCommand, import_key)
    if existing is not None:
        # Reintento idempotente: no se reescribe el grafo (evita duplicados ROOMS 'X'/'X (2)').
        logger.info(
            "Todoist import: reintento idempotente ignorado (user=%s, key=%s).",
            current_user.id,
            import_key,
        )
        return TodoistImportReport(already_imported=True)

    state = _State(session=session, current_user=current_user)
    _report_unsupported_features(payload, state)
    _report_duplicate_ids(payload, state)

    # R2: el grafo importado y el marcador de idempotencia se escriben en UNA sola
    # transacción (todo o nada). No se usan SAVEPOINTs por entidad: en SQLite,
    # ``RELEASE SAVEPOINT`` sin transacción externa explícita hace COMMIT del lote,
    # lo que dejaba salas/tareas persistidas sin su marcador si algo fallaba después.
    try:
        await _create_rooms(payload, state)
        await _create_tags(payload, state)
        await _create_tasks(payload, state)
        await _create_subtasks(payload, state)

        session.add(
            ProcessedSyncCommand(
                command_uuid=import_key,
                user_id=current_user.id,
                command_type="todoist_import",
                status="ok",
            )
        )
        await session.commit()
    except IntegrityError as exc:
        # Doble envío concurrente: otra petición con la misma clave confirmó su marcador
        # (y su grafo) mientras esta construía el lote. Se revierte todo y se responde
        # como reintento idempotente en lugar de propagar un 500.
        await _rollback_quietly(session)
        if await _marker_exists(session, import_key):
            logger.info(
                "Todoist import: petición concurrente ya confirmada; lote revertido "
                "(user=%s, key=%s).",
                current_user.id,
                import_key,
            )
            return TodoistImportReport(already_imported=True)
        # Solo el tipo de excepción: el traceback de SQLAlchemy incluye la sección
        # ``[parameters: ...]`` con títulos/descripciones del usuario (PII).
        logger.error(
            "Todoist import: violación de integridad; lote revertido "
            "(user=%s, key=%s): %s",
            current_user.id,
            import_key,
            type(exc).__name__,
        )
        raise ImportPersistenceError(
            "La importación no se pudo completar por un conflicto de datos; no se aplicó ningún cambio."
        ) from exc
    except Exception as exc:
        # Un fallo de persistencia en cualquier punto aborta el lote completo (batched).
        await _rollback_quietly(session)
        # Solo el tipo de excepción: ``str(exc)``/traceback podrían contener datos
        # del payload (títulos, descripciones) vía parámetros de SQLAlchemy.
        logger.error(
            "Todoist import: fallo inesperado; lote revertido (user=%s, key=%s): %s",
            current_user.id,
            import_key,
            type(exc).__name__,
        )
        raise ImportPersistenceError(
            "La importación falló y no se aplicó ningún cambio. Reintenta la operación."
        ) from exc

    logger.info(
        "Todoist import completado (user=%s): rooms=%d tasks=%d subtasks=%d tags=%d "
        "task_tags=%d skipped=%d failed=%d renamed=%d truncated=%d clamped_due_dates=%d.",
        current_user.id,
        state.report.rooms_created,
        state.report.tasks_created,
        state.report.subtasks_created,
        state.report.tags_created,
        state.report.task_tags_created,
        state.report.skipped,
        state.report.failed,
        state.report.renamed,
        state.report.truncated,
        state.report.clamped_due_dates,
    )

    # Efecto secundario acotado: UN evento agregado por sala y sin gamificación por lote.
    for room_id in state.affected_rooms:
        await invalidate_room_analytics_cache(room_id)
        await event_broadcaster.broadcast(
            room_id,
            "TASKS_IMPORTED",
            {
                "room_id": str(room_id),
                "tasks_created": state.report.tasks_created,
                "subtasks_created": state.report.subtasks_created,
            },
        )

    return state.report


__all__ = [
    "MAX_ENTITIES",
    "MAX_NESTING_DEPTH",
    "MAX_PAYLOAD_BYTES",
    "ImportLimitExceededError",
    "ImportPersistenceError",
    "InvalidPayloadError",
    "PayloadTooLargeError",
    "TodoistImportError",
    "normalize_title",
    "parse_due_date",
    "priority_to_peso",
    "run_todoist_import",
    "truncate",
    "unique_name",
]
