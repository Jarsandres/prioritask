import pytest
from tests.utils import create_task, create_user_and_token

@pytest.mark.asyncio
async def test_get_task_history(async_client):
    client = async_client
    user, token = await create_user_and_token(client)

    task = await create_task(client, token, {
        "titulo": "Historial",
        "categoria": "OTRO"
    })

    resp = await client.get(
        f"/api/v1/tasks/{task['id']}/history",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 200
    history = resp.json()
    assert isinstance(history, list)
