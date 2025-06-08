from pydantic_settings import BaseSettings
from pydantic import ConfigDict, field_validator
import json

class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    @field_validator("CORS_ORIGINS", mode="before")
    def split_origins(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
            return [orig.strip() for orig in v.split(',') if orig.strip()]
        return v

    model_config = ConfigDict(env_file=".env")

# Crea una instancia de Settings
settings = Settings()
