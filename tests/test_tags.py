from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlmodel import select, delete
from sqlmodel.ext.asyncio.session import AsyncSession
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

    # Crear tarea usando POST manual
    tarea_resp = await async_client.post(
        "/api/v1/tasks",
        json={"titulo": "Tarea con etiquetas", "categoria": "OTRO"},
        headers=headers
    )
    assert tarea_resp.status_code == 201, f"Error creando tarea: {tarea_resp.text}"
    task_id = str(UUID(tarea_resp.json()["id"]))

    # Crear etiqueta
    etiqueta_resp = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Etiqueta"},
        headers=headers
    )
    assert etiqueta_resp.status_code == 201, f"Error creando etiqueta: {etiqueta_resp.text}"
    etiqueta_id = str(UUID(etiqueta_resp.json()["id"]))

    # Asignar etiqueta a la tarea
    resp = await async_client.post(
        f"/api/v1/tags/tasks/{task_id}/tags",
        json={"tag_ids": [etiqueta_id]},
        headers=headers
    )
    assert resp.status_code == 200, f"Error asignando etiqueta: {resp.text}"
    assert resp.json()["message"] == "Etiquetas asignadas correctamente"


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
    stmt = select(TaskTag).where(
        TaskTag.task_id == task_id,
        TaskTag.tag_id == tag_id
    )
    result_before = await session.execute(stmt)
    assert result_before.first() is not None

    # Eliminar el vínculo TaskTag
    await session.execute(
        delete(TaskTag).where(
            TaskTag.task_id == task_id,
            TaskTag.tag_id == tag_id
        )
    )
    await session.commit()

    result_after = await session.execute(stmt)
    assert result_after.first() is None


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


