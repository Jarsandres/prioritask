import pytest
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

    resp = await async_client.get("/api/v1/tasks?order_by=peso&desc=true", headers={
        "Authorization": f"Bearer {token}"
    })
    assert resp.status_code == 200
    pesos = [task["peso"] for task in resp.json()]
    assert pesos == sorted(pesos, reverse=True)
