from tests.utils import create_user_and_token, create_task
from sqlmodel.ext.asyncio.session import AsyncSession
import pytest


@pytest.mark.asyncio
async def test_update_task_and_history(async_client):
    client = async_client
    user, token = await create_user_and_token(client)

    # Crear una tarea
    task = await create_task(client, token, {
            "titulo": "Mi tarea",
            "categoria": "OTRO"
        })

    task_id = task["id"]

    # Actualizar la tarea
    resp = await client.put(
            f"/api/v1/tasks/{task_id}",
            json={"titulo": "Actualizada",
                  "categoria": "OTRO",
                    "estado": "DONE",
                  "peso": 3.5},
            headers={"Authorization": f"Bearer {token}"}

        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["titulo"] == "Actualizada"
    assert data["peso"] == 3.5

# Consultar el historial de la tarea
    resp = await client.get(
        f"/api/v1/tasks/{task_id}/history",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    history = resp.json()
    assert len(history) == 2
    assert history[-1]["action"] == "UPDATED"

@pytest.mark.asyncio
async def test_get_task_history_returns_list(async_client):
    user, token = await create_user_and_token(async_client)
    task = await create_task(async_client, token, {
        "titulo": "Histórica",
        "categoria": "OTRO"
    })

    response = await async_client.get(
        f"/api/v1/tasks/{task['id']}/history",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.asyncio
async def test_create_task_creates_history(async_client):
    user, token = await create_user_and_token(async_client)

    response = await async_client.post("/api/v1/tasks", json={
        "titulo": "Nueva tarea con historia",
        "categoria": "OTRO"
    }, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 201
    assert response.json()["titulo"] == "Nueva tarea con historia"