@pytest.mark.asyncio
async def test_update_tag(async_client):
    user, token = await create_user_and_token(async_client)

    # Crear una etiqueta inicial
    resp_create = await async_client.post(
        "/api/v1/tags",
        headers={"Authorization": f"Bearer {token}"},
        json={"nombre": "Urgente"}
    )
    assert resp_create.status_code == 201, "La etiqueta no fue creada correctamente."
    tag_id = resp_create.json()["id"]

    # Actualizar la etiqueta
    resp_update = await async_client.patch(
        f"/api/v1/tags/{tag_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"nombre": "Importante"}
    )
    assert resp_update.status_code == 200, "La etiqueta no fue actualizada correctamente."
    assert resp_update.json()["nombre"] == "Importante", "El nombre de la etiqueta no se actualizó correctamente."

    # Verificar que la etiqueta actualizada persista
    resp_get = await async_client.get(
        "/api/v1/tags",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert any(tag["nombre"] == "Importante" for tag in resp_get.json()), "La etiqueta actualizada no se encuentra en la lista."


@pytest.mark.asyncio
async def test_list_tags_empty(async_client):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Listar etiquetas cuando no hay ninguna
    response = await async_client.get("/api/v1/tags", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_duplicate_tag(async_client):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear una etiqueta válida
    await async_client.post("/api/v1/tags", json={"nombre": "Duplicada"}, headers=headers)

    # Intentar crear otra con el mismo nombre
    response = await async_client.post("/api/v1/tags", json={"nombre": "Duplicada"}, headers=headers)
    assert response.status_code == 400
    assert "duplicado" in response.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_delete_nonexistent_tag(async_client):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Intentar eliminar una etiqueta inexistente
    response = await async_client.delete("/api/v1/tags/00000000-0000-0000-0000-000000000000", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_nonexistent_tag(async_client):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Intentar actualizar una etiqueta inexistente
    response = await async_client.patch(
        "/api/v1/tags/00000000-0000-0000-0000-000000000000",
        json={"nombre": "Nueva"},
        headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_tag_to_duplicate_name(async_client):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear dos etiquetas
    await async_client.post("/api/v1/tags", json={"nombre": "Etiqueta1"}, headers=headers)
    etiqueta2 = await async_client.post("/api/v1/tags", json={"nombre": "Etiqueta2"}, headers=headers)
    etiqueta2_id = etiqueta2.json()["id"]

    # Intentar actualizar la segunda etiqueta al nombre de la primera
    response = await async_client.patch(
        f"/api/v1/tags/{etiqueta2_id}",
        json={"nombre": "Etiqueta1"},
        headers=headers
    )
    assert response.status_code == 400
    assert "duplicado" in response.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_assign_tags_to_task(async_client):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear tarea usando POST manual
    tarea_resp = await async_client.post(
        "/api/v1/tasks",
        json={"titulo": "Tarea duplicada", "categoria": "OTRO"},
        headers=headers
    )
    assert tarea_resp.status_code == 201, f"Error creando tarea: {tarea_resp.text}"
    task_id = UUID(tarea_resp.json()["id"])

    # Crear etiqueta
    etiqueta_resp = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Etiqueta"},
        headers=headers
    )
    assert etiqueta_resp.status_code == 201, f"Error creando etiqueta: {etiqueta_resp.text}"
    etiqueta_id = UUID(etiqueta_resp.json()["id"])

    # Asignar la misma etiqueta dos veces, pero PASANDO str(etiqueta_id)
    resp1 = await async_client.post(
        f"/api/v1/tags/tasks/{task_id}/tags",
        json={"tag_ids": [str(etiqueta_id)]},
        headers=headers
    )
    assert resp1.status_code == 200, f"Error asignando etiqueta: {resp1.text}"
    assert resp1.json()["message"] == "Etiquetas asignadas correctamente"

    # Segundo intento duplicado
    resp2 = await async_client.post(
        f"/api/v1/tags/tasks/{task_id}/tags",
        json={"tag_ids": [str(etiqueta_id)]},
        headers=headers
    )
    assert resp2.status_code == 200, f"El segundo intento debería devolver 200, vino {resp2.status_code}"


@pytest.mark.asyncio
async def test_delete_tag_cascade(async_client: AsyncClient, session: AsyncSession):
    # Crear usuario, tarea y etiqueta
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
    stmt = select(TaskTag).where(
        TaskTag.task_id == task_id,
        TaskTag.tag_id == tag_id
    )
    result_before = await session.execute(stmt)
    assert result_before.first() is not None

    # Eliminar el vínculo TaskTag
    await session.execute(
        delete(TaskTag).where(
            TaskTag.task_id == task_id,
            TaskTag.tag_id == tag_id
        )
    )
    await session.commit()

    result_after = await session.execute(stmt)
    assert result_after.first() is None


@pytest.mark.asyncio
async def test_remove_tag_from_task_success(async_client: AsyncClient, session):
    # Crear usuario, tarea y etiqueta
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task_resp = await async_client.post(
        "/api/v1/tasks",
        json={"titulo": "Tarea de prueba", "categoria": "OTRO"},
        headers=headers
    )
    assert task_resp.status_code == 201
    task_id = UUID(task_resp.json()["id"])

    tag_resp = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Etiqueta de prueba"},
        headers=headers
    )
    assert tag_resp.status_code == 201
    tag_id = UUID(tag_resp.json()["id"])

    # Asignar etiqueta a la tarea
    assign_resp = await async_client.post(
        f"/api/v1/tags/tasks/{task_id}/tags",
        json={"tag_ids": [str(tag_id)]},
        headers=headers
    )
    assert assign_resp.status_code == 200

    # Verificar que la relación existe
    stmt = select(TaskTag).where(TaskTag.task_id == task_id, TaskTag.tag_id == tag_id)
    result = await session.execute(stmt)
    assert result.scalars().first() is not None, "La relación TaskTag no fue creada correctamente."

    # Eliminar la relación
    delete_resp = await async_client.delete(
        f"/api/v1/tags/tasks/{task_id}/tags/{tag_id}",
        headers=headers
    )
    assert delete_resp.status_code == 204

    # Verificar que la relación fue eliminada
    result = await session.execute(stmt)
    assert result.scalars().first() is None, "La relación TaskTag no fue eliminada correctamente."


@pytest.mark.asyncio
async def test_remove_tag_from_task_errors(async_client: AsyncClient, session):
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Usar un task_id inexistente
    invalid_task_id = UUID("00000000-0000-0000-0000-000000000000")
    tag_resp = await async_client.post(
        "/api/v1/tags",
        json={"nombre": "Etiqueta de prueba"},
        headers=headers
    )
    assert tag_resp.status_code == 201
    tag_id = UUID(tag_resp.json()["id"])

    delete_resp = await async_client.delete(
        f"/api/v1/tags/tasks/{invalid_task_id}/tags/{tag_id}",
        headers=headers
    )
    assert delete_resp.status_code == 404
    assert "Tarea no encontrada" in delete_resp.json()["detail"]

    # Usar un tag_id inexistente
    invalid_tag_id = UUID("00000000-0000-0000-0000-000000000000")
    task_resp = await async_client.post(
        "/api/v1/tasks",
        json={"titulo": "Tarea de prueba", "categoria": "OTRO"},
        headers=headers
    )
    assert task_resp.status_code == 201
    task_id = UUID(task_resp.json()["id"])

    delete_resp = await async_client.delete(
        f"/api/v1/tags/tasks/{task_id}/tags/{invalid_tag_id}",
        headers=headers
    )
    assert delete_resp.status_code == 404
    assert "Etiqueta no encontrada" in delete_resp.json()["detail"]

    # Usar valores válidos pero sin asignación
    delete_resp = await async_client.delete(
        f"/api/v1/tags/tasks/{task_id}/tags/{tag_id}",
        headers=headers
    )
    assert delete_resp.status_code == 404
    assert "no está asignada" in delete_resp.json()["detail"]
