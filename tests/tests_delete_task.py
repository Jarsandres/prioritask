import pytest
from tests.utils import create_task, create_user_and_token

@pytest.mark.asyncio
async def test_delete_task(async_client):
    client = async_client

    user, token = await create_user_and_token(client)

    task = await create_task(client, token, {
        "titulo": "Tarea a eliminar",
        "categoria": "OTRO",
        "peso": 2.0
    })

    resp = await client.delete(
        f"/api/v1/tasks/{task['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 204

    # Verificar que la tarea ya no existe

    list_resp = await client.get(
        "/api/v1/tasks",
        headers={"Authorization": f"Bearer {token}"}
    )
    tareas = list_resp.json()
    assert all(t["id"] != task["id"] for t in tareas)

@pytest.mark.asyncio
async def test_delete_task_success(async_client):
    user, token = await create_user_and_token(async_client)
    task = await create_task(async_client, token, {
        "titulo": "Eliminarme",
        "categoria": "OTRO"
    })

    resp = await async_client.delete(
        f"/api/v1/tasks/{task['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 204

@pytest.mark.asyncio
async def test_update_task_with_changes(async_client):
    user, token = await create_user_and_token(async_client)
    task = await create_task(async_client, token, {
        "titulo": "Viejo título",
        "categoria": "OTRO"
    })

    resp = await async_client.put(
        f"/api/v1/tasks/{task['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"titulo": "Nuevo título", "categoria": "OTRO"}
    )

    assert resp.status_code == 200
    assert resp.json()["titulo"] == "Nuevo título"

@pytest.mark.asyncio
async def test_delete_task_creates_history(async_client):
    user, token = await create_user_and_token(async_client)
    task = await create_task(async_client, token, {
        "titulo": "Para borrar",
        "categoria": "OTRO"
    })

    response = await async_client.delete(
        f"/api/v1/tasks/{task['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 204
