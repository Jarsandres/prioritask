from fastapi import APIRouter, Depends, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.db.session import get_session
from app.models.room import Room
from app.models.user import Usuario
from app.services.auth import get_current_user
from uuid import UUID
from app.schemas.room import RoomRead, RoomUpdate, RoomCreate
from app.schemas.responses import (
    ERROR_ROOM_DUPLICATE,
    ERROR_INTERNAL_SERVER_ERROR,
    ERROR_ROOM_NOT_FOUND,
)
router = APIRouter(prefix="/rooms", tags=["Hogar"])

@router.post("", status_code=status.HTTP_201_CREATED, response_model=RoomRead, summary="Crear Hogar", description="Crea un nuevo Hogar asociado al usuario autenticado. Devuelve un error 500 si ocurre un problema inesperado en el servidor.")
async def create_room(
        payload: RoomCreate,
        current_user: Usuario = Depends(get_current_user),
        session: AsyncSession = Depends(get_session)
):
    try:
        result = await session.exec(
            select(Room).where(
                Room.nombre == payload.nombre,
                Room.owner_id == current_user.id
            )
        )
        existing_room = result.one_or_none()
        if existing_room:
            return ERROR_ROOM_DUPLICATE

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
        )
    except Exception:
        return ERROR_INTERNAL_SERVER_ERROR


@router.get(
    "",
    response_model=list[RoomRead],
    summary="Listar Hogares",
    description="Devuelve los hogares del usuario autenticado.",
)
async def get_rooms(
        current_user: Usuario = Depends(get_current_user),
        session: AsyncSession = Depends(get_session)
):
    result = await session.exec(
        select(Room).where(Room.owner_id == current_user.id)
    )
    rooms = result.all()
    return [
        RoomRead(
            id=r.id,
            nombre=r.nombre,
            owner_id=r.owner_id,
            owner=current_user.email,
            parent_id=r.parent_id,
        )
        for r in rooms
    ]


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
        session: AsyncSession = Depends(get_session)
):
    room = await session.get(Room, room_id)
    if not room or room.owner_id != current_user.id:
        return ERROR_ROOM_NOT_FOUND

    result = await session.exec(
        select(Room).where(
            Room.nombre == payload.nombre,
            Room.owner_id == current_user.id,
            Room.id != room_id
        )
    )
    if result.one_or_none():
        return ERROR_ROOM_DUPLICATE

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
    )
