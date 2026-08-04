from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import jwt, JWTError
from passlib.context import CryptContext

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from sqlmodel.ext.asyncio.session import AsyncSession   # usamos el de SQLModel

from app.models.user import Usuario
from app.db.session import async_session, get_session

import os


# ─────────────────────────────────────────────────────────────────────────────
# Configuración global
# ─────────────────────────────────────────────────────────────────────────────
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

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
) -> str:
    """Genera un token JWT de acceso para el usuario."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    return jwt.encode({"sub": str(sub), "type": "access", "exp": expire}, secret, algorithm=ALGORITHM)

def create_refresh_token(
        sub: UUID | str,
        secret: str,
        *,
        expires_minutes: int = 10080,  # 7 días
) -> str:
    """Genera un token JWT de refresco para la sesión del usuario."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
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
