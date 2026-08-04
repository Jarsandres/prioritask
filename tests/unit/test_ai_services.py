from unittest.mock import AsyncMock, patch

import pytest

from app.models.task import Task
from app.services.AI import ollama_client
from app.services.AI.priority_classifier import clasificar_prioridad
from app.services.AI.reformulator import reformular_titulo_con_traduccion
from app.services.AI.task_organizer import (
    agrupar_por_categoria,
    agrupar_tareas_por_similitud,
)


@pytest.mark.asyncio
async def test_ollama_client_fallback_on_connection_error():
    with patch("httpx.AsyncClient.post", side_effect=Exception("Connection refused")):
        res = await ollama_client.generate_json("Test prompt")
        assert res is None


@pytest.mark.asyncio
async def test_priority_classifier_with_mocked_ollama():
    with patch("app.services.AI.priority_classifier.generate_json", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {"prioridad": "alta"}
        prioridad = await clasificar_prioridad("Comprar pan")
        assert prioridad == "alta"


@pytest.mark.asyncio
async def test_priority_classifier_fallback():
    with patch("app.services.AI.priority_classifier.generate_json", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = None
        prioridad_urgente = await clasificar_prioridad("Estudiar para examen urgente hoy")
        assert prioridad_urgente == "alta"

        prioridad_normal = await clasificar_prioridad("Comprar leche")
        assert prioridad_normal == "media"


@pytest.mark.asyncio
async def test_reformulator_with_mocked_ollama():
    with patch("app.services.AI.reformulator.generate_json", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {"reformulada": "Limpieza profunda de la cocina"}
        res = await reformular_titulo_con_traduccion("limpiar cocina")
        assert res["reformulada"] == "Limpieza profunda de la cocina"
        assert res["cambio"] is True


@pytest.mark.asyncio
async def test_reformulator_fallback():
    with patch("app.services.AI.reformulator.generate_json", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = None
        res = await reformular_titulo_con_traduccion("Limpiar cocina")
        assert res["reformulada"] == "Limpiar cocina"
        assert res["cambio"] is False


@pytest.mark.asyncio
async def test_task_organizer_by_category():
    tareas = [
        Task(titulo="Limpiar cocina", categoria="LIMPIEZA"),
        Task(titulo="Comprar pan", categoria="COMPRA"),
    ]
    grupos = agrupar_por_categoria(tareas)
    assert "LIMPIEZA" in grupos
    assert "COMPRA" in grupos


@pytest.mark.asyncio
async def test_task_organizer_with_mocked_ollama():
    tareas = [
        Task(titulo="Limpiar cocina", categoria="LIMPIEZA"),
        Task(titulo="Pagar factura", categoria="MANTENIMIENTO"),
    ]
    mock_resp = {
        "Hogar": ["Limpiar cocina"],
        "Finanzas": ["Pagar factura"],
    }
    with patch("app.services.AI.task_organizer.generate_json", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = mock_resp
        grupos = await agrupar_tareas_por_similitud(tareas)
        assert "Hogar" in grupos
        assert "Finanzas" in grupos
