from fastapi import APIRouter, Depends, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import select
from app.db.session import get_session
from app.models.room import Room
from app.models.user import Usuario
from app.services.auth import get_current_user
from app.schemas.room import RoomRead
from pydantic import BaseModel

router = APIRouter(prefix="/rooms", tags=["rooms"])

class RoomCreate(BaseModel):
    nombre: str

@router.post("", status_code=status.HTTP_201_CREATED, response_model=RoomRead)
async def create_room(
        payload: RoomCreate,
        current_user: Usuario = Depends(get_current_user),
        session: AsyncSession = Depends(get_session)
):

    # Verifica unicidad (nombre + owner_id)
    result = await session.exec(
        select(Room).where(
            Room.nombre == payload.nombre,
            Room.owner_id == current_user.id
        )
    )
    existing_room = result.one_or_none()
    if existing_room:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Room ya existe")

    # ... lógica de unicidad ...
    room = Room(nombre=payload.nombre, owner_id=current_user.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)
    # Arma la respuesta con los nombres correctos
    return RoomRead(
        id=room.id,
        nombre=room.nombre,
        owner_id=room.owner_id,
        owner=current_user.email
    )
