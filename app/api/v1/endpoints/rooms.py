import asyncio
import csv
import io
import json
import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import asc
from sqlalchemy.orm import selectinload
from sqlmodel import func, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.comment import TaskComment
from app.models.enums import CategoriaTarea, EstadoTarea, RoomMemberRole
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.task import Task
from app.models.user import Usuario
from app.schemas.analytics import MemberWorkload, RoomAnalyticsResponse
from app.schemas.room import RoomCreate, RoomRead, RoomUpdate
from app.schemas.room_member import (
    RoomMemberCreate,
    RoomMemberRead,
    RoomMemberUpdate,
)
from app.services.auth import get_current_user, get_current_user_flexible
from app.services.events import event_broadcaster

router = APIRouter(prefix="/rooms", tags=["Hogar"])
logger = logging.getLogger(__name__)


class SSEStreamingResponse(StreamingResponse):
    """StreamingResponse that safely handles task cancellation on client disconnect."""

    async def listen_for_disconnect(self, receive) -> None:
        try:
            while True:
                message = await receive()
                if message.get("type") == "http.disconnect":
                    break
        except (asyncio.CancelledError, GeneratorExit, BaseException):
            logger.debug("SSE client disconnect listener terminated.")


async def _get_room_and_verify_admin_access(
    room_id: UUID,
    current_user: Usuario,
    session: AsyncSession,
) -> Room:
    """Check that the room exists and current_user is either the owner or an ADMIN member."""
    room = await session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hogar no encontrado.",
        )
    if room.owner_id == current_user.id:
        return room

    member_res = await session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room_id,
            RoomMember.user_id == current_user.id,
        )
    )
    member = member_res.one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hogar no encontrado.",
        )
    if member.role != RoomMemberRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos de administrador en este hogar.",
        )
    return room


async def _get_room_and_verify_member_access(
    room_id: UUID,
    current_user: Usuario,
    session: AsyncSession,
) -> Room:
    """Check that the room exists and current_user is either the owner or an active member."""
    room = await session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hogar no encontrado.",
        )
    if room.owner_id == current_user.id:
        return room

    member_res = await session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room_id,
            RoomMember.user_id == current_user.id,
        )
    )
    member = member_res.one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hogar no encontrado.",
        )
    return room


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=RoomRead,
    summary="Crear Hogar",
    description="Crea un nuevo Hogar asociado al usuario autenticado. Devuelve un error 500 si ocurre un problema inesperado en el servidor.",
)
async def create_room(
    payload: RoomCreate,
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        if payload.parent_id is not None:
            parent_room = await session.get(Room, payload.parent_id)
            if not parent_room or parent_room.owner_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Hogar padre no encontrado",
                )

        result = await session.exec(
            select(Room).where(
                Room.nombre == payload.nombre,
                Room.owner_id == current_user.id,
            )
        )
        existing_room = result.one_or_none()
        if existing_room:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Ya existe una sala con este nombre para el usuario.",
            )

        room = Room(
            nombre=payload.nombre,
            owner_id=current_user.id,
            parent_id=payload.parent_id,
        )
        session.add(room)
        await session.commit()
        await session.refresh(room)
        return RoomRead(
            id=room.id,
            nombre=room.nombre,
            owner_id=room.owner_id,
            owner=current_user.email,
            parent_id=room.parent_id,
            members=[],
            is_owner=True,
            my_role=RoomMemberRole.ADMIN,
        )
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del servidor. Por favor, inténtelo más tarde.",
        )


