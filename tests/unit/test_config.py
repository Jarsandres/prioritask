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
