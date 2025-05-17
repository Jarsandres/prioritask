from datetime import datetime, timezone
from app.services.auth import hash_password, verify_password, create_access_token

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
    from jose import jwt
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    assert payload["sub"] == sub
    # exp debe ser un timestamp futuro
    exp = datetime.fromtimestamp(payload["exp"], timezone.utc)
    assert exp > datetime.now(timezone.utc)
