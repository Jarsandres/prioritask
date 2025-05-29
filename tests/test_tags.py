from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlmodel import select
from app.models import Tag, TaskTag
from tests.utils import create_user_and_token


@pytest.mark.asyncio
async def test_create_tag(async_client):
    user, token = await create_user_and_token(async_client)

    # Verificar que el usuario y el token sean válidos
    assert user is not None, "El usuario no fue creado correctamente."
    assert token is not None, "El token no fue generado correctamente."

    resp = await async_client.post(
        "/api/v1/tags",
        headers={"Authorization": f"Bearer {token}"},
        json={"nombre": "Urgente"}
    )

    assert resp.status_code == 201, f"Error inesperado: {resp.text}"
    data = resp.json()
    assert data["nombre"] == "Urgente"


@pytest.mark.asyncio
async def test_get_my_tags(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear etiquetas
    await async_client.post("/api/v1/tags", json={"nombre": "urgente"}, headers=headers)
    await async_client.post("/api/v1/tags", json={"nombre": "finanzas"}, headers=headers)

    # Consultar etiquetas
    res = await async_client.get("/api/v1/tags", headers=headers)
    assert res.status_code == 200

    tags = res.json()
    assert isinstance(tags, list)
    assert len(tags) == 2
    nombres = {tag["nombre"] for tag in tags}
    assert "urgente" in nombres
    assert "finanzas" in nombres

@pytest.mark.asyncio
async def test_delete_tag(async_client: AsyncClient, session):
    # Crear usuario y token
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear etiqueta
    resp = await async_client.post("/api/v1/tags", json={"nombre": "para-borrar"}, headers=headers)
    assert resp.status_code == 201
    tag_id = UUID(resp.json()["id"])

    # Verificar que existe en la DB
    result = await session.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    assert tag is not None

    # Eliminar etiqueta
    delete_resp = await async_client.delete(f"/api/v1/tags/{tag_id}", headers=headers)
    assert delete_resp.status_code == 204

    # Verificar que ya no existe en la DB
    result = await session.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    assert tag is None

@pytest.mark.asyncio
async def test_assign_tags_to_task(async_client: AsyncClient, session):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear tarea
    tarea = await async_client.post("/api/v1/tasks", json={
        "titulo": "Tarea con etiquetas",
        "categoria": "OTRO"
    }, headers=headers)
    assert tarea.status_code == 201
    task_id = UUID(tarea.json()["id"])

    # Crear dos etiquetas
    tag1 = await async_client.post("/api/v1/tags", json={"nombre": "prioridad"}, headers=headers)
    tag2 = await async_client.post("/api/v1/tags", json={"nombre": "importante"}, headers=headers)
    tag_ids = [tag1.json()["id"], tag2.json()["id"]]

    # Asignar etiquetas a la tarea
    resp = await async_client.post(f"/api/v1/tags/tasks/{task_id}/tags", json={"tag_ids": tag_ids}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["message"] == "Etiquetas asignadas correctamente"

    # Verificar en la tabla intermedia
    result = await session.execute(select(TaskTag).where(TaskTag.task_id == task_id))
    relaciones = result.scalars().all()
    tag_ids_en_db = {str(r.tag_id) for r in relaciones}
    assert set(tag_ids).issubset(tag_ids_en_db)

@pytest.mark.asyncio
async def test_delete_tag_cascade_removes_tasktag(async_client: AsyncClient, session):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear una tarea
    task_resp = await async_client.post("/api/v1/tasks", json={
        "titulo": "Test cascade",
        "categoria": "OTRO"
    }, headers=headers)
    assert task_resp.status_code == 201
    task_id = UUID(task_resp.json()["id"])

    # Crear una etiqueta
    tag_resp = await async_client.post("/api/v1/tags", json={"nombre": "para-cascade"}, headers=headers)
    assert tag_resp.status_code == 201
    tag_id = UUID(tag_resp.json()["id"])

    # Asignar la etiqueta a la tarea
    assign_resp = await async_client.post(
        f"/api/v1/tags/tasks/{task_id}/tags",
        json={"tag_ids": [str(tag_id)]},
        headers=headers
    )
    assert assign_resp.status_code == 200

    # Verificar que existe la relación TaskTag
    result = await session.execute(select(TaskTag).where(
        TaskTag.task_id == task_id,
        TaskTag.tag_id == tag_id
    ))
    relation = result.scalar_one_or_none()
    assert relation is not None

    # Eliminar la etiqueta
    del_resp = await async_client.delete(f"/api/v1/tags/{tag_id}", headers=headers)
    assert del_resp.status_code == 204

    # Verificar que la relación en TaskTag también se eliminó
    result = await session.execute(select(TaskTag).where(
        TaskTag.task_id == task_id,
        TaskTag.tag_id == tag_id
    ))
    relation = result.scalar_one_or_none()
    assert relation is None