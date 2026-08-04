import pytest

from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_create_and_get_task(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task_data = {
        "titulo": "Comprar leche",
        "descripcion": "2 litros de leche desnatada",
        "categoria": "COMPRA",
        "peso": 1.5,
    }
    task = await create_task(async_client, token, task_data)
    assert task["titulo"] == task_data["titulo"]

    resp = await async_client.get(f"/api/v1/tasks/{task['id']}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == task["id"]

@pytest.mark.asyncio
async def test_update_task(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(async_client, token, {"titulo": "Título antiguo", "categoria": "OTRO"})

    update_payload = {
        "titulo": "Título nuevo",
        "descripcion": "Descripción actualizada",
        "categoria": "COMPRA",
        "estado": "IN_PROGRESS",
        "peso": 2.5
    }
    resp = await async_client.put(f"/api/v1/tasks/{task['id']}", headers=headers, json=update_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["titulo"] == update_payload["titulo"]
    assert data["categoria"] == update_payload["categoria"]

@pytest.mark.asyncio
async def test_update_task_without_changes(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(async_client, token, {"titulo": "Tarea sin cambios", "categoria": "OTRO"})

    resp = await async_client.put(
        f"/api/v1/tasks/{task['id']}",
        headers=headers,
        json={"titulo": "Tarea sin cambios", "categoria": "OTRO"}
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == task["id"]

@pytest.mark.asyncio
async def test_patch_task_partial_update(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(async_client, token, {"titulo": "Original", "categoria": "OTRO"})

    resp = await async_client.patch(
        f"/api/v1/tasks/{task['id']}",
        headers=headers,
        json={"titulo": "Modificado por PATCH"}
    )
    assert resp.status_code == 200
    assert resp.json()["titulo"] == "Modificado por PATCH"

@pytest.mark.asyncio
async def test_patch_task_status(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(async_client, token, {"titulo": "Cambio estado", "categoria": "OTRO"})

    resp = await async_client.patch(
        f"/api/v1/tasks/{task['id']}/status",
        headers=headers,
        json={"estado": "DONE"}
    )
    assert resp.status_code == 200
    assert resp.json()["estado"] == "DONE"

@pytest.mark.asyncio
async def test_delete_task_soft_delete(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(async_client, token, {"titulo": "Tarea a eliminar", "categoria": "OTRO"})

    del_resp = await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)
    assert del_resp.status_code == 204

    # Verificar que ya no aparece en la lista de tareas activas
    list_resp = await async_client.get("/api/v1/tasks", headers=headers)
    assert list_resp.status_code == 200
    tasks = list_resp.json()
    assert all(t["id"] != task["id"] for t in tasks)

@pytest.mark.asyncio
async def test_get_task_history_returns_list(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(async_client, token, {"titulo": "Historial", "categoria": "OTRO"})

    resp = await async_client.get(f"/api/v1/tasks/{task['id']}/history", headers=headers)
    assert resp.status_code == 200
    history = resp.json()
    assert isinstance(history, list)
    assert len(history) > 0
    assert history[0]["action"] == "CREATED"

@pytest.mark.asyncio
async def test_task_not_found(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    fake_id = "00000000-0000-0000-0000-000000000000"

    resp = await async_client.get(f"/api/v1/tasks/{fake_id}", headers=headers)
    assert resp.status_code == 404
