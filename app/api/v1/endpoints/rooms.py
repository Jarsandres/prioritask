from fastapi import APIRouter, Depends, status, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.services.auth import get_current_user
from app.models.user import Usuario
from app.models.room import Room
from app.db.session import get_session

router = APIRouter(prefix="/rooms", tags=["rooms"])


class RoomCreate(BaseModel):
    nombre: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_room(
        payload: RoomCreate,
        current_user: Usuario = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
):
    # 1. Comprobar duplicado
    dup = await session.scalar(
        select(Room)
        .where(Room.owner_id == current_user.id)
        .where(Room.nombre == payload.nombre)
    )
    if dup:
        raise HTTPException(status_code=422, detail="Room ya existe")

    # 2. Crear y persistir
    room = Room(nombre=payload.nombre, owner_id=current_user.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room
