import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.orm import selectinload
from sqlmodel import case, func, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.models.enums import CategoriaTarea, EstadoTarea
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.task import Task
from app.models.user import Usuario
from app.schemas.analytics import MemberWorkload, RoomAnalyticsResponse

logger = logging.getLogger(__name__)

ANALYTICS_CACHE_TTL = 60  # segundos


async def get_redis_client():
    """Obtiene un cliente asíncrono de Redis si REDIS_URL está configurado."""
    if settings.REDIS_URL:
        try:
            import redis.asyncio as aioredis

            return aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
        except Exception as exc:
            logger.debug("Error conectando a Redis para analítica: %s", exc)
    return None


async def get_cached_room_analytics(room_id: UUID) -> RoomAnalyticsResponse | None:
    """Read-Through Cache en Redis para estadísticas del hogar."""
    client = await get_redis_client()
    if client is None:
        return None
    try:
        key = f"cache:room:{room_id}:analytics"
        data = await client.get(key)
        if data:
            logger.debug("Hit en Read-Through Cache de analítica para sala %s", room_id)
            return RoomAnalyticsResponse.model_validate_json(data)
    except Exception as exc:
        logger.debug("Fallo lectura de caché de analítica (%s): %s", room_id, exc)
    return None


async def set_cached_room_analytics(
    room_id: UUID,
    analytics: RoomAnalyticsResponse,
    ttl: int = ANALYTICS_CACHE_TTL,
) -> None:
    """Almacena estadísticas de analítica en Redis con TTL."""
    client = await get_redis_client()
    if client is None:
        return
    try:
        key = f"cache:room:{room_id}:analytics"
        await client.set(key, analytics.model_dump_json(), ex=ttl)
    except Exception as exc:
        logger.debug("Fallo escritura de caché de analítica (%s): %s", room_id, exc)


async def invalidate_room_analytics_cache(room_id: UUID) -> None:
    """Invalidación reactiva de la clave de analítica en Redis."""
    client = await get_redis_client()
    if client is None:
        return
    try:
        key = f"cache:room:{room_id}:analytics"
        await client.delete(key)
        logger.debug("Invalidada clave de caché de analítica para sala %s", room_id)
    except Exception as exc:
        logger.debug("Fallo invalidación de caché de analítica (%s): %s", room_id, exc)


async def compute_room_analytics(
    room: Room,
    session: AsyncSession,
) -> RoomAnalyticsResponse:
    """Calcula las métricas consolidadas del hogar mediante agregación SQL optimizada

    eliminando cualquier consulta N+1.
    """
    now = datetime.now(UTC)

    # 1. Conteo agregado de tareas activas, completadas y vencidas en una sola consulta
    is_completed_cond = or_(Task.completed.is_(True), Task.estado == EstadoTarea.DONE)
    is_active_cond = or_(
        Task.completed.is_(False),
        Task.completed.is_(None),
    ) & (Task.estado != EstadoTarea.DONE)
    is_overdue_cond = is_active_cond & Task.due_date.is_not(None) & (Task.due_date < now)

    stats_stmt = select(
        func.count(case((is_active_cond, 1))).label("total_activas"),
        func.count(case((is_completed_cond, 1))).label("total_completadas"),
        func.count(case((is_overdue_cond, 1))).label("tareas_vencidas"),
    ).where(
        Task.room_id == room.id,
        Task.deleted_at.is_(None),
    )
    stats_row = (await session.exec(stats_stmt)).first()
    total_activas = stats_row[0] if stats_row and stats_row[0] is not None else 0
    total_completadas = stats_row[1] if stats_row and stats_row[1] is not None else 0
    tareas_vencidas = stats_row[2] if stats_row and stats_row[2] is not None else 0

    # 2. Distribución agregada por categoría
    cat_stmt = (
        select(
            Task.categoria,
            func.count(Task.id),
        )
        .where(
            Task.room_id == room.id,
            Task.deleted_at.is_(None),
        )
        .group_by(Task.categoria)
    )
    cat_rows = (await session.exec(cat_stmt)).all()
    distribucion_por_categoria: dict[str, int] = {cat.value: 0 for cat in CategoriaTarea}
    for cat, count in cat_rows:
        cat_key = cat.value if hasattr(cat, "value") else str(cat)
        distribucion_por_categoria[cat_key] = count

    # 3. Recuperar propietarios y miembros del hogar en una sola consulta SQL
    owner_and_members_stmt = select(Usuario).where(
        or_(
            Usuario.id == room.owner_id,
            Usuario.id.in_(
                select(RoomMember.user_id).where(RoomMember.room_id == room.id)
            ),
        )
    )
    room_users = (await session.exec(owner_and_members_stmt)).all()
    members_map: dict[UUID, str] = {
        u.id: (u.nombre or u.email or "Sin nombre") for u in room_users
    }

    # 4. Tareas con colaboradores cargados de forma ávida (eager loading)
    tasks_stmt = (
        select(Task)
        .options(selectinload(Task.colaboradores))
        .where(
            Task.room_id == room.id,
            Task.deleted_at.is_(None),
        )
    )
    tasks = (await session.exec(tasks_stmt)).all()

    # Identificar posibles usuarios asignados que no figuren en members_map
    missing_uids: set[UUID] = set()
    for t in tasks:
        assigned = {c.user_id for c in t.colaboradores} or {t.user_id}
        for uid in assigned:
            if uid not in members_map:
                missing_uids.add(uid)

    if missing_uids:
        extra_users = (
            await session.exec(select(Usuario).where(Usuario.id.in_(missing_uids)))
        ).all()
        for u in extra_users:
            members_map[u.id] = u.nombre or u.email or "Sin nombre"

    workload_by_member: dict[UUID, MemberWorkload] = {
        uid: MemberWorkload(
            user_id=uid,
            nombre=nombre,
            tareas_asignadas=0,
            tareas_completadas=0,
            peso_total_completado=0.0,
        )
        for uid, nombre in members_map.items()
    }

    for task in tasks:
        is_done = bool(task.completed or task.estado == EstadoTarea.DONE)
        assigned_uids = {c.user_id for c in task.colaboradores} or {task.user_id}
        for uid in assigned_uids:
            if uid in workload_by_member:
                wl = workload_by_member[uid]
                wl.tareas_asignadas += 1
                if is_done:
                    wl.tareas_completadas += 1
                    wl.peso_total_completado = round(
                        wl.peso_total_completado + float(task.peso), 2
                    )

    total_tareas = total_activas + total_completadas
    tasa_completitud = (
        round((total_completadas / total_tareas) * 100.0, 2) if total_tareas > 0 else 0.0
    )

    return RoomAnalyticsResponse(
        room_id=room.id,
        total_tareas_activas=total_activas,
        total_tareas_completadas=total_completadas,
        tasa_completitud=tasa_completitud,
        distribucion_por_categoria=distribucion_por_categoria,
        distribucion_por_miembro=list(workload_by_member.values()),
        tareas_vencidas=tareas_vencidas,
    )
