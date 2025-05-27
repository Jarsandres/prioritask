import pytest
from httpx import AsyncClient
from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_prioritize_tasks_with_mock(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Urgente: pagar alquiler", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Lavar ropa", "categoria": "OTRO"})

    response = await async_client.post("/api/v1/tasks/prioritize", headers=headers, json={} )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    prioridades = [item["prioridad"] for item in data]
    assert "alta" in prioridades or "media" in prioridades
