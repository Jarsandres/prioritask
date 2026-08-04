from uuid import UUID

import pytest

from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_prioritize_tasks_real(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Enviar currículum urgente", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Limpiar el baño", "categoria": "OTRO"})

    response = await async_client.post(
        "/api/v1/tasks/ai/prioritize",
        headers=headers,
        json={"task_ids": None}
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2

    for tarea in data:
        assert "id" in tarea and UUID(tarea["id"])
        assert "prioridad" in tarea
        assert tarea["prioridad"] in ["alta", "media", "baja"]

    urgente = next(t for t in data if "urgente" in t["titulo"].lower())
    assert urgente["prioridad"] == "alta"

@pytest.mark.asyncio
async def test_group_tasks_real(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Limpiar cocina", "categoria": "LIMPIEZA"})
    await create_task(async_client, token, {"titulo": "Organizar cocina", "categoria": "LIMPIEZA"})
    await create_task(async_client, token, {"titulo": "Pagar facturas", "categoria": "MANTENIMIENTO"})

    response = await async_client.post(
        "/api/v1/tasks/ai/group",
        headers=headers,
        json={"task_ids": None}
    )

    assert response.status_code == 200
    data = response.json()
    assert "grupos" in data
    assert isinstance(data["grupos"], dict)

@pytest.mark.asyncio
async def test_rewrite_tasks_real(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Hacer cosas del trabajo", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Organizar casa", "categoria": "OTRO"})

    response = await async_client.post(
        "/api/v1/tasks/ai/rewrite",
        headers=headers,
        json={"task_ids": None}
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2

@pytest.mark.asyncio
async def test_suggest_priority(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.post(
        "/api/v1/tasks/ai/suggest",
        headers=headers,
        json={
            "titulo": "Entregar informe urgente",
            "descripcion": "Debe enviarse hoy",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "prioridad" in data
    assert data["prioridad"] in ["alta", "media", "baja"]
