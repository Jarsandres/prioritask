import resp
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_register_and_login():
    # Registro
    resp = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "nombre": "Tester",
        "password": "secret123"
    })
    assert resp.status_code == 201


data = resp.json()
assert data["email"] == "test@example.com"
assert "id" in data

# Login
login = client.post("/api/v1/auth/login", json={
    "password": "secret123"
                })
assert login.status_code == 200
token_data = login.json()
assert "access_token" in token_data
assert token_data["token_type"] == "bearer"
