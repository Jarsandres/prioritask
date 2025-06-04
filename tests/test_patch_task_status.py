import pytest
from httpx import AsyncClient
from uuid import uuid4
from app.models.enums import EstadoTarea
from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_patch_task_status(async_client: AsyncClient):
    # Crear usuario y token
    user, token = await create_user_and_token(async_client)

    # Crear una tarea de prueba
    task = await create_task(async_client, token, {
        "titulo": "Tarea de prueba",
        "descripcion": "Descripción de prueba",
        "categoria": "OTRO",
        "peso": 1,
        "estado": "TODO",
    })

    # Actualizar el estado de la tarea
    patch_response = await async_client.patch(
        f"/api/v1/tasks/{task['id']}/status",
        json={"estado": "DONE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_response.status_code == 200
    updated_task = patch_response.json()
    assert updated_task["estado"] == "DONE"

@pytest.mark.asyncio
async def test_patch_task_status_not_found(async_client: AsyncClient):
    # Crear usuario y token
    user, token = await create_user_and_token(async_client)

    # Intentar actualizar el estado de una tarea inexistente
    patch_response = await async_client.patch(
        f"/api/v1/tasks/{uuid4()}/status",
        json={"estado": "DONE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_response.status_code == 404
