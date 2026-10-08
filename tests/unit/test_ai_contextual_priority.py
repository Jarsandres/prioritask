from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models.enums import CategoriaTarea
from app.models.task import Task
from app.services.AI.circuit_breaker import CircuitState, circuit_breaker
from app.services.AI.priority_classifier import (
    clasificar_prioridad,
    evaluar_prioridad_contextual,
)


@pytest.fixture(autouse=True)
def reset_circuit_breaker():
    circuit_breaker.state = CircuitState.CLOSED
    circuit_breaker.failure_count = 0
    circuit_breaker.last_failure_time = None
    yield
    circuit_breaker.state = CircuitState.CLOSED
    circuit_breaker.failure_count = 0
    circuit_breaker.last_failure_time = None



@pytest.mark.asyncio
async def test_priority_imminent_due_date():
    """Tarea con due_date inminente (< 24h) debe resultar en prioridad 'alta' y mencionarlo en el motivo."""
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Preparar informe trimestral",
        descripcion="Revisión de métricas financieras",
        categoria=CategoriaTarea.OTRO,
        due_date=datetime.now(UTC) + timedelta(hours=6),
        peso=1.0,
        is_recurring=False,
        colaboradores=[],
    )

    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
        mock_ia.return_value = "media"
        prioridad, motivo = await evaluar_prioridad_contextual(task)

    assert prioridad == "alta"
    assert "fecha límite inminente (<24h)" in motivo.lower()
    assert motivo.startswith("Prioridad alta:")


@pytest.mark.asyncio
async def test_priority_expired_due_date():
    """Tarea cuya due_date ya venció debe clasificarse como 'alta'."""
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Pagar factura de luz",
        categoria=CategoriaTarea.MANTENIMIENTO,
        due_date=datetime.now(UTC) - timedelta(hours=2),
        peso=1.0,
        is_recurring=False,
        colaboradores=[],
    )

    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
        mock_ia.return_value = "media"
        prioridad, motivo = await evaluar_prioridad_contextual(task)
    assert prioridad == "alta"
    assert "fecha límite inminente (<24h)" in motivo.lower()


@pytest.mark.asyncio
async def test_priority_recurring_with_high_weight():
    """Tarea recurrente con peso alto eleva el score y refleja la recurrencia en el motivo."""
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Mantenimiento preventivo caldera",
        categoria=CategoriaTarea.MANTENIMIENTO,
        due_date=None,
        peso=2.5,
        is_recurring=True,
        colaboradores=[],
    )

    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
        mock_ia.return_value = "media"
        prioridad, motivo = await evaluar_prioridad_contextual(task)

    # 15 (recurrente) + 25 (peso 2.5 * 10) + 15 (ia media) = 55 -> 'alta'
    assert prioridad == "alta"
    assert "recurrente" in motivo.lower()
    assert "alto peso asignado" in motivo.lower()


@pytest.mark.asyncio
async def test_priority_recurring_moderate_evaluated_by_ai():
    """Tarea recurrente con peso estándar y clasificación media por IA."""
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Revisión de plantas del balcón",
        categoria=CategoriaTarea.LIMPIEZA,
        due_date=None,
        peso=1.0,
        is_recurring=True,
        colaboradores=[],
    )

    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
        mock_ia.return_value = "media"
        prioridad, motivo = await evaluar_prioridad_contextual(task)

    # 15 (recurrente) + 10 (peso) + 15 (ia) = 40 -> 'media'
    assert prioridad == "media"
    assert "rutina recurrente de importancia moderada evaluada por ia" in motivo.lower()
    assert motivo.startswith("Prioridad media:")


@pytest.mark.asyncio
async def test_priority_with_collaborators():
    """Tarea compartida con colaboradores incrementa la puntuación y lo refleja en el motivo."""
    colaborador_dummy = MagicMock()
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Organizar cena de bienvenida",
        categoria=CategoriaTarea.LIMPIEZA,
        due_date=datetime.now(UTC) + timedelta(hours=36),  # 24-48h -> 25 pts
        peso=1.0,  # 10 pts
        is_recurring=False,
        colaboradores=[colaborador_dummy],  # 10 pts
    )

    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
        mock_ia.return_value = "media"  # +15 pts -> total: 25+10+10+15 = 60 pts
        prioridad, motivo = await evaluar_prioridad_contextual(task)

    assert prioridad == "alta"
    assert "tarea compartida" in motivo.lower()
    assert "fecha límite próxima (24-48h)" in motivo.lower()


