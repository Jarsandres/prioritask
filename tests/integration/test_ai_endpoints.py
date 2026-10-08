from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest

from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_prioritize_tasks_real(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Enviar currículum urgente", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Limpiar el baño", "categoria": "OTRO"})

    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
        mock_ia.return_value = "baja"
        response = await async_client.post(
            "/api/v1/tasks/ai/prioritize",
            headers=headers,
            json={"task_ids": None}
        )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2

    for tarea in data:
        assert "id" in tarea and UUID(tarea["id"])
        assert "prioridad" in tarea
        assert tarea["prioridad"] in ["alta", "media", "baja"]

    urgente = next(t for t in data if "urgente" in t["titulo"].lower())
    assert urgente["prioridad"] == "alta"

@pytest.mark.asyncio
async def test_group_tasks_real(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Limpiar cocina", "categoria": "LIMPIEZA"})
    await create_task(async_client, token, {"titulo": "Organizar cocina", "categoria": "LIMPIEZA"})
    await create_task(async_client, token, {"titulo": "Pagar facturas", "categoria": "MANTENIMIENTO"})

    with patch("app.services.AI.task_organizer.generate_json", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {
            "Limpieza": ["Limpiar cocina", "Organizar cocina"],
            "Mantenimiento": ["Pagar facturas"],
        }
        response = await async_client.post(
            "/api/v1/tasks/ai/group",
            headers=headers,
            json={"task_ids": None}
        )

    assert response.status_code == 200
    data = response.json()
    assert "grupos" in data
    assert isinstance(data["grupos"], dict)

@pytest.mark.asyncio
async def test_rewrite_tasks_real(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    await create_task(async_client, token, {"titulo": "Hacer cosas del trabajo", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Organizar casa", "categoria": "OTRO"})

    with patch("app.services.AI.reformulator.generate_json", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {"reformulada": "Gestionar asuntos laborales"}
        response = await async_client.post(
            "/api/v1/tasks/ai/rewrite",
            headers=headers,
            json={"task_ids": None}
        )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2

@pytest.mark.asyncio
async def test_suggest_priority(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.post(
        "/api/v1/tasks/ai/suggest",
        headers=headers,
        json={
            "titulo": "Entregar informe urgente",
            "descripcion": "Debe enviarse hoy",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "prioridad" in data
    assert data["prioridad"] in ["alta", "media", "baja"]


@pytest.mark.asyncio
async def test_suggest_priority_unauthenticated(async_client):
    response = await async_client.post(
        "/api/v1/tasks/ai/suggest",
        json={
            "titulo": "Entregar informe urgente",
            "descripcion": "Debe enviarse hoy",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_ai_health_endpoint(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.get(
        "/api/v1/tasks/ai/health",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] in ["healthy", "degraded"]
    assert "circuit_state" in data
    assert data["circuit_state"] in ["CLOSED", "OPEN", "HALF_OPEN"]
    assert "failure_count" in data
    assert "success_count" in data
    assert "model" in data
    assert "cache_stats" in data
    assert "hits" in data["cache_stats"]
    assert "misses" in data["cache_stats"]
    assert "size" in data["cache_stats"]


@pytest.mark.asyncio
async def test_ai_health_unauthenticated(async_client):
    response = await async_client.get("/api/v1/tasks/ai/health")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_prioritize_tasks_contextual_multivariable(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    imminent_due = (datetime.now(UTC) + timedelta(hours=4)).isoformat()
    await create_task(
        async_client,
        token,
        {
            "titulo": "Preparar presentación del proyecto",
            "categoria": "OTRO",
            "due_date": imminent_due,
            "is_recurring": True,
        },
    )

    response = await async_client.post(
        "/api/v1/tasks/ai/prioritize",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    tarea = next(t for t in data if t["titulo"] == "Preparar presentación del proyecto")
    assert tarea["prioridad"] == "alta"
    assert "fecha límite inminente (<24h)" in tarea["motivo"].lower()
    assert "recurrente" in tarea["motivo"].lower()


@pytest.mark.asyncio
async def test_prioritize_tasks_filtering_by_task_ids(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    t1 = await create_task(async_client, token, {"titulo": "Tarea 1 a priorizar", "categoria": "OTRO"})
    t2 = await create_task(async_client, token, {"titulo": "Tarea 2 a priorizar", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Tarea 3 que no se debe incluir", "categoria": "OTRO"})

    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
        mock_ia.return_value = "media"
        response = await async_client.post(
            "/api/v1/tasks/ai/prioritize",
            headers=headers,
            json={"task_ids": [t1["id"], t2["id"]]},
        )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    returned_ids = {t["id"] for t in data}
    assert returned_ids == {t1["id"], t2["id"]}


@pytest.mark.asyncio
async def test_suggest_priority_contextual_due_date(async_client):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.post(
        "/api/v1/tasks/ai/suggest",
        headers=headers,
        json={
            "titulo": "Organizar papeles del banco",
            "descripcion": "Revisión mensual",
            "due_date": (datetime.now(UTC) + timedelta(hours=8)).isoformat(),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["prioridad"] == "alta"
    assert "fecha límite inminente (<24h)" in data["motivo"].lower()

