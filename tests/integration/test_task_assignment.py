from uuid import UUID, uuid4

import pytest

from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_assign_task(async_client):
    email1 = f"test1-{uuid4().hex}@example.com"
    email2 = f"test2-{uuid4().hex}@example.com"
    user, token = await create_user_and_token(async_client, email=email1)
    another_user, _ = await create_user_and_token(async_client, email=email2)

    task = await create_task(async_client, token, {
        "titulo": f"Tarea compartida {uuid4().hex}",
        "categoria": "OTRO"
    })

    response = await async_client.post(
        "/api/v1/tasks/assign",
        json={
            "task_id": str(task["id"]),
            "user_id": str(another_user["id"])
        },
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 201
    data = response.json()
    assert UUID(data["task_id"]) == UUID(task["id"])
    assert UUID(data["user_id"]) == UUID(another_user["id"])
    assert UUID(data["asignado_por"]) == UUID(user["id"])

@pytest.mark.asyncio
async def test_get_assigned_tasks(async_client):
    email1 = f"test1-{uuid4().hex}@example.com"
    email2 = f"test2-{uuid4().hex}@example.com"

    _user, token = await create_user_and_token(async_client, email=email1)
    collaborator, _ = await create_user_and_token(async_client, email=email2)

    task = await create_task(async_client, token, {
        "titulo": "Tarea para consulta",
        "categoria": "OTRO"
    })

    await async_client.post(
        "/api/v1/tasks/assign",
        json={
            "task_id": str(task["id"]),
            "user_id": str(collaborator["id"])
        },
        headers={"Authorization": f"Bearer {token}"}
    )

    response = await async_client.get(
        f"/api/v1/tasks/assigned/{collaborator['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert any(str(task["id"]) == str(item["task_id"]) for item in data)

@pytest.mark.asyncio
async def test_remove_task_assignment(async_client):
    email1 = f"test1-{uuid4().hex}@example.com"
    email2 = f"test2-{uuid4().hex}@example.com"
    _user, token = await create_user_and_token(async_client, email=email1)
    another_user, _ = await create_user_and_token(async_client, email=email2)

    task = await create_task(async_client, token, {
        "titulo": f"Tarea compartida {uuid4().hex}",
        "categoria": "OTRO"
    })

    await async_client.post(
        "/api/v1/tasks/assign",
        json={
            "task_id": str(task["id"]),
            "user_id": str(another_user["id"])
        },
        headers={"Authorization": f"Bearer {token}"}
    )

    del_resp = await async_client.delete(
        f"/api/v1/tasks/{task['id']}/assignees/{another_user['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert del_resp.status_code == 204

    get_resp = await async_client.get(
        f"/api/v1/tasks/assigned/{another_user['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert get_resp.status_code == 200
    assert len(get_resp.json()) == 0
