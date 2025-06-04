import pytest
from httpx import AsyncClient
from uuid import uuid4
from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_patch_task_success(async_client: AsyncClient):
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
        f"/api/v1/tasks/{task['id']}",
        json={"estado": "DONE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_response.status_code == 200

@pytest.mark.asyncio
async def test_patch_task_not_found(async_client: AsyncClient):
    # Crear usuario y token
    user, token = await create_user_and_token(async_client)

    # Intentar actualizar una tarea inexistente
    patch_response = await async_client.patch(
        f"/api/v1/tasks/{uuid4()}",
        json={"estado": "DONE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_response.status_code == 404

@pytest.mark.asyncio
async def test_patch_task_unauthorized(async_client: AsyncClient):
    # Intentar actualizar una tarea sin autorización
    patch_response = await async_client.patch(
        f"/api/v1/tasks/{uuid4()}",
        json={"estado": "DONE"},
    )
    assert patch_response.status_code == 401

@pytest.mark.asyncio
async def test_patch_task_invalid_data(async_client: AsyncClient):
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

    # Intentar actualizar la tarea con datos inválidos
    patch_response = await async_client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"campo_invalido": "valor"},  # Enviar un campo adicional no relacionado con el modelo
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_response.status_code == 422

@pytest.mark.asyncio
async def test_patch_task_update_fields(async_client: AsyncClient):
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

    # Actualizar múltiples campos de la tarea
    patch_response = await async_client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"titulo": "Tarea actualizada", "estado": "DONE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_response.status_code == 200
    updated_task = patch_response.json()
    assert updated_task["titulo"] == "Tarea actualizada"
    assert updated_task["estado"] == "DONE"