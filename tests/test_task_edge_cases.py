import uuid
import pytest
from httpx import AsyncClient

from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_put_task_returns_404_when_task_does_not_exist(async_client: AsyncClient):
    """
    Prueba que al intentar actualizar una tarea inexistente, devuelve 404.
    """
    user, token = await create_user_and_token(async_client)
    random_id = str(uuid.uuid4())

    response = await async_client.put(
        f"/api/v1/tasks/{random_id}",
        json={
            "titulo": "No existe",
            "categoria": "OTRO"
        },
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Tarea no encontrada"

@pytest.mark.asyncio
async def test_put_task_returns_200_but_does_not_update_when_no_changes(async_client: AsyncClient):
    """
    Prueba que al enviar los mismos datos que ya tiene la tarea, no se aplican cambios.
    """
    user, token = await create_user_and_token(async_client)

    task = await create_task(async_client, token, {
        "titulo": "Sin cambios",
        "categoria": "OTRO"
    })

    response = await async_client.put(
        f"/api/v1/tasks/{task['id']}",
        json={
            "titulo": "Sin cambios",
            "categoria": "OTRO"
        },
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["titulo"] == "Sin cambios"
