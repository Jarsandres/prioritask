from uuid import UUID

import pytest
from httpx import AsyncClient
from  app.services.AI.reformulator import reformular_titulo
from app.services.AI.task_organizer import agrupar_tareas_por_similitud
from app.services.AI.priority_classifier import clasificar_prioridad
from tests.utils import create_user_and_token, create_task


def test_local_reformulator():
    original = "Limpiar la cocina"
    reformulada = reformular_titulo(original)

    print("\n Original:", original)
    print(" Reformulado:", reformulada)

    assert isinstance(reformulada, str)
    assert reformulada.strip() != ""
    assert reformulada.lower() != original.lower()

def test_local_grouper():
    tareas = [
        "Limpiar la cocina",
        "Organizar la cocina",
        "Revisar facturas del mes",
        "Pagar las facturas",
        "Preparar presentación",
        "Limpiar el baño"
    ]

    grupos = agrupar_tareas_por_similitud(tareas, umbral_similitud=0.65)

    print("\n Grupos detectados:")
    for nombre, grupo in grupos.items():
        print(f"{nombre}: {grupo}")

    assert isinstance(grupos, dict)
    assert len(grupos) > 1

def test_local_priority_classifier():
    tareas = [
        "Revisar las finanzas del trimestre",
        "Comprar papel higiénico",
        "Enviar currículum a empresa urgente",
        "Organizar escritorio"
    ]

    for tarea in tareas:
        prioridad = clasificar_prioridad(tarea)
        print(f"\n '{tarea}' → Prioridad: {prioridad}")
        assert prioridad in ["alta", "media", "baja"]

@pytest.mark.asyncio
async def test_prioritize_tasks_real(async_client: AsyncClient):
    # Crear usuario y token
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear tareas asociadas al usuario
    await create_task(async_client, token, {"titulo": "Enviar currículum urgente", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Limpiar el baño", "categoria": "OTRO"})

    # Realizar llamada al endpoint de priorización
    response = await async_client.post(
        "/api/v1/tasks/ai/prioritize",
        headers=headers,
        json={"task_ids": None, "criteria": "urgente"}
    )

    assert response.status_code == 200
    data = response.json()

    # Validar formato y contenido
    assert isinstance(data, list)
    assert len(data) == 2

    for tarea in data:
        assert "id" in tarea and UUID(tarea["id"])
        assert "titulo" in tarea
        assert "prioridad" in tarea
        assert tarea["prioridad"] in ["alta", "media", "baja"]
        assert "motivo" in tarea
        assert "IA" in tarea["motivo"]

@pytest.mark.asyncio
async def test_group_tasks_real(async_client: AsyncClient):
    # Crear usuario y token
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear tareas que deberían agruparse por similitud
    await create_task(async_client, token, {"titulo": "Limpiar cocina", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Organizar cocina", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Pagar facturas", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Revisar recibos", "categoria": "OTRO"})

    # Llamada al endpoint de agrupación
    response = await async_client.post(
        "/api/v1/tasks/ai/group",
        headers=headers,
        json={"task_ids": None}
    )

    assert response.status_code == 200
    data = response.json()
    assert "grupos" in data
    assert isinstance(data["grupos"], dict)
    assert len(data["grupos"]) >= 2  # Al menos dos grupos esperados

    # Comprobamos que cada grupo tiene tareas con estructura válida
    for grupo, tareas in data["grupos"].items():
        assert isinstance(grupo, str)
        assert isinstance(tareas, list)
        for tarea in tareas:
            assert "id" in tarea
            assert "titulo" in tarea
