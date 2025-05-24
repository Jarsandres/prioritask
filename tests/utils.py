from uuid import uuid4
from httpx import AsyncClient

async def create_user_and_token(client: AsyncClient, email: str = None):
    unique_email = email if email else f"tests{uuid4().hex}@example.com"
    password = "secret123"

    user_data = {
        "email": unique_email,
        "nombre": "Tester",
        "password": password
    }

    # Registro
    await client.post("/api/v1/auth/register", json=user_data)

    # Login
    login_response = await client.post("/api/v1/auth/login", json={
        "email": unique_email,
        "password": password
    })

    token = login_response.json().get("access_token")
    if not token:
        raise ValueError(f"No se pudo obtener el token: {login_response.text}")

    # Obtener datos reales del usuario (con ID UUID)
    me_response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    me_response.raise_for_status()
    user = me_response.json()

    return user, token


async def create_task(client: AsyncClient, token: str, task_data: dict):
    # Valor por defecto si no se especifica peso
    task_data.setdefault("peso", 1.0)

    response = await client.post(
        "/api/v1/tasks",
        headers={"Authorization": f"Bearer {token}"},
        json=task_data
    )
    response.raise_for_status()
    return response.json()
