from datetime import UTC, datetime

from jose import jwt

from app.services.auth import create_access_token, hash_password, verify_password

SECRET = "test-secret"

def test_hash_and_verify_password():
    pwd = "MiClave123!"
    hashed = hash_password(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("otra", hashed) is False

def test_create_access_token_contains_sub_and_exp():
    sub = "user-id-123"
    token = create_access_token(sub, SECRET, expires_minutes=1)
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    assert payload["sub"] == sub
    assert payload["type"] == "access"
    exp = datetime.fromtimestamp(payload["exp"], UTC)
    assert exp > datetime.now(UTC)
