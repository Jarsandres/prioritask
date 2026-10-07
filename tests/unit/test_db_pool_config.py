from app.core.config import settings
from app.db.session import get_engine_kwargs


def test_settings_pool_defaults():
    assert settings.DB_POOL_SIZE == 20
    assert settings.DB_MAX_OVERFLOW == 10
    assert settings.DB_POOL_RECYCLE == 1800
    assert settings.DB_POOL_PRE_PING is True


def test_get_engine_kwargs_for_sqlite():
    sqlite_url = "sqlite+aiosqlite:///./test.db"
    kwargs = get_engine_kwargs(sqlite_url)
    assert kwargs == {"echo": False}
    assert "pool_size" not in kwargs
    assert "max_overflow" not in kwargs


def test_get_engine_kwargs_for_postgresql():
    pg_url = "postgresql+asyncpg://user:pass@localhost:5432/prioritask"
    kwargs = get_engine_kwargs(pg_url)
    assert kwargs["echo"] is False
    assert kwargs["pool_size"] == settings.DB_POOL_SIZE
    assert kwargs["max_overflow"] == settings.DB_MAX_OVERFLOW
    assert kwargs["pool_recycle"] == settings.DB_POOL_RECYCLE
    assert kwargs["pool_pre_ping"] == settings.DB_POOL_PRE_PING
