import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_cors_origins_parses_json_list(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    monkeypatch.setenv("CORS_ORIGINS", '["http://a.com","http://b.com"]')
    settings = Settings()
    assert settings.CORS_ORIGINS == ["http://a.com", "http://b.com"]


def test_cors_origins_parses_comma_delimited(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    monkeypatch.setenv("CORS_ORIGINS", "http://a.com,http://b.com")
    settings = Settings()
    assert settings.CORS_ORIGINS == ["http://a.com", "http://b.com"]


def test_cors_origins_strips_whitespace_and_trailing_slashes(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    monkeypatch.setenv("CORS_ORIGINS", " http://a.com/ , http://b.com/// ")
    settings = Settings()
    assert settings.CORS_ORIGINS == ["http://a.com", "http://b.com"]


def test_cors_origins_json_list_normalizes_trailing_slashes(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    monkeypatch.setenv("CORS_ORIGINS", '["http://a.com/", " http://b.com/ "]')
    settings = Settings()
    assert settings.CORS_ORIGINS == ["http://a.com", "http://b.com"]


def test_cors_origins_rejects_wildcard_string(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    monkeypatch.setenv("CORS_ORIGINS", "*")
    with pytest.raises(ValidationError):
        Settings()


def test_cors_origins_rejects_wildcard_in_json_list(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    monkeypatch.setenv("CORS_ORIGINS", '["*"]')
    with pytest.raises(ValidationError):
        Settings()


def test_cors_origins_rejects_wildcard_in_comma_list(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    monkeypatch.setenv("CORS_ORIGINS", "http://a.com, *")
    with pytest.raises(ValidationError):
        Settings()


def test_database_url_normalizes_to_aiosqlite(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    settings = Settings()
    assert settings.DATABASE_URL == "sqlite+aiosqlite:///./test.db"


@pytest.mark.parametrize(
    "insecure_secret",
    ["dev-secret", "CHANGE_ME_SUPER_SECRET_KEY", ""],
)
def test_settings_rejects_insecure_jwt_secret_in_development(monkeypatch, insecure_secret):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", insecure_secret)
    with pytest.raises(ValidationError):
        Settings()


def test_settings_rejects_short_jwt_secret_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/prioritask")
    monkeypatch.setenv("JWT_SECRET_KEY", "short-secret-under-32-chars")
    with pytest.raises(ValidationError):
        Settings()


@pytest.mark.parametrize(
    "sqlite_url",
    ["sqlite:///./prioritask.db", "sqlite+aiosqlite:///./prioritask.db"],
)
def test_settings_rejects_sqlite_database_in_production(monkeypatch, sqlite_url):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "a_very_strong_production_secret_key_32_chars")
    monkeypatch.setenv("DATABASE_URL", sqlite_url)
    with pytest.raises(ValidationError):
        Settings()


def test_settings_accepts_valid_production_config(monkeypatch):
    strong_secret = "a_very_strong_production_secret_key_32_chars"
    pg_url = "postgresql+asyncpg://user:pass@localhost:5432/prioritask"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", strong_secret)
    monkeypatch.setenv("DATABASE_URL", pg_url)
    settings = Settings()
    assert settings.ENVIRONMENT == "production"
    assert settings.JWT_SECRET_KEY == strong_secret
    assert settings.DATABASE_URL == pg_url

