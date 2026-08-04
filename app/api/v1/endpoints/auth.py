from fastapi import APIRouter, Depends, HTTPException, Header
from starlette import status
from starlette.status import HTTP_401_UNAUTHORIZED
from sqlalchemy import select
from uuid import UUID
import os

from app.schemas.user import UsuarioCreate, UsuarioRead, UsuarioLogin, RefreshTokenRequest, TokenResponse
from app.services import auth as auth_srv
from app.db.session import get_session
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models.user import Usuario
from app.services.auth import get_current_user, SECRET_KEY

router = APIRouter(prefix="/auth", tags=["Autenticación"])

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

    user = await auth_srv.create_user(payload, session)
    return user

@router.post("/login", response_model=TokenResponse, summary="Iniciar sesión", description="Autentica al usuario y devuelve tokens de acceso y de refresco.")
async def login(payload: UsuarioLogin, session: AsyncSession = Depends(get_session)):
    user = await session.scalar(
        select(Usuario).where(Usuario.email == payload.email)
    )
    if not user or not auth_srv.verify_password(payload.password, user.hashed_password):
        raise HTTPException(HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    access_token = auth_srv.create_access_token(user.id, SECRET_KEY)
    refresh_token = auth_srv.create_refresh_token(user.id, SECRET_KEY)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer"
    )

@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Renovar token",
    description="Genera un nuevo token de acceso a partir de un refresh_token válido."
)
async def refresh_token(
    payload: RefreshTokenRequest | None = None,
    authorization: str | None = Header(None),
    session: AsyncSession = Depends(get_session)
):
    token_str = None
    if payload and payload.refresh_token:
        token_str = payload.refresh_token
    elif authorization and authorization.startswith("Bearer "):
        token_str = authorization.split(" ")[1]

    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token no proporcionado"
        )

    try:
        # Exigir estrictamente que el token sea de tipo refresh y esté vigente
        token_data = auth_srv.decode_token(token_str, SECRET_KEY, verify_exp=True)
        if token_data.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Se requiere un token de refresco válido"
            )

        user_id_raw = token_data.get("sub")
        if not user_id_raw:
            raise HTTPException(status_code=401, detail="Token no válido")

        user_id = UUID(user_id_raw)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado"
        )

    user = await session.get(Usuario, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o no encontrado"
        )

    new_access_token = auth_srv.create_access_token(user.id, SECRET_KEY)
    new_refresh_token = auth_srv.create_refresh_token(user.id, SECRET_KEY)

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer"
    )
