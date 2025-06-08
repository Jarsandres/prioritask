from app.core.config import Settings

def test_cors_origins_parses_json_list(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    monkeypatch.setenv("CORS_ORIGINS", '["http://a.com","http://b.com"]')
    settings = Settings()
    assert settings.CORS_ORIGINS == ["http://a.com", "http://b.com"]
