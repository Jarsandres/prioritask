import pytest
from httpx import AsyncClient

from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_get_tasks_filtered_by_estado(async_client):
    _, token = await create_user_and_token(async_client)

    await create_task(async_client, token, {
        "titulo": "Tarea TODO",
        "categoria": "OTRO",  # Valor válido para CategoriaTarea
        "estado": "TODO",  # Valor válido para EstadoTarea
        "peso": 1.0
    })

    resp = await async_client.get("/api/v1/tasks?estado=TODO", headers={
        "Authorization": f"Bearer {token}"
    })
    assert resp.status_code == 200
    assert all(task["estado"] == "TODO" for task in resp.json())


@pytest.mark.asyncio
async def test_get_tasks_filtered_by_categoria(async_client):
    _, token = await create_user_and_token(async_client)

    await create_task(async_client, token, {
        "titulo": "Tarea de prueba",
        "categoria": "OTRO",  # Valor válido para CategoriaTarea
        "estado": "TODO",  # Valor válido para EstadoTarea
        "peso": 2.0,
        "descripcion": "Descripción de prueba",
        "due_date": "2025-12-31"
    })

    resp = await async_client.get("/api/v1/tasks?categoria=OTRO", headers={
        "Authorization": f"Bearer {token}"
    })
    assert resp.status_code == 200
    assert all(task["categoria"] == "OTRO" for task in resp.json())


@pytest.mark.asyncio
async def test_get_tasks_filtered_by_completed(async_client):
    _, token = await create_user_and_token(async_client)

    await create_task(async_client, token, {
        "titulo": "Tarea completada",
        "categoria": "OTRO",  # Valor válido para CategoriaTarea
        "estado": "TODO",  # Valor válido para EstadoTarea
        "peso": 1.0,
        "completed": True
    })

    resp = await async_client.get("/api/v1/tasks?completadas=true", headers={
        "Authorization": f"Bearer {token}"
    })
    assert resp.status_code == 200
    assert all(task["completed"] is True for task in resp.json())


@pytest.mark.asyncio
async def test_get_tasks_ordered_by_peso_desc(async_client):
    _, token = await create_user_and_token(async_client)

    await create_task(async_client, token, {
        "titulo": "Tarea ligera",
        "categoria": "OTRO",
        "estado": "TODO",
        "peso": 1.0
    })

    await create_task(async_client, token, {
        "titulo": "Tarea pesada",
        "categoria": "OTRO",
        "estado": "TODO",
        "peso": 5.0
    })

    resp = await async_client.get("/api/v1/tasks?order_by=peso&is_descending=true", headers={
        "Authorization": f"Bearer {token}"
    })
    assert resp.status_code == 200
    pesos = [task["peso"] for task in resp.json()]
    assert pesos == sorted(pesos, reverse=True)

@pytest.mark.asyncio
async def test_get_tasks_filtered_by_tag(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear una etiqueta
    tag_resp = await async_client.post("/api/v1/tags", json={"nombre": "personal"}, headers=headers)
    assert tag_resp.status_code == 201
    tag_id = tag_resp.json()["id"]

    # Crear una tarea
    task_resp = await async_client.post("/api/v1/tasks", json={
        "titulo": "Tarea filtrable",
        "categoria": "OTRO"
    }, headers=headers)
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    # Asignar etiqueta a la tarea
    assign_resp = await async_client.post(
        f"/api/v1/tags/tasks/{task_id}/tags",
        json={"tag_ids": [tag_id]},
        headers=headers
    )
    assert assign_resp.status_code == 200

    # Crear otra tarea sin etiquetas
    await async_client.post("/api/v1/tasks", json={
        "titulo": "Sin etiqueta",
        "categoria": "OTRO"
    }, headers=headers)

    # Filtrar tareas por tag_id
    filter_resp = await async_client.get(f"/api/v1/tasks?tag_id={tag_id}", headers=headers)
    assert filter_resp.status_code == 200

    tasks = filter_resp.json()
    assert len(tasks) == 1
    assert tasks[0]["titulo"] == "Tarea filtrable"