@router.get(
    "",
    response_model=list[RoomRead],
    summary="Listar Hogares",
    description="Devuelve los hogares donde el usuario autenticado es propietario o conviviente.",
)
async def get_rooms(
    parent_id: UUID | None = Query(None, description="Filtrar por ID de hogar padre"),
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    List rooms for the authenticated user (owned or member).
    If ``parent_id`` is provided, only rooms with that parent are returned.
    """
    member_subquery = select(RoomMember.room_id).where(RoomMember.user_id == current_user.id)
    query = (
        select(Room)
        .where(
            or_(
                Room.owner_id == current_user.id,
                Room.id.in_(member_subquery),
            )
        )
        .options(
            selectinload(Room.members).selectinload(RoomMember.user),
            selectinload(Room.owner),
        )
    )

    if parent_id is not None:
        query = query.where(Room.parent_id == parent_id)

    result = await session.exec(query)
    rooms = result.all()

    response = []
    for r in rooms:
        is_owner = (r.owner_id == current_user.id)
        my_member = next((m for m in r.members if m.user_id == current_user.id), None)
        my_role = RoomMemberRole.ADMIN if is_owner else (my_member.role if my_member else None)

        members_read = [
            RoomMemberRead(
                user_id=m.user_id,
                room_id=m.room_id,
                role=m.role,
                joined_at=m.joined_at,
                user_email=m.user.email if m.user else None,
                user_nombre=m.user.nombre if m.user else None,
            )
            for m in r.members
        ]

        owner_str = r.owner.email if r.owner else current_user.email

        response.append(
            RoomRead(
                id=r.id,
                nombre=r.nombre,
                owner_id=r.owner_id,
                owner=owner_str,
                parent_id=r.parent_id,
                members=members_read,
                is_owner=is_owner,
                my_role=my_role,
            )
        )
    return response


@router.put(
    "/{room_id}",
    response_model=RoomRead,
    summary="Actualizar Hogar",
    description="Actualiza el nombre de un hogar existente del usuario.",
)
async def update_room(
    room_id: UUID,
    payload: RoomUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await session.get(Room, room_id)
    if not room or room.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sala no encontrada.",
        )

    result = await session.exec(
        select(Room).where(
            Room.nombre == payload.nombre,
            Room.owner_id == current_user.id,
            Room.id != room_id,
        )
    )
    if result.one_or_none():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ya existe una sala con este nombre para el usuario.",
        )

    room.nombre = payload.nombre
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return RoomRead(
        id=room.id,
        nombre=room.nombre,
        owner_id=room.owner_id,
        owner=current_user.email,
        parent_id=room.parent_id,
        members=[],
        is_owner=True,
        my_role=RoomMemberRole.ADMIN,
    )


@router.delete(
    "/{room_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar Hogar",
    description="Elimina un hogar del usuario.",
)
async def delete_room(
    room_id: UUID,
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await session.get(Room, room_id)
    if not room or room.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sala no encontrada.",
        )

    await session.delete(room)
    await session.commit()


# ---------------------------------------------------------------------------
# Sub-endpoints: Convivientes / Miembros de Hogar
# ---------------------------------------------------------------------------

@router.post(
    "/{room_id}/members",
    status_code=status.HTTP_201_CREATED,
    response_model=RoomMemberRead,
    summary="Añadir conviviente",
    description="Añade un nuevo miembro al hogar.",
)
async def add_room_member(
    room_id: UUID,
    payload: RoomMemberCreate,
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await _get_room_and_verify_admin_access(room_id, current_user, session)

    target_user = await session.get(Usuario, payload.user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    if payload.user_id == room.owner_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El usuario ya es propietario de este hogar.",
        )

    existing_res = await session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room_id,
            RoomMember.user_id == payload.user_id,
        )
    )
    if existing_res.one_or_none():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El usuario ya es miembro de este hogar.",
        )

    new_member = RoomMember(
        room_id=room.id,
        user_id=payload.user_id,
        role=payload.role,
    )
    session.add(new_member)
    await session.commit()
    await session.refresh(new_member)

    return RoomMemberRead(
        user_id=new_member.user_id,
        room_id=new_member.room_id,
        role=new_member.role,
        joined_at=new_member.joined_at,
        user_email=target_user.email,
        user_nombre=target_user.nombre,
    )


@router.get(
    "/{room_id}/members",
    response_model=list[RoomMemberRead],
    summary="Listar convivientes",
    description="Devuelve los miembros del hogar.",
)
async def get_room_members(
    room_id: UUID,
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _get_room_and_verify_member_access(room_id, current_user, session)

    res = await session.exec(
        select(RoomMember)
        .where(RoomMember.room_id == room_id)
        .options(selectinload(RoomMember.user))
    )
    members = res.all()

    return [
        RoomMemberRead(
            user_id=m.user_id,
            room_id=m.room_id,
            role=m.role,
            joined_at=m.joined_at,
            user_email=m.user.email if m.user else None,
            user_nombre=m.user.nombre if m.user else None,
        )
        for m in members
    ]


@router.patch(
    "/{room_id}/members/{user_id}",
    response_model=RoomMemberRead,
    summary="Actualizar rol de conviviente",
    description="Actualiza el rol de un miembro en el hogar.",
)
async def update_room_member(
    room_id: UUID,
    user_id: UUID,
    payload: RoomMemberUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await _get_room_and_verify_admin_access(room_id, current_user, session)

    if user_id == room.owner_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se puede modificar el rol del propietario del hogar.",
        )

    res = await session.exec(
        select(RoomMember)
        .where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
        .options(selectinload(RoomMember.user))
    )
    member = res.one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Miembro no encontrado en este hogar.",
        )

    member.role = payload.role
    session.add(member)
    await session.commit()
    await session.refresh(member)

    return RoomMemberRead(
        user_id=member.user_id,
        room_id=member.room_id,
        role=member.role,
        joined_at=member.joined_at,
        user_email=member.user.email if member.user else None,
        user_nombre=member.user.nombre if member.user else None,
    )


@router.delete(
    "/{room_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar o abandonar miembro del hogar",
    description="Permite a un miembro auto-eliminarse o a un administrador expulsar a un miembro.",
)
async def delete_room_member(
    room_id: UUID,
    user_id: UUID,
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hogar no encontrado.",
        )

    if user_id == room.owner_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El propietario no puede ser eliminado del hogar.",
        )

    is_owner = (room.owner_id == current_user.id)
    is_self = (current_user.id == user_id)

    if not is_owner:
        member_res = await session.exec(
            select(RoomMember).where(
                RoomMember.room_id == room_id,
                RoomMember.user_id == current_user.id,
            )
        )
        current_member = member_res.one_or_none()
        if not current_member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Hogar no encontrado.",
            )
        if not is_self and current_member.role != RoomMemberRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para expulsar miembros de este hogar.",
            )

    target_res = await session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room_id,
            RoomMember.user_id == user_id,
        )
    )
    target_member = target_res.one_or_none()
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Miembro no encontrado en este hogar.",
        )

    if is_self and target_member.role == RoomMemberRole.ADMIN:
        admin_count_res = await session.exec(
            select(func.count())
            .select_from(RoomMember)
            .where(
                RoomMember.room_id == room_id,
                RoomMember.role == RoomMemberRole.ADMIN,
            )
        )
        admin_count = admin_count_res.one()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No puedes abandonar el hogar siendo el último administrador.",
            )

    await session.delete(target_member)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{room_id}/analytics",
    response_model=RoomAnalyticsResponse,
    summary="Métricas y Analítica del Hogar",
    description="Retorna estadísticas consolidadas del hogar: tareas activas, completadas, tasa de completitud, tareas vencidas, distribución por categorías y balance de carga por miembro.",
)
async def get_room_analytics(
    room_id: UUID,
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RoomAnalyticsResponse:
    # 1. Validar acceso (propietario o miembro activo)
    room = await _get_room_and_verify_member_access(room_id, current_user, session)

    # 2. Obtener todas las tareas asociadas a la sala (respetando soft delete)
    tasks_res = await session.exec(
        select(Task)
        .options(selectinload(Task.colaboradores))
        .where(
            Task.room_id == room.id,
            Task.deleted_at.is_(None),
        )
    )
    tasks = tasks_res.all()

    # 3. Mapear miembros del hogar (propietario + RoomMember)
    members_map: dict[UUID, str] = {}

    owner = await session.get(Usuario, room.owner_id)
    if owner:
        members_map[owner.id] = owner.nombre or owner.email or "Sin nombre"

    room_members_res = await session.exec(
        select(RoomMember)
        .options(selectinload(RoomMember.user))
        .where(RoomMember.room_id == room.id)
    )
    for rm in room_members_res.all():
        if rm.user:
            members_map[rm.user_id] = rm.user.nombre or rm.user.email or "Sin nombre"
        elif rm.user_id not in members_map:
            u = await session.get(Usuario, rm.user_id)
            members_map[rm.user_id] = (u.nombre or u.email or "Sin nombre") if u else "Sin nombre"

    # Inicializar balance de carga por miembro
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

    # Distribución por categoría
    distribucion_por_categoria: dict[str, int] = {cat.value: 0 for cat in CategoriaTarea}

    total_activas = 0
    total_completadas = 0
    tareas_vencidas = 0
    now = datetime.now(UTC)

    for task in tasks:
        is_completed = bool(task.completed or task.estado == EstadoTarea.DONE)
        if is_completed:
            total_completadas += 1
        else:
            total_activas += 1
            if task.due_date is not None:
                due = task.due_date if task.due_date.tzinfo else task.due_date.replace(tzinfo=UTC)
                if due < now:
                    tareas_vencidas += 1

        cat_key = task.categoria.value if hasattr(task.categoria, "value") else str(task.categoria)
        distribucion_por_categoria[cat_key] = distribucion_por_categoria.get(cat_key, 0) + 1

        # Miembros asignados: colaboradores explícitos o el creador de la tarea
        assigned_uids = {c.user_id for c in task.colaboradores}
        if not assigned_uids:
            assigned_uids = {task.user_id}

        for uid in assigned_uids:
            if uid in workload_by_member:
                wl = workload_by_member[uid]
                wl.tareas_asignadas += 1
                if is_completed:
                    wl.tareas_completadas += 1
                    wl.peso_total_completado = round(wl.peso_total_completado + float(task.peso), 2)
            else:
                u = await session.get(Usuario, uid)
                u_name = (u.nombre or u.email or "Sin nombre") if u else "Sin nombre"
                members_map[uid] = u_name
                wl = MemberWorkload(
                    user_id=uid,
                    nombre=u_name,
                    tareas_asignadas=1,
                    tareas_completadas=1 if is_completed else 0,
                    peso_total_completado=round(float(task.peso), 2) if is_completed else 0.0,
                )
                workload_by_member[uid] = wl

    total_tareas = total_activas + total_completadas
    tasa_completitud = round((total_completadas / total_tareas) * 100.0, 2) if total_tareas > 0 else 0.0

    return RoomAnalyticsResponse(
        room_id=room.id,
        total_tareas_activas=total_activas,
        total_tareas_completadas=total_completadas,
        tasa_completitud=tasa_completitud,
        distribucion_por_categoria=distribucion_por_categoria,
        distribucion_por_miembro=list(workload_by_member.values()),
        tareas_vencidas=tareas_vencidas,
    )


@router.get(
    "/{room_id}/events",
    summary="Eventos del Hogar en tiempo real (SSE)",
    description="Canal de Server-Sent Events (SSE) para recibir actualizaciones en tiempo real del hogar.",
)
async def room_events(
    room_id: UUID,
    request: Request,
    current_user: Usuario = Depends(get_current_user_flexible),
    session: AsyncSession = Depends(get_session),
):
    room = await session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hogar no encontrado.",
        )

    is_owner = (room.owner_id == current_user.id)
    if not is_owner:
        member_res = await session.exec(
            select(RoomMember).where(
                RoomMember.room_id == room_id,
                RoomMember.user_id == current_user.id,
            )
        )
        if not member_res.one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para acceder a los eventos de este hogar.",
            )

    queue = await event_broadcaster.subscribe(room_id)

    async def event_generator():
        try:
            yield f"event: ping\ndata: {json.dumps({'status': 'connected', 'room_id': str(room_id)})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=0.2)
                    event_type = msg.get("event", "message")
                    if event_type == "close":
                        break
                    payload = json.dumps(msg.get("data", {}), default=str)
                    yield f"event: {event_type}\ndata: {payload}\n\n"
                except TimeoutError:
                    if await request.is_disconnected():
                        break
                    yield ": keepalive\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            logger.debug("SSE stream desconectado para la sala %s", room_id)
        except Exception as e:
            logger.debug("SSE stream finalizado con error en la sala %s: %s", room_id, e)
        finally:
            await event_broadcaster.unsubscribe(room_id, queue)

    return SSEStreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/{room_id}/export",
    summary="Exportar datos del hogar (GDPR)",
    description="Genera y descarga un volcado de datos completo del hogar en formato JSON o CSV.",
)
async def export_room_data(
    room_id: UUID,
    format: str = Query("json", description="Formato de exportación ('json' o 'csv')"),
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    # 1. Validar pertenencia o propiedad del hogar
    room = await _get_room_and_verify_member_access(room_id, current_user, session)

    fmt = format.lower().strip()
    if fmt not in ("json", "csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de exportación inválido. Opciones admitidas: 'json', 'csv'.",
        )

    # 2. Cargar miembros del hogar
    members_res = await session.exec(
        select(RoomMember, Usuario)
        .join(Usuario, Usuario.id == RoomMember.user_id)
        .where(RoomMember.room_id == room_id)
    )
    members_pairs = members_res.all()

    # 3. Cargar tareas activas del hogar con sus dependencias
    tasks_res = await session.exec(
        select(Task)
        .options(
            selectinload(Task.usuario),
            selectinload(Task.subtasks),
            selectinload(Task.comments).selectinload(TaskComment.user),
            selectinload(Task.attachments),
        )
        .where(
            Task.room_id == room_id,
            Task.deleted_at.is_(None),
        )
        .order_by(asc(Task.created_at))
    )
    tasks = tasks_res.all()

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    disposition_filename = f"prioritask_room_{room_id}_{timestamp}.{fmt}"
    headers = {
        "Content-Disposition": f'attachment; filename="{disposition_filename}"',
    }

    if fmt == "csv":
        async def stream_csv():
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                "ID tarea",
                "Título",
                "Categoría",
                "Estado",
                "Prioridad/Peso",
                "Vencimiento",
                "Subtareas completadas",
                "Autor",
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

            for t in tasks:
                author_name = (
                    t.usuario.nombre
                    if (t.usuario and t.usuario.nombre)
                    else (t.usuario.email if t.usuario else str(t.user_id))
                )
                completed_subtasks = sum(
                    1 for st in t.subtasks if st.completada and getattr(st, "deleted_at", None) is None
                )
                total_subtasks = sum(
                    1 for st in t.subtasks if getattr(st, "deleted_at", None) is None
                )
                subtasks_str = f"{completed_subtasks}/{total_subtasks}" if total_subtasks > 0 else str(completed_subtasks)
                due_str = t.due_date.isoformat() if t.due_date else ""
                cat_str = t.categoria.value if hasattr(t.categoria, "value") else str(t.categoria)
                status_str = t.estado.value if hasattr(t.estado, "value") else str(t.estado)

                writer.writerow([
                    str(t.id),
                    t.titulo,
                    cat_str,
                    status_str,
                    str(t.peso),
                    due_str,
                    subtasks_str,
                    author_name,
                ])
                yield output.getvalue()
                output.seek(0)
                output.truncate(0)

        return StreamingResponse(
            stream_csv(),
            media_type="text/csv; charset=utf-8",
            headers=headers,
        )

    # Si es formato JSON: volcado jerárquico exhaustivo
    async def stream_json():
        room_data = {
            "id": str(room.id),
            "nombre": room.nombre,
            "owner_id": str(room.owner_id),
            "created_at": room.created_at.isoformat() if room.created_at else None,
        }
        members_data = [
            {
                "user_id": str(rm.user_id),
                "room_id": str(rm.room_id),
                "nombre": u.nombre,
                "email": u.email,
                "role": rm.role.value if hasattr(rm.role, "value") else str(rm.role),
                "joined_at": rm.joined_at.isoformat() if rm.joined_at else None,
            }
            for rm, u in members_pairs
        ]

        yield '{\n  "room": ' + json.dumps(room_data, ensure_ascii=False) + ',\n'
        yield '  "hogar": ' + json.dumps(room_data, ensure_ascii=False) + ',\n'
        yield '  "members": ' + json.dumps(members_data, ensure_ascii=False) + ',\n'
        yield '  "miembros": ' + json.dumps(members_data, ensure_ascii=False) + ',\n'
        yield '  "tasks": [\n'

        for idx, t in enumerate(tasks):
            t_data = {
                "id": str(t.id),
                "titulo": t.titulo,
                "descripcion": t.descripcion,
                "categoria": t.categoria.value if hasattr(t.categoria, "value") else str(t.categoria),
                "estado": t.estado.value if hasattr(t.estado, "value") else str(t.estado),
                "peso": t.peso,
                "completed": t.completed,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "is_recurring": t.is_recurring,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "autor": {
                    "id": str(t.usuario.id) if t.usuario else str(t.user_id),
                    "nombre": t.usuario.nombre if t.usuario else None,
                    "email": t.usuario.email if t.usuario else None,
                },
                "subtasks": [
                    {
                        "id": str(st.id),
                        "titulo": st.titulo,
                        "completada": st.completada,
                        "created_at": st.created_at.isoformat() if st.created_at else None,
                    }
                    for st in t.subtasks
                    if getattr(st, "deleted_at", None) is None
                ],
                "comments": [
                    {
                        "id": str(c.id),
                        "user_id": str(c.user_id),
                        "author_name": c.user.nombre if (getattr(c, "user", None) and c.user) else None,
                        "contenido": c.contenido,
                        "created_at": c.created_at.isoformat() if c.created_at else None,
                    }
                    for c in t.comments
                    if getattr(c, "deleted_at", None) is None
                ],
                "attachments": [
                    {
                        "id": str(att.id),
                        "filename": att.filename,
                        "content_type": att.content_type,
                        "file_size_bytes": att.file_size_bytes,
                        "caption": att.caption,
                        "created_at": att.created_at.isoformat() if att.created_at else None,
                    }
                    for att in getattr(t, "attachments", [])
                    if getattr(att, "deleted_at", None) is None
                ],
            }
            t_data["subtareas"] = t_data["subtasks"]
            t_data["comentarios"] = t_data["comments"]
            t_data["adjuntos"] = t_data["attachments"]

            item_str = "    " + json.dumps(t_data, ensure_ascii=False)
            if idx < len(tasks) - 1:
                item_str += ","
            item_str += "\n"
            yield item_str

        yield "  ]\n}\n"

    return StreamingResponse(
        stream_json(),
        media_type="application/json",
        headers=headers,
    )