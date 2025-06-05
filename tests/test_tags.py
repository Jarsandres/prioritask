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


@pytest.mark.asyncio
async def test_create_and_list_tags(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear 3 etiquetas
    for i in range(3):
        response = await async_client.post(
            "/api/v1/tags",
            json={"nombre": f"Etiqueta {i}"},
            headers=headers
        )
        assert response.status_code == 201

    # Consultar lista de etiquetas
    list_response = await async_client.get("/api/v1/tags", headers=headers)
    assert list_response.status_code == 200
    tags = list_response.json()
    assert len(tags) == 3
    for i in range(3):
        assert any(tag["nombre"] == f"Etiqueta {i}" for tag in tags)


@pytest.mark.asyncio
async def test_delete_tag_and_verify_absence(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear una etiqueta
    create_response = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Etiqueta para eliminar"},
        headers=headers
    )
    assert create_response.status_code == 201
    tag_id = create_response.json()["id"]

    # Eliminar la etiqueta
    delete_response = await async_client.delete(f"/api/v1/tags/{tag_id}", headers=headers)
    assert delete_response.status_code == 204

    # Verificar que ya no está en la lista
    list_response = await async_client.get("/api/v1/tags", headers=headers)
    assert list_response.status_code == 200
    tags = list_response.json()
    assert all(tag["id"] != tag_id for tag in tags)

    # Intentar borrarla nuevamente
    second_delete_response = await async_client.delete(f"/api/v1/tags/{tag_id}", headers=headers)
    assert second_delete_response.status_code == 404


@pytest.mark.asyncio
async def test_update_tag_success_and_not_found(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear una etiqueta
    create_response = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Etiqueta para actualizar"},
        headers=headers
    )
    assert create_response.status_code == 201
    tag_id = create_response.json()["id"]

    # Actualizar el nombre de la etiqueta
    update_response = await async_client.patch(
        f"/api/v1/tags/{tag_id}",
        json={"nombre": "Etiqueta actualizada"},
        headers=headers
    )
    assert update_response.status_code == 200
    updated_tag = update_response.json()
    assert updated_tag["nombre"] == "Etiqueta actualizada"

    # Intentar actualizar una etiqueta inexistente
    invalid_tag_id = "00000000-0000-0000-0000-000000000000"
    not_found_response = await async_client.patch(
        f"/api/v1/tags/{invalid_tag_id}",
        json={"nombre": "Etiqueta inexistente"},
        headers=headers
    )
    assert not_found_response.status_code == 404


@pytest.mark.asyncio
async def test_create_tag_invalid_and_duplicate(async_client: AsyncClient):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Intentar crear una etiqueta con nombre demasiado corto
    invalid_response = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "A"},
        headers=headers
    )
    assert invalid_response.status_code == 422

    # Crear una etiqueta válida
    valid_response = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Etiqueta válida"},
        headers=headers
    )
    assert valid_response.status_code == 201

    # Intentar crear otra con el mismo nombre
    duplicate_response = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Etiqueta válida"},
        headers=headers
    )
    assert duplicate_response.status_code == 400
    assert "duplicado" in duplicate_response.json().get("detail", "").lower()
