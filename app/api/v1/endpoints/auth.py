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

router = APIRouter(prefix="/auth", tags=["Autenticación"])
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")

@router.get("/me", response_model=UsuarioRead, summary="Obtener información del usuario", description="Devuelve la información del usuario autenticado.")
async def get_me(current_user: Usuario = Depends(get_current_user)):
    return current_user


@router.post("/register", response_model=UsuarioRead, status_code=201, summary="Registrar usuario", description="Crea un nuevo usuario en el sistema.")
async def register(payload: UsuarioCreate, session: AsyncSession = Depends(get_session)):
    # Verificar si el usuario ya existe
    existing_user = await session.scalar(
        select(Usuario).where(Usuario.email == payload.email)
    )
    if existing_user:
        raise HTTPException(status_code=400, detail="El correo electrónico ya está registrado.")

    user = await auth_srv.create_user(payload, SECRET_KEY)
    return user

@router.post("/login", summary="Iniciar sesión", description="Autentica al usuario y devuelve un token de acceso.")
async def login(payload: UsuarioLogin, session: AsyncSession = Depends(get_session)):
    user = await session.scalar(
        select(Usuario).where(Usuario.email == payload.email)  # noqa
    )
    if not user or not auth_srv.verify_password(payload.password, user.hashed_password):
        raise HTTPException(HTTP_401_UNAUTHORIZED, "Credenciales inválidas")
    token = auth_srv.create_access_token(user.id, SECRET_KEY)
    return {"access_token": token, "token_type": "bearer"}

@router.post(
    "/refresh",
    summary="Renovar token",
    description="Genera un nuevo token de acceso a partir de uno válido."
)
async def refresh_token(current_user: Usuario = Depends(get_current_user)):
    """Devuelve un nuevo JWT para el usuario autenticado."""
    try:
        token = auth_srv.create_access_token(
            sub=current_user.id,
            secret=SECRET_KEY,
            expires_minutes=60
        )
        return {"access_token": token, "token_type": "bearer"}
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            return {"detail": "Token inválido o expirado"}, 401
        raise exc
