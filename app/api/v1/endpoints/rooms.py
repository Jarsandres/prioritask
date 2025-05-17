from fastapi import APIRouter, Depends , status
from pydantic import BaseModel
from uuid import uuid4

from  app.services.auth import get_current_user
from app.models.user import Usuario

router = APIRouter(prefix="/rooms", tags=["rooms"])

class RoomCreate(BaseModel):
    nombre: str

@router.post("", status_code=status.HTTP_201_CREATED)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_room(
        payload: RoomCreate,
        current_user: Usuario = Depends(get_current_user),
):
    # Lógica mínima (stub). En futuro: persistir en BD.
    return {
        "room_id": str(uuid4()),
        "owner": current_user.email,
        "nombre": payload.nombre,
    }