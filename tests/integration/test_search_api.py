from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import CategoriaTarea
from app.models.room import Room
from app.models.task import Task
from app.models.user import Usuario


@pytest.mark.asyncio

async def test_search_api_basic_and_scoring(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    """Prueba GET /api/v1/tasks/search buscando por palabra clave con scores y matched_fields."""
    task1 = Task(
        titulo="Comprar ingredientes para cenar",
        descripcion="Comprar verduras y condimentos",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    task2 = Task(
        titulo="Lavar la ropa",
        descripcion="Usar detergente suave",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add_all([task1, task2])
    await session.commit()

    resp = await async_client.get(
        "/api/v1/tasks/search",
        params={"q": "Comprar"},
        headers=user_a_headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_matches"] >= 1
    assert len(data["results"]) >= 1
    first_result = data["results"][0]
    assert first_result["task"]["titulo"] == "Comprar ingredientes para cenar"
    assert first_result["relevance_score"] > 0
    assert "titulo" in first_result["matched_fields"]


@pytest.mark.asyncio
async def test_search_api_room_filter_and_forbidden_room(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    user_c_headers: dict[str, str],
    room_owner_a: Room,
):
    """Prueba que el parámetro room_id filtre adecuadamente y deniegue acceso a usuarios no autorizados."""
    task = Task(
        titulo="Revisar cerraduras de la casa",
        categoria=CategoriaTarea.MANTENIMIENTO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()

    # Usuario A consulta su propio hogar
    resp_a = await async_client.get(
        "/api/v1/tasks/search",
        params={"q": "cerraduras", "room_id": str(room_owner_a.id)},
        headers=user_a_headers,
    )
    assert resp_a.status_code == 200
    assert resp_a.json()["total_matches"] == 1

    # Usuario C consulta el hogar de A sin ser miembro -> 403 Forbidden
    resp_c = await async_client.get(
        "/api/v1/tasks/search",
        params={"q": "cerraduras", "room_id": str(room_owner_a.id)},
        headers=user_c_headers,
    )
    assert resp_c.status_code == 403


@pytest.mark.asyncio
async def test_search_api_ignores_soft_deleted_tasks(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    room_owner_a: Room,
):
    """Prueba que tareas eliminadas lógicamente no aparezcan en la búsqueda."""
    deleted_task = Task(
        titulo="Pintar fachada antigua",
        categoria=CategoriaTarea.MANTENIMIENTO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
        deleted_at=datetime.now(UTC),
    )
    session.add(deleted_task)
    await session.commit()

    resp = await async_client.get(
        "/api/v1/tasks/search",
        params={"q": "fachada"},
        headers=user_a_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["total_matches"] == 0
