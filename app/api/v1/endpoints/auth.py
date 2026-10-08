import contextlib
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette import status
from starlette.status import HTTP_401_UNAUTHORIZED

from app.core.rate_limit import rate_limit
from app.db.session import get_session
from app.models.user import Usuario
from app.schemas.user import (
    RefreshTokenRequest,
    TokenResponse,
    UsuarioCreate,
    UsuarioLogin,
    UsuarioRead,
)
from app.services import auth as auth_srv
from app.services.auth import SECRET_KEY, get_current_user

router = APIRouter(prefix="/auth", tags=["Autenticación y Sesiones"])

@router.get("/me", response_model=UsuarioRead, summary="Obtener información del usuario", description="Devuelve la información del usuario autenticado.")
async def get_me(current_user: Usuario = Depends(get_current_user)):
    return current_user


@router.post(
    "/register",
    response_model=UsuarioRead,
    status_code=201,
    summary="Registrar usuario",
    description="Crea un nuevo usuario en el sistema.",
    dependencies=[Depends(rate_limit(max_requests=5, window_seconds=60))],
)
async def register(payload: UsuarioCreate, session: AsyncSession = Depends(get_session)):
    # Verificar si el usuario ya existe
    existing_user = await session.scalar(
        select(Usuario).where(Usuario.email == payload.email)
    )
    if existing_user:
        raise HTTPException(status_code=400, detail="El correo electrónico ya está registrado.")

    user = await auth_srv.create_user(payload, session)
    return user

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Iniciar sesión",
    description="Autentica al usuario y devuelve tokens de acceso y de refresco.",
    dependencies=[Depends(rate_limit(max_requests=10, window_seconds=60))],
)
async def login(payload: UsuarioLogin, session: AsyncSession = Depends(get_session)):
    user = await session.scalar(
        select(Usuario).where(Usuario.email == payload.email)
    )
    if not user or not await auth_srv.verify_password_async(payload.password, user.hashed_password):
        raise HTTPException(HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    access_token = auth_srv.create_access_token(
        user.id,
        SECRET_KEY,
        is_superuser=user.is_superuser,
        role="ADMIN" if user.is_superuser else "USER",
        token_version=user.token_version,
    )
    refresh_token = auth_srv.create_refresh_token(
        user.id,
        SECRET_KEY,
        token_version=user.token_version,
    )
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

        jti = token_data.get("jti")
        if jti and await auth_srv.is_token_revoked(jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token revocado",
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

    token_version = token_data.get("token_version")
    if token_version is not None and token_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión invalidada por cambio de versión de sesión",
        )

    # Revocar el refresh token consumido (rotación de tokens)
    if jti:
        exp = token_data.get("exp")
        now = datetime.now(UTC).timestamp()
        ttl = int(exp - now) if exp else 86400 * 7
        await auth_srv.revoke_token(jti, max(ttl, 60))

    new_access_token = auth_srv.create_access_token(
        user.id,
        SECRET_KEY,
        is_superuser=user.is_superuser,
        role="ADMIN" if user.is_superuser else "USER",
        token_version=user.token_version,
    )
    new_refresh_token = auth_srv.create_refresh_token(
        user.id,
        SECRET_KEY,
        token_version=user.token_version,
    )

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer"
    )


@router.post(
    "/logout",
    summary="Cerrar sesión",
    description="Invalida el token JWT actual registrando su jti en la lista negra.",
)
async def logout(
    token: str = Depends(auth_srv.oauth2_scheme),
    current_user: Usuario = Depends(get_current_user),
):
    with contextlib.suppress(Exception):
        payload = auth_srv.decode_token(token, SECRET_KEY, verify_exp=False)
        jti = payload.get("jti")
        exp = payload.get("exp")
        now = datetime.now(UTC).timestamp()
        ttl = int(exp - now) if exp else 3600
        if jti:
            await auth_srv.revoke_token(jti, max(ttl, 60))
    return {"message": "Sesión cerrada y token revocado exitosamente"}

