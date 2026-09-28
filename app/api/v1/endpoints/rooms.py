from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import selectinload
from sqlmodel import func, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.enums import RoomMemberRole
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.user import Usuario
from app.schemas.room import RoomCreate, RoomRead, RoomUpdate
from app.schemas.room_member import (
    RoomMemberCreate,
    RoomMemberRead,
    RoomMemberUpdate,
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/rooms", tags=["Hogar"])


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