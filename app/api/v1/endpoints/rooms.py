from fastapi import APIRouter, Depends, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import select
from app.db.session import get_session
from app.models.room import Room
from app.models.user import Usuario
from app.services.auth import get_current_user
from app.schemas.room import RoomRead
from app.schemas.responses import ERROR_ROOM_DUPLICATE, ERROR_INTERNAL_SERVER_ERROR
from pydantic import BaseModel

router = APIRouter(prefix="/rooms", tags=["Gestión de salas"])

class RoomCreate(BaseModel):
    nombre: str

@router.post("", status_code=status.HTTP_201_CREATED, response_model=RoomRead, summary="Crear sala", description="Crea una nueva sala asociada al usuario autenticado. Devuelve un error 500 si ocurre un problema inesperado en el servidor.")
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

        room = Room(nombre=payload.nombre, owner_id=current_user.id)
        session.add(room)
        await session.commit()
        await session.refresh(room)
        return RoomRead(
            id=room.id,
            nombre=room.nombre,
            owner_id=room.owner_id,
            owner=current_user.email
        )
    except Exception:
        return ERROR_INTERNAL_SERVER_ERROR
