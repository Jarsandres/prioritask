from fastapi import APIRouter, Depends, HTTPException
from starlette.status import HTTP_401_UNAUTHORIZED
from sqlalchemy import select

from app.schemas.user import UsuarioCreate, UsuarioRead, UsuarioLogin
from app.services import auth as auth_srv
from app.db.session import get_session
from app.models.user import Usuario
from sqlmodel.ext.asyncio.session import AsyncSession
import os
from app.services.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")

@router.post("/register", response_model=UsuarioRead, status_code=201)
async def register(payload: UsuarioCreate):
    user = await auth_srv.create_user(payload, SECRET_KEY)
    return user

@router.post("/login")
async def login(payload: UsuarioLogin, session: AsyncSession = Depends(get_session)):
    user = await session.scalar(
        select(Usuario).where(Usuario.email == payload.email)  # noqa
    )
    if not user or not auth_srv.verify_password(payload.password, user.hashed_password):
        raise HTTPException(HTTP_401_UNAUTHORIZED, "Credenciales inválidas")
    token = auth_srv.create_access_token(user.id, SECRET_KEY)
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me", response_model=UsuarioRead)
async def get_me(current_user: Usuario = Depends(get_current_user)):
    return current_user
