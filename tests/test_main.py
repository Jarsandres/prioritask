from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_root():
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json() == {"message": "¡Prioritask está funcionando!"}