@pytest.mark.asyncio
async def test_priority_urgency_keyword_in_title():
    """Palabra clave de urgencia en el título garantiza prioridad alta sin invocar IA."""
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Renovar pasaporte urgente",
        categoria=CategoriaTarea.OTRO,
        peso=1.0,
        is_recurring=False,
        colaboradores=[],
    )

    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
        prioridad, motivo = await evaluar_prioridad_contextual(task)
        mock_ia.assert_not_called()

    assert prioridad == "alta"
    assert "palabra clave de urgencia detectada en el título" in motivo.lower()
    assert motivo == "Prioridad alta: Palabra clave de urgencia detectada en el título."


@pytest.mark.asyncio
async def test_priority_urgency_keyword_in_description():
    """Palabra clave de urgencia en la descripción otorga prioridad alta."""
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Llamar al fontanero",
        descripcion="Hay una fuga y se necesita de forma inmediata",
        categoria=CategoriaTarea.MANTENIMIENTO,
        peso=1.0,
        is_recurring=False,
        colaboradores=[],
    )

    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
        prioridad, motivo = await evaluar_prioridad_contextual(task)
        mock_ia.assert_not_called()

    assert prioridad == "alta"
    assert "palabra clave de urgencia detectada en la descripción" in motivo.lower()


@pytest.mark.asyncio
async def test_priority_resilience_ollama_returns_none():
    """Test de resiliencia: con Ollama caído o retornando None, el algoritmo calcula la prioridad contextualmente sin fallar."""
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Cambiar bombilla del pasillo",
        categoria=CategoriaTarea.MANTENIMIENTO,
        due_date=datetime.now(UTC) + timedelta(hours=12),  # < 24h -> 40 pts
        peso=1.0,  # 10 pts -> total 50 pts
        is_recurring=False,
        colaboradores=[],
    )

    # Simular fallo en clasificar_prioridad retornando None
    with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_cp:
        mock_cp.return_value = None
        prioridad, motivo = await evaluar_prioridad_contextual(task)

    assert prioridad == "alta"
    assert "fecha límite inminente (<24h)" in motivo.lower()


@pytest.mark.asyncio
async def test_priority_resilience_generate_json_returns_none():
    """Test de resiliencia cuando generate_json falla a nivel de red/timeout."""
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Comprar detergente",
        categoria=CategoriaTarea.COMPRA,
        due_date=None,
        peso=1.0,
        is_recurring=False,
        colaboradores=[],
    )

    with patch("app.services.AI.priority_classifier.generate_json", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = None
        # clasificar_prioridad usará el fallback seguro y evaluar_prioridad_contextual funcionará sin error
        prioridad, motivo = await evaluar_prioridad_contextual(task)

    assert prioridad in ("media", "baja")
    assert isinstance(motivo, str)
    assert len(motivo) > 0


@pytest.mark.asyncio
async def test_priority_resilience_circuit_breaker_open():
    """Test de resiliencia con el Circuit Breaker abierto: no intenta llamar a IA y calcula por reglas."""
    task = Task(
        id=uuid4(),
        user_id=uuid4(),
        room_id=uuid4(),
        titulo="Lavar cortinas",
        categoria=CategoriaTarea.LIMPIEZA,
        due_date=datetime.now(UTC) + timedelta(hours=5),  # 40 pts + 10 peso = 50 pts
        peso=1.0,
        is_recurring=False,
        colaboradores=[],
    )

    original_state = circuit_breaker.state
    try:
        circuit_breaker.state = CircuitState.OPEN
        with patch("app.services.AI.priority_classifier.clasificar_prioridad", new_callable=AsyncMock) as mock_ia:
            prioridad, motivo = await evaluar_prioridad_contextual(task)
            mock_ia.assert_not_called()

        assert prioridad == "alta"
        assert "fecha límite inminente (<24h)" in motivo.lower()
    finally:
        circuit_breaker.state = original_state


@pytest.mark.asyncio
async def test_clasificar_prioridad_backward_compatibility():
    """Garantizar que la función legacy clasificar_prioridad funciona según lo esperado."""
    with patch("app.services.AI.priority_classifier.generate_json", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = {"prioridad": "baja"}
        res = await clasificar_prioridad("Leer libro")
        assert res == "baja"
