import json

from pydantic import ConfigDict, field_validator, model_validator
from pydantic_settings import BaseSettings

INSECURE_JWT_SECRETS = {
    "",
    "dev-secret",
    "CHANGE_ME_SUPER_SECRET_KEY",
    "tu_clave_secreta",
}


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./prioritask.db"
    JWT_SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    RECURRENCE_SCHEDULER_INTERVAL_SECONDS: int = 3600
    ENVIRONMENT: str = "development"
    RATE_LIMIT_ENABLED: bool = True
    CORS_ORIGINS: list[str] | str = ["http://localhost:5173", "http://localhost:5174"]

    # Database connection pool (PostgreSQL)
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE: int = 1800
    DB_POOL_PRE_PING: bool = True

    # Cache / Redis configuration
    REDIS_URL: str | None = None

    # Storage / Attachments configuration
    UPLOAD_DIR: str = "./uploads/attachments"
    MAX_FILE_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
    MAX_ROOM_STORAGE_BYTES: int = 250 * 1024 * 1024  # 250 MB

    @field_validator("DATABASE_URL", mode="after")
    def ensure_async_sqlite(cls, v: str) -> str:
        if v.startswith("sqlite:///"):
            return v.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        return v

    ##Configuracion ollama IA
    OLLAMA_HOST: str = "http://localhost:11434"  # url del servidor ollama
    OLLAMA_MODEL: str = "qwen2.5:7b"  # modelo a utilizar
    OLLAMA_TIMEOUT: float = 1.0  # timeout en segundos

    @field_validator("CORS_ORIGINS", mode="before")
    def split_origins(cls, v):
        if isinstance(v, str):
            v_stripped = v.strip()
            try:
                parsed = json.loads(v_stripped)
                if isinstance(parsed, list):
                    v = parsed
                elif isinstance(parsed, str):
                    v = [parsed]
            except json.JSONDecodeError:
                v = [orig for orig in v_stripped.split(",") if orig.strip()]

        if isinstance(v, (list, tuple, set)):
            normalized = []
            for item in v:
                if isinstance(item, str):
                    cleaned = item.strip().rstrip("/")
                    if cleaned:
                        normalized.append(cleaned)
                else:
                    normalized.append(item)
            v = normalized

        if isinstance(v, list) and "*" in v:
            raise ValueError(
                "CORS_ORIGINS no puede contener '*' debido a riesgos de seguridad CORS con credenciales (CWE-942)."
            )

        return v

    @field_validator("CORS_ORIGINS", mode="after")
    def validate_cors_origins(cls, v: list[str]) -> list[str]:
        if "*" in v:
            raise ValueError(
                "CORS_ORIGINS no puede contener '*' debido a riesgos de seguridad CORS con credenciales (CWE-942)."
            )
        return [orig.rstrip("/") for orig in v]

    @model_validator(mode="after")
    def validate_security_posture(self) -> "Settings":
        env = self.ENVIRONMENT.strip().lower()
        secret = self.JWT_SECRET_KEY.strip()
        if env not in ("test", "testing") and (not secret or secret in INSECURE_JWT_SECRETS):
            raise ValueError(
                "JWT_SECRET_KEY insegura o por defecto detectada. Configure una clave criptográfica fuerte."
            )
        if env == "production":
            if len(secret) < 32:
                raise ValueError(
                    "En producción, JWT_SECRET_KEY debe tener al menos 32 caracteres de entropía."
                )
            if self.DATABASE_URL.strip().lower().startswith("sqlite"):
                raise ValueError(
                    "En producción no se permite SQLite local (DATABASE_URL). Configure PostgreSQL."
                )
        return self

    model_config = ConfigDict(env_file=".env")


# Crea una instancia de Settings
settings = Settings()

