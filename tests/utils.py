from enum import unique
from uuid import uuid4, UUID

from httpx import AsyncClient

async def create_user_and_token(client: AsyncClient):
    unique_email = f"tests{uuid4().hex}@example.com"
    user_data = {
        "email": unique_email,
        "nombre": "Tester",
        "password": "secret123"
    }

    await client.post("/api/v1/auth/register", json=user_data)

    login_response = await client.post("/api/v1/auth/login", json={
        "email": user_data["email"],
        "password": user_data["password"]
    })

    token = login_response.json().get("access_token")
    if not token:
        raise ValueError(f"No se pudo obtener el token: {login_response.text}")

    return user_data, token

async def create_task(client: AsyncClient, token: str, task_data: dict):
    # aseguramos que 'peso' siempre está
    task_data.setdefault("peso", 1.0)
    resp = await client.post(
        "/api/v1/tasks",
        headers={"Authorization": f"Bearer {token}"},
        json=task_data,
    )
    resp.raise_for_status()
    return resp.json()
