import pytest
from httpx import AsyncClient
from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_ai_stats_counts(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Urgente tarea", "categoria": "OTRO"})

    await async_client.post("/api/v1/tasks/ai/prioritize", headers=headers, json={"task_ids": None})
    await async_client.post("/api/v1/tasks/ai/group", headers=headers, json={"task_ids": None})
    await async_client.post("/api/v1/tasks/ai/rewrite", headers=headers, json={"task_ids": None})

    resp = await async_client.get("/api/v1/tasks/ai/stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["prioritized"] >= 1
    assert data["grouped"] >= 1
    assert data["rewritten"] >= 1


@pytest.mark.asyncio
async def test_ai_stats_initial_zero(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await async_client.get("/api/v1/tasks/ai/stats", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == {"rewritten": 0, "prioritized": 0, "grouped": 0}
