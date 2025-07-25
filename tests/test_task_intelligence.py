import pytest
from httpx import AsyncClient
from app.services.AI.reformulator import reformular_titulo_con_traduccion
from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_prioritize_tasks_with_mock(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Urgente: pagar alquiler", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Lavar ropa", "categoria": "OTRO"})

    response = await async_client.post("/api/v1/tasks/ai/prioritize", headers=headers, json={})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    prioridades = [item["prioridad"] for item in data]
    assert "alta" in prioridades or "media" in prioridades

@pytest.mark.skip(reason="Reemplazado por IA real")
@pytest.mark.asyncio
async def test_group_tasks_mock(async_client):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Lavar platos", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Enviar currículum", "categoria": "OTRO"})

    response = await async_client.post("/api/v1/tasks/ai/group", headers=headers, json={})
    assert response.status_code == 200
    data = response.json()
    assert "Limpieza" in data["grupos"] or "Trabajo/Estudios" in data["grupos"]

def test_rewrite_tasks_mock():
    original = "Revisión prácticas"
    resultado = reformular_titulo_con_traduccion(original)
    assert isinstance(resultado, dict)
    assert resultado["reformulada"].strip() != ""
    assert resultado["reformulada"].lower() != original.lower()
    assert resultado["cambio"] is True

