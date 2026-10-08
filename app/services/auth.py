import asyncio
import logging
import os
import time
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel.ext.asyncio.session import AsyncSession  # usamos el de SQLModel

from app.core.config import settings
from app.db.session import get_session
from app.models.user import Usuario

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Configuración global
# ─────────────────────────────────────────────────────────────────────────────
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


# ─────────────────────────────────────────────────────────────────────────────
# Lista negra de tokens revocados (Redis con fallback en memoria)
# ─────────────────────────────────────────────────────────────────────────────
class TokenBlacklist:
    """
    Gestor de revocación de tokens JWT mediante JTI.
    Utiliza Redis si está configurado, con fallback limpio en memoria para entornos locales o de prueba.
    """

    def __init__(self, redis_url: str | None = None) -> None:
        self._redis_url = redis_url or settings.REDIS_URL
        self._client = None
        self._connection_failed = False
        self._in_memory: dict[str, float] = {}

        if self._redis_url:
            try:
                import redis.asyncio as aioredis

                self._client = aioredis.from_url(
                    self._redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                )
            except Exception as exc:
                logger.warning(
                    "Redis token blacklist initialization failed (%s); using in-memory fallback.",
                    exc,
                )
                self._connection_failed = True

    async def revoke_token(self, jti: str, exp_seconds: int) -> None:
        if not jti:
            return
        ttl = max(int(exp_seconds), 1)
        if self._client and not self._connection_failed:
            try:
                await self._client.set(f"token_blacklist:{jti}", "revoked", ex=ttl)
                return
            except Exception as exc:
                logger.warning(
                    "Redis token blacklist set failed (%s); falling back to in-memory.",
                    exc,
                )
        self._in_memory[jti] = time.time() + ttl

    async def is_token_revoked(self, jti: str) -> bool:
        if not jti:
            return False
        if self._client and not self._connection_failed:
            try:
                exists = await self._client.exists(f"token_blacklist:{jti}")
                return bool(exists)
            except Exception as exc:
                logger.warning(
                    "Redis token blacklist check failed (%s); checking in-memory.",
                    exc,
                )
        exp = self._in_memory.get(jti)
        if exp is None:
            return False
        if time.time() > exp:
            self._in_memory.pop(jti, None)
            return False
        return True

    def clear(self) -> None:
        """Limpia las revocaciones en memoria (útil para tests)."""
        self._in_memory.clear()


token_blacklist = TokenBlacklist()


async def revoke_token(jti: str, exp_seconds: int) -> None:
    """Registra el identificador único jti en la lista negra hasta su expiración."""
    await token_blacklist.revoke_token(jti, exp_seconds)


async def is_token_revoked(jti: str) -> bool:
    """Verifica si un token con jti dado ha sido revocado."""
    return await token_blacklist.is_token_revoked(jti)


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades de contraseña y JWT (Asíncronas y No Bloqueantes)
# ─────────────────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_ctx.verify(password, hashed)


async def hash_password_async(password: str) -> str:
    """Calcula el hash bcrypt en un hilo separado para no bloquear el bucle de eventos."""
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(password: str, hashed: str) -> bool:
    """Verifica la contraseña con bcrypt en un hilo separado para no bloquear el bucle de eventos."""
    return await asyncio.to_thread(verify_password, password, hashed)


def create_access_token(
    sub: UUID | str,
    secret: str,
    *,
    expires_minutes: int = 60,
    is_superuser: bool = False,
    role: str = "USER",
    token_version: int = 1,
    jti: str | None = None,
) -> str:
    """Genera un token JWT de acceso para el usuario con JTI único y versión de sesión."""
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)
    token_jti = jti or str(uuid4())
    payload = {
        "sub": str(sub),
        "type": "access",
        "exp": expire,
        "is_superuser": is_superuser,
        "role": role,
        "token_version": token_version,
        "jti": token_jti,
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def create_refresh_token(
    sub: UUID | str,
    secret: str,
    *,
    expires_minutes: int = 10080,  # 7 días
    token_version: int = 1,
    jti: str | None = None,
) -> str:
    """Genera un token JWT de refresco para la sesión del usuario con JTI único y versión de sesión."""
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)
    token_jti = jti or str(uuid4())
    payload = {
        "sub": str(sub),
        "type": "refresh",
        "exp": expire,
        "token_version": token_version,
        "jti": token_jti,
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_token(token: str, secret: str, verify_exp: bool = True) -> dict:
    """Decodifica un token JWT con opción de ignorar expiración para inspección."""
    options = {"verify_signature": True, "verify_exp": verify_exp}
    return jwt.decode(token, secret, algorithms=[ALGORITHM], options=options)


# ─────────────────────────────────────────────────────────────────────────────
# Operaciones de usuario (registro interno)
# ─────────────────────────────────────────────────────────────────────────────
async def create_user(payload, session: AsyncSession):
    hashed = await hash_password_async(payload.password)
    user = Usuario(
        email=payload.email,
        nombre=payload.nombre,
        hashed_password=hashed,
        is_superuser=False,
        token_version=1,
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

        jti = payload.get("jti")
        if jti and await is_token_revoked(jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token revocado",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id_raw: str | None = payload.get("sub")
        if not user_id_raw:
            raise cred_exc
        user_id = UUID(user_id_raw)
    except (JWTError, ValueError, TypeError):
        raise cred_exc

    user = await session.get(Usuario, user_id)
    if not user or not user.is_active:
        raise cred_exc

    token_version = payload.get("token_version")
    if token_version is not None and token_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión invalidada por cambio de versión de sesión",
            headers={"WWW-Authenticate": "Bearer"},
        )

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

        jti = payload.get("jti")
        if jti and await is_token_revoked(jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token revocado",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id_raw: str | None = payload.get("sub")
        if not user_id_raw:
            raise cred_exc
        user_id = UUID(user_id_raw)
    except (JWTError, ValueError, TypeError):
        raise cred_exc

    user = await session.get(Usuario, user_id)
    if not user or not user.is_active:
        raise cred_exc

    token_version = payload.get("token_version")
    if token_version is not None and token_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión invalidada por cambio de versión de sesión",
            headers={"WWW-Authenticate": "Bearer"},
        )

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

