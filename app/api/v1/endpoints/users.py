from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.session import get_session
from app.models.user import Usuario
from app.schemas.user import UsuarioRead
from app.services.auth import get_current_user

router = APIRouter(prefix="/users", tags=["Usuarios"])

@router.get("", response_model=list[UsuarioRead], summary="Lista de usuarios")
async def list_users(
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    result = await session.exec(select(Usuario))
    return result.all()
