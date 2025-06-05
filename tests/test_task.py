from tests.utils import create_user_and_token, create_task
import pytest
from httpx import AsyncClient
from uuid import uuid4


@pytest.mark.asyncio
async def test_update_task_and_history(async_client: AsyncClient):
    # 1) Primero, crear un usuario y obtener su token
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # 2) Crear una tarea usando ese token
    task = await create_task(async_client, token, {
        "titulo": "Mi tarea",
        "categoria": "OTRO"
    })
    task_id = task["id"]

    # 3) Actualizar la tarea con PUT
    resp = await async_client.put(
        f"/api/v1/tasks/{task_id}",
        json={
            "titulo": "Actualizada",
            "categoria": "OTRO",
            "estado": "DONE",
            "peso": 3.5
        },
        headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["titulo"] == "Actualizada"
    assert data["peso"] == 3.5

    # 4) Consultar el historial de la tarea
    resp2 = await async_client.get(
        f"/api/v1/tasks/{task_id}/history",
        headers=headers
    )
    assert resp2.status_code == 200
    history = resp2.json()
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


@pytest.mark.asyncio
async def test_unique_constraint_on_task(async_client):
    client = async_client
    user, token = await create_user_and_token(client)

    # Crear una tarea con un título específico
    task_data = {
        "titulo": "Tarea única",
        "categoria": "OTRO"
    }
    await create_task(client, token, task_data)

    # Intentar crear otra tarea con el mismo título para el mismo usuario
    response = await client.post(
        "/api/v1/tasks",
        json=task_data,
        headers={"Authorization": f"Bearer {token}"}
    )

    # Verificar que la respuesta indica un error de restricción única
    assert response.status_code == 400
    assert "ya existe una tarea activa con este título para el usuario." == response.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_get_task_success(async_client: AsyncClient):
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

    # Obtener la tarea específica
    response = await async_client.get(
        f"/api/v1/tasks/{task['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == task["id"]
    assert data["titulo"] == "Tarea de prueba"


@pytest.mark.asyncio
async def test_get_task_not_found(async_client: AsyncClient):
    # Crear usuario y token
    user, token = await create_user_and_token(async_client)

    # Intentar obtener una tarea inexistente
    response = await async_client.get(
        f"/api/v1/tasks/{uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_task_no_permission(async_client: AsyncClient):
    # Crear dos usuarios y tokens
    user1, token1 = await create_user_and_token(async_client)
    user2, token2 = await create_user_and_token(async_client)

    # Crear una tarea con el primer usuario
    task = await create_task(async_client, token1, {
        "titulo": "Tarea de prueba",
        "descripcion": "Descripción de prueba",
        "categoria": "OTRO",
        "peso": 1,
        "estado": "TODO",
    })

    # Intentar obtener la tarea con el segundo usuario
    response = await async_client.get(
        f"/api/v1/tasks/{task['id']}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert response.status_code == 403
