import pytest
from httpx import AsyncClient
from uuid import UUID, uuid4
from tests.utils import create_user_and_token, create_task

@pytest.mark.asyncio
async def test_assign_task(async_client: AsyncClient):
    # Crear usuario y obtener token
    email1 = f"test1-{uuid4().hex}@example.com"
    email2 = f"test2-{uuid4().hex}@example.com"
    user, token = await create_user_and_token(async_client, email=email1)
    another_user, _ = await create_user_and_token(async_client, email=email2)

    # Crear tarea con el primer usuario
    task = await create_task(async_client, token, {
        "titulo": f"Tarea compartida {uuid4().hex}",
        "categoria": "OTRO"
    })

    # Asignar tarea al segundo usuario
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
    assert data["fecha"] is not None

@pytest.mark.asyncio
async def test_get_assigned_tasks(async_client: AsyncClient):

    email1 = f"test1-{uuid4().hex}@example.com"
    email2 = f"test2-{uuid4().hex}@example.com"

    # Crear usuarios
    user, token = await create_user_and_token(async_client, email=email1)
    collaborator, _ = await create_user_and_token(async_client, email=email2)

    # Crear tarea y asignarla
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

    # Consultar tareas asignadas al segundo usuario
    response = await async_client.get(
        f"/api/v1/tasks/assigned/{collaborator['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert any(str(task["id"]) == str(item["task_id"]) for item in data)

@pytest.mark.asyncio
async def test_remove_task_assignment(async_client: AsyncClient):
    # Crear usuario y obtener token
    email1 = f"test1-{uuid4().hex}@example.com"
    email2 = f"test2-{uuid4().hex}@example.com"
    user, token = await create_user_and_token(async_client, email=email1)
    another_user, _ = await create_user_and_token(async_client, email=email2)

    # Crear tarea con el primer usuario
    task = await create_task(async_client, token, {
        "titulo": f"Tarea compartida {uuid4().hex}",
        "categoria": "OTRO"
    })

    # Asignar tarea al segundo usuario
    response = await async_client.post(
        "/api/v1/tasks/assign",
        json={
            "task_id": str(task["id"]),
            "user_id": str(another_user["id"])
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 201

    # Verificar que la asignación fue creada correctamente
    response = await async_client.get(
        f"/api/v1/tasks/assigned/{another_user['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["task_id"] == str(task["id"])
    assert data[0]["user_id"] == str(another_user["id"])

    # Eliminar asignación
    response = await async_client.delete(
        f"/api/v1/tasks/{task['id']}/assignees/{another_user['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 204

    # Verificar que la asignación fue eliminada
    response = await async_client.get(
        f"/api/v1/tasks/assigned/{another_user['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0
