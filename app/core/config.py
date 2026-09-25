import json

from pydantic import ConfigDict, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./prioritask.db"
    JWT_SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CORS_ORIGINS: list[str] | str = ["http://localhost:5173", "http://localhost:5174"]

    @field_validator("DATABASE_URL", mode="after")
    def ensure_async_sqlite(cls, v: str) -> str:
        if v.startswith("sqlite:///"):
            return v.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        return v

##Configuracion ollama IA 
    OLLAMA_HOST: str = "http://localhost:11434" #url del servidor ollama 
    OLLAMA_MODEL: str = "qwen2.5:7b"   #modelo a utilizar
    OLLAMA_TIMEOUT: float = 1.0 #timeout en segundos
      


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

    model_config = ConfigDict(env_file=".env")

# Crea una instancia de Settings
settings = Settings()
