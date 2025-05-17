from datetime import datetime, timedelta
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

def create_access_token(sub: str, secret: str, expires_minutes: int = 60) -> str:
    exp = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode({"sub": sub, "exp": exp}, secret, algorithm=ALGORITHM)

# ─────────────────────────────────────────────────────────────────────────────
# Operaciones de usuario (registro interno)
# ─────────────────────────────────────────────────────────────────────────────
async def create_user(data, secret_key: str):
    async with async_session() as session:
        user = Usuario(
            email=data.email,
            nombre=data.nombre,
            hashed_password=hash_password(data.password),
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

    # 1. Decodificar JWT y extraer `sub`
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise cred_exc
    except JWTError:
        raise cred_exc

    # 2. Recuperar usuario desde la BD
    user = await session.get(Usuario, user_id)
    if user is None or not user.is_active:
        raise cred_exc
    return user
