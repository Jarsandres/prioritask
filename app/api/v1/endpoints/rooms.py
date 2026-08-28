from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.room import Room
from app.models.user import Usuario
from app.schemas.room import RoomCreate, RoomRead, RoomUpdate
from app.services.auth import get_current_user

router = APIRouter(prefix="/rooms", tags=["Hogar"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=RoomRead,
    summary="Crear Hogar",
    description="Crea un nuevo Hogar asociado al usuario autenticado. Devuelve un error 500 si ocurre un problema inesperado en el servidor."
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
                    detail="Hogar padre no encontrado"
                )

        result = await session.exec(
            select(Room).where(
                Room.nombre == payload.nombre,
                Room.owner_id == current_user.id
            )
        )
        existing_room = result.one_or_none()
        if existing_room:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Ya existe una sala con este nombre para el usuario."
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
        )
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del servidor. Por favor, inténtelo más tarde."
        )


@router.get(
    "",
    response_model=list[RoomRead],
    summary="Listar Hogares",
    description="Devuelve los hogares del usuario autenticado.",
)
async def get_rooms(
    parent_id: UUID | None = Query(None, description="Filtrar por ID de hogar padre"),
    current_user: Usuario = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    List rooms for the authenticated user.

    If ``parent_id`` is provided, only rooms with that parent are returned.
    """
    filters = [Room.owner_id == current_user.id]
    if parent_id is not None:
        filters.append(Room.parent_id == parent_id)

    result = await session.exec(select(Room).where(*filters))
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
    session: AsyncSession = Depends(get_session),
):
    room = await session.get(Room, room_id)
    if not room or room.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sala no encontrada."
        )

    result = await session.exec(
        select(Room).where(
            Room.nombre == payload.nombre,
            Room.owner_id == current_user.id,
            Room.id != room_id
        )
    )
    if result.one_or_none():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ya existe una sala con este nombre para el usuario."
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
            detail="Sala no encontrada."
        )

    await session.delete(room)
    await session.commit()