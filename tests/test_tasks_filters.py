import pytest
from httpx import AsyncClient
from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_get_tasks_pagination(async_client: AsyncClient):
    # 1) Crear usuario y obtener token
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # 2) Crear 15 tareas de prueba usando el mismo token
    for i in range(15):
        response = await async_client.post(
            "/api/v1/tasks",
            json={
                "titulo": f"Tarea {i}",
                "descripcion": "Descripción de prueba",
                "categoria": "OTRO",
                "peso": 1,
                "due_date": "2025-06-10T00:00:00Z"
            },
            headers=headers
        )
        assert response.status_code == 201  # Verificar que cada POST devuelve 201

    # 3) Obtener las primeras 10 tareas
    resp1 = await async_client.get(
        "/api/v1/tasks",
        params={"skip": 0, "limit": 10},
        headers=headers
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert len(data1) == 10

    # 4) Obtener las siguientes 5 tareas
    resp2 = await async_client.get(
        "/api/v1/tasks",
        params={"skip": 10, "limit": 5},
        headers=headers
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert len(data2) == 5

@pytest.mark.asyncio
async def test_delete_task_and_verify_not_found(async_client: AsyncClient):
    # Crear usuario y obtener token
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear una tarea
    task_data = {
        "titulo": "Tarea para eliminar",
        "descripcion": "Descripción de prueba",
        "categoria": "OTRO",
        "peso": 1,
        "due_date": "2025-06-10T00:00:00Z"
    }
    task = await create_task(async_client, token, task_data)

    # Eliminar la tarea
    delete_response = await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)
    assert delete_response.status_code == 204

    # Verificar que un GET sobre la tarea devuelva 404
    get_response = await async_client.get(f"/api/v1/tasks/{task['id']}", headers=headers)
    assert get_response.status_code == 404

    # Verificar que el detalle de la respuesta sea "Tarea no encontrada"
    detail = get_response.json().get("detail")
    assert detail == "Tarea no encontrada"

@pytest.mark.asyncio
async def test_get_task_history_not_found(async_client: AsyncClient):
    # Crear usuario y obtener token
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Intentar obtener el historial de una tarea inexistente
    invalid_task_id = "00000000-0000-0000-0000-000000000000"
    history_response = await async_client.get(f"/api/v1/tasks/{invalid_task_id}/history", headers=headers)
    assert history_response.status_code == 404

    # Verificar que el detalle de la respuesta sea "Historial no encontrado"
    detail = history_response.json().get("detail")
    assert detail == "Historial no encontrado"


@pytest.mark.asyncio
async def test_get_tasks_filter_by_room(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear dos hogares
    r1_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Casa1"}, headers=headers)
    assert r1_resp.status_code == 201
    room1_id = r1_resp.json()["id"]

    r2_resp = await async_client.post("/api/v1/rooms", json={"nombre": "Casa2"}, headers=headers)
    assert r2_resp.status_code == 201
    room2_id = r2_resp.json()["id"]

    # Crear tareas asociadas a cada hogar
    t1 = await create_task(async_client, token, {"titulo": "Task One", "categoria": "OTRO", "room_id": room1_id})
    await create_task(async_client, token, {"titulo": "Task Two", "categoria": "OTRO", "room_id": room2_id})

    resp = await async_client.get("/api/v1/tasks", params={"room_id": room1_id}, headers=headers)
    assert resp.status_code == 200
    tasks = resp.json()
    assert tasks, "Se esperaba al menos una tarea"
    assert all(task["room_id"] == room1_id for task in tasks)
    ids = {task["id"] for task in tasks}
    assert ids == {t1["id"]}
