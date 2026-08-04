from uuid import UUID

import pytest
from httpx import AsyncClient

from tests.utils import create_user_and_token


@pytest.mark.asyncio
async def test_create_tag(async_client):
    _user, token = await create_user_and_token(async_client)
    resp = await async_client.post(
        "/api/v1/tags",
        headers={"Authorization": f"Bearer {token}"},
        json={"nombre": "Urgente"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["nombre"] == "Urgente"

@pytest.mark.asyncio
async def test_get_my_tags(async_client: AsyncClient):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await async_client.post("/api/v1/tags", json={"nombre": "urgente"}, headers=headers)
    await async_client.post("/api/v1/tags", json={"nombre": "finanzas"}, headers=headers)

    res = await async_client.get("/api/v1/tags", headers=headers)
    assert res.status_code == 200
    tags = res.json()
    assert len(tags) == 2

@pytest.mark.asyncio
async def test_delete_tag(async_client: AsyncClient, session):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await async_client.post("/api/v1/tags", json={"nombre": "para-borrar"}, headers=headers)
    assert resp.status_code == 201
    tag_id = UUID(resp.json()["id"])

    delete_resp = await async_client.delete(f"/api/v1/tags/{tag_id}", headers=headers)
    assert delete_resp.status_code == 204

@pytest.mark.asyncio
async def test_assign_and_remove_tags_for_task(async_client: AsyncClient, session):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    tarea_resp = await async_client.post(
        "/api/v1/tasks",
        json={"titulo": "Tarea con etiquetas", "categoria": "OTRO"},
        headers=headers
    )
    task_id = UUID(tarea_resp.json()["id"])

    etiqueta_resp = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Etiqueta"},
        headers=headers
    )
    tag_id = UUID(etiqueta_resp.json()["id"])

    assign_resp = await async_client.post(
        f"/api/v1/tags/tasks/{task_id}/tags",
        json={"tag_ids": [str(tag_id)]},
        headers=headers
    )
    assert assign_resp.status_code == 200

    remove_resp = await async_client.delete(
        f"/api/v1/tags/tasks/{task_id}/tags/{tag_id}",
        headers=headers
    )
    assert remove_resp.status_code == 204
