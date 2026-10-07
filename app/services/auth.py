import os
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel.ext.asyncio.session import AsyncSession  # usamos el de SQLModel

from app.db.session import get_session
from app.models.user import Usuario

# ─────────────────────────────────────────────────────────────────────────────
# Configuración global
# ─────────────────────────────────────────────────────────────────────────────
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# ─────────────────────────────────────────────────────────────────────────────
# Utilidades de contraseña y JWT
# ─────────────────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return pwd_ctx.verify(password, hashed)

def create_access_token(
        sub: UUID | str,
        secret: str,
        *,
        expires_minutes: int = 60,
        is_superuser: bool = False,
        role: str = "USER",
) -> str:
    """Genera un token JWT de acceso para el usuario."""
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)
    payload = {
        "sub": str(sub),
        "type": "access",
        "exp": expire,
        "is_superuser": is_superuser,
        "role": role,
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)

def create_refresh_token(
        sub: UUID | str,
        secret: str,
        *,
        expires_minutes: int = 10080,  # 7 días
) -> str:
    """Genera un token JWT de refresco para la sesión del usuario."""
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)
    return jwt.encode({"sub": str(sub), "type": "refresh", "exp": expire}, secret, algorithm=ALGORITHM)

def decode_token(token: str, secret: str, verify_exp: bool = True) -> dict:
    """Decodifica un token JWT con opción de ignorar expiración para inspección."""
    options = {"verify_signature": True, "verify_exp": verify_exp}
    return jwt.decode(token, secret, algorithms=[ALGORITHM], options=options)

# ─────────────────────────────────────────────────────────────────────────────
# Operaciones de usuario (registro interno)
# ─────────────────────────────────────────────────────────────────────────────
async def create_user(payload, session: AsyncSession):
    user = Usuario(
        email=payload.email,
        nombre=payload.nombre,
        hashed_password=hash_password(payload.password),
        is_superuser=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user

# ─────────────────────────────────────────────────────────────────────────────
# Middleware / dependencia para rutas protegidas
# ─────────────────────────────────────────────────────────────────────────────
async def get_current_user(
        token: str = Depends(oauth2_scheme),
        session: AsyncSession = Depends(get_session),
) -> Usuario:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales no válidas",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token, SECRET_KEY, verify_exp=True)
        token_type = payload.get("type")
        if token_type and token_type != "access":
            raise cred_exc

        user_id_raw: str | None = payload.get("sub")
        user_id = UUID(user_id_raw)
    except (JWTError, ValueError):
        raise cred_exc

    user = await session.get(Usuario, user_id)
    if not user or not user.is_active:
        raise cred_exc
    return user


async def get_current_user_flexible(
    token_query: str | None = Query(None, alias="token"),
    token_header: str | None = Depends(oauth2_scheme_optional),
    session: AsyncSession = Depends(get_session),
) -> Usuario:
    """
    Dependencia de autenticación que admite tanto el header 'Authorization: Bearer <token>'
    como el query parameter '?token=<token>' (útil para EventSource/SSE en navegadores).
    """
    token = token_query or token_header
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales no válidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise cred_exc

    try:
        payload = decode_token(token, SECRET_KEY, verify_exp=True)
        token_type = payload.get("type")
        if token_type and token_type != "access":
            raise cred_exc

        user_id_raw: str | None = payload.get("sub")
        if not user_id_raw:
            raise cred_exc
        user_id = UUID(user_id_raw)
    except (JWTError, ValueError, TypeError):
        raise cred_exc

    user = await session.get(Usuario, user_id)
    if not user or not user.is_active:
        raise cred_exc
    return user


async def get_current_admin_user(
        current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    """
    Dependencia que verifica que el usuario autenticado tenga privilegios de administrador.
    Lanza HTTP 403 Forbidden si el usuario no es superuser / admin.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos de administrador para realizar esta acción.",
        )
    return current_user


def require_role(*allowed_roles: str):
    """
    Dependencia parametrizable para exigir roles específicos.
    Permite acceso si el usuario es superuser o si su rol está en allowed_roles.
    """
    async def role_checker(
            current_user: Usuario = Depends(get_current_user),
    ) -> Usuario:
        user_role_str = "ADMIN" if current_user.is_superuser else "USER"
        if current_user.is_superuser or user_role_str in allowed_roles:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene los permisos requeridos para acceder a este recurso.",
        )
    return role_checker

