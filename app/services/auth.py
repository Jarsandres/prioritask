from datetime import timedelta, datetime

from jose import jwt
from passlib.context import CryptContext

from app.models.user import Usuario
from app.db.session import async_session

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return pwd_ctx.verify(password, hashed)

def create_access_token(sub: str, secret: str, expires_minutes: int = 60) -> str:
    exp = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode({"sub": sub, "exp": exp}, secret, algorithm=ALGORITHM)

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
