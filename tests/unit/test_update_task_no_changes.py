import uuid
import pytest
from tests.utils import create_task, create_user_and_token

@pytest.mark.asyncio
async def test_update_task_no_changes(async_client):
    user, token = await create_user_and_token(async_client)
    task = await create_task(async_client, token, {
        "titulo": "Sin cambios",
        "categoria": "OTRO",
        "peso": 1.0
    })

    # Enviar misma data
    resp = await async_client.put(
        f"/api/v1/tasks/{task['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"titulo": "Sin cambios"}
    )
    assert resp.status_code == 200
    assert resp.json()["titulo"] == "Sin cambios"

@pytest.mark.asyncio
async def test_delete_task_not_found(async_client):
    _, token = await create_user_and_token(async_client)
    fake_id = str(uuid.uuid4())

    resp = await async_client.delete(
        f"/api/v1/tasks/{fake_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404
