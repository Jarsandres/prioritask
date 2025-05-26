from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlmodel import select
from app.models import Tag
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
