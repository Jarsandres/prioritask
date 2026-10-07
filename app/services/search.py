import re
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.subtask import Subtask
from app.models.tag import Tag
from app.models.task import Task
from app.models.task_tag import TaskTag
from app.models.user import Usuario
from app.schemas.search import SearchResultItem, TaskSearchResponse
from app.schemas.task import TaskRead


class SearchEngineService:
    """Motor de búsqueda tokenizada y ponderada por relevancia para tareas."""

    PESO_TITULO = 3.0
    PESO_ETIQUETAS = 2.0
    PESO_DESCRIPCION = 1.0
    PESO_SUBTAREAS = 1.0

    @classmethod
    async def search(
        cls,
        *,
        query: str,
        current_user: Usuario,
        session: AsyncSession,
        room_id: UUID | None = None,
        limit: int = 20,
    ) -> TaskSearchResponse:
        """
        Ejecuta una búsqueda ponderada con validación estricta de seguridad.

        - Límite de consulta sanitizada: 100 caracteres.
        - Prevención de inyección y ReDoS mediante tokenización alfanumérica limpia.
        - Filtrado estricto: deleted_at IS NULL y pertenencia a la sala/propiedad.
        """
        # 1. Sanitización de la consulta
        sanitized_query = query[:100].strip()
        sanitized_query = re.sub(r"[\x00-\x1f\x7f]", "", sanitized_query)
        if not sanitized_query:
            return TaskSearchResponse(total_matches=0, results=[])

        tokens = [t.lower() for t in re.findall(r"\w+", sanitized_query) if len(t) > 0]
        if not tokens:
            return TaskSearchResponse(total_matches=0, results=[])

        # 2. Control de acceso y salas permitidas
        owned_rooms_stmt = select(Room.id).where(Room.owner_id == current_user.id)
        member_rooms_stmt = select(RoomMember.room_id).where(RoomMember.user_id == current_user.id)

        owned_room_ids = set((await session.exec(owned_rooms_stmt)).all())
        member_room_ids = set((await session.exec(member_rooms_stmt)).all())
        accessible_room_ids = owned_room_ids.union(member_room_ids)

        if room_id is not None:
            if room_id not in accessible_room_ids:
                room = await session.get(Room, room_id)
                if not room:
                    raise HTTPException(status_code=404, detail="Hogar no encontrado")
                raise HTTPException(status_code=403, detail="No tienes acceso a este hogar")
            security_condition = Task.room_id == room_id
        else:
            if accessible_room_ids:
                security_condition = or_(
                    Task.user_id == current_user.id,
                    Task.room_id.in_(accessible_room_ids),
                )
            else:
                security_condition = Task.user_id == current_user.id

        # 3. Filtro de coincidencia en base de datos para recuperar candidatos
        token_conditions = []
        for token in tokens:
            token_conditions.append(Task.titulo.ilike(f"%{token}%"))
            token_conditions.append(Task.descripcion.ilike(f"%{token}%"))

        tag_subquery = (
            select(TaskTag.task_id)
            .join(Tag, Tag.id == TaskTag.tag_id)
            .where(or_(*[Tag.nombre.ilike(f"%{token}%") for token in tokens]))
        )

        subtask_subquery = (
            select(Subtask.task_id)
            .where(
                Subtask.deleted_at.is_(None),
                or_(*[Subtask.titulo.ilike(f"%{token}%") for token in tokens]),
            )
        )

        candidate_filter = or_(
            *token_conditions,
            Task.id.in_(tag_subquery),
            Task.id.in_(subtask_subquery),
        )

        stmt = (
            select(Task)
            .options(
                selectinload(Task.etiquetas).selectinload(TaskTag.etiqueta),
                selectinload(Task.subtasks),
            )
            .where(
                Task.deleted_at.is_(None),
                security_condition,
                candidate_filter,
            )
        )

        candidates = (await session.exec(stmt)).all()
        if not candidates:
            return TaskSearchResponse(total_matches=0, results=[])

        # 4. Cálculo de relevancia ponderada
        scored_items: list[SearchResultItem] = []
        query_lower = sanitized_query.lower()

        for task in candidates:
            score = 0.0
            matched_fields: list[str] = []

            # Título (peso A: 3.0)
            title_lower = (task.titulo or "").lower()
            title_matches = sum(1 for t in tokens if t in title_lower)
            if title_matches > 0:
                score += cls.PESO_TITULO * title_matches
                if query_lower in title_lower:
                    score += 1.5  # Bonificación por frase exacta en título
                matched_fields.append("titulo")

            # Etiquetas (peso B: 2.0)
            tag_names = [t.nombre.lower() for t in task.tags if t.nombre]
            tag_matches = sum(
                1 for tname in tag_names for token in tokens if token in tname
            )
            if tag_matches > 0:
                score += cls.PESO_ETIQUETAS * tag_matches
                matched_fields.append("etiquetas")

            # Descripción (peso C: 1.0)
            desc_lower = (task.descripcion or "").lower()
            desc_matches = sum(1 for t in tokens if t in desc_lower)
            if desc_matches > 0:
                score += cls.PESO_DESCRIPCION * desc_matches
                matched_fields.append("descripcion")

            # Subtareas (peso C: 1.0)
            subtask_titles = [
                s.titulo.lower()
                for s in task.subtasks
                if getattr(s, "deleted_at", None) is None and s.titulo
            ]
            subtask_matches = sum(
                1 for stitle in subtask_titles for token in tokens if token in stitle
            )
            if subtask_matches > 0:
                score += cls.PESO_SUBTAREAS * subtask_matches
                matched_fields.append("subtareas")

            if score > 0:
                task_read = TaskRead.model_validate(task)
                scored_items.append(
                    SearchResultItem(
                        task=task_read,
                        relevance_score=round(score, 2),
                        matched_fields=list(dict.fromkeys(matched_fields)),
                    )
                )

        # 5. Ordenamiento por relevancia descendente y fecha de creación
        scored_items.sort(
            key=lambda item: (item.relevance_score, item.task.created_at),
            reverse=True,
        )

        total_matches = len(scored_items)
        results = scored_items[:limit]

        return TaskSearchResponse(total_matches=total_matches, results=results)
