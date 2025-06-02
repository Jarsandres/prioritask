from uuid import UUID
from collections import namedtuple

import pytest
from httpx import AsyncClient
from app.services.AI.reformulator import reformular_titulo_con_traduccion
from app.services.AI.task_organizer import agrupar_por_categoria
from app.services.AI.priority_classifier import clasificar_prioridad
from tests.utils import create_user_and_token, create_task


def test_local_reformulator():
    original = "Limpiar la cocina"
    resultado = reformular_titulo_con_traduccion(original)
    reformulada = resultado["reformulada"]

    print("\n Original:", original)
    print(" Reformulado:", reformulada)

    assert isinstance(reformulada, str)
    assert reformulada.strip() != ""
    assert reformulada.lower() != original.lower()

def test_local_grouper():
    Tarea = namedtuple('Tarea', ['titulo', 'categoria'])
    tareas = [
        Tarea(titulo="Limpiar la cocina", categoria="Casa"),
        Tarea(titulo="Organizar la cocina", categoria="Casa"),
        Tarea(titulo="Revisar facturas del mes", categoria="Finanzas"),
        Tarea(titulo="Pagar las facturas", categoria="Finanzas"),
        Tarea(titulo="Preparar presentación", categoria="Trabajo"),
        Tarea(titulo="Limpiar el baño", categoria="Casa"),
    ]

    grupos = agrupar_por_categoria(tareas)

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
        json={"task_ids": None}
    )

    assert response.status_code == 200
    data = response.json()

    assert isinstance(data, list)
    assert len(data) == 2

    for tarea in data:
        assert "id" in tarea and UUID(tarea["id"])
        assert "titulo" in tarea
        assert "prioridad" in tarea
        assert tarea["prioridad"] in ["alta", "media", "baja"]
        assert "motivo" in tarea
        # Ahora permitimos ambos tipos de motivo
        assert "IA" in tarea["motivo"] or "urgencia" in tarea["motivo"].lower()

    # Verifica que la tarea urgente haya sido clasificada como alta prioridad
    urgente = next(t for t in data if "urgente" in t["titulo"].lower())
    assert urgente["prioridad"] == "alta"
    assert "urgencia" in urgente["motivo"].lower()

@pytest.mark.asyncio
async def test_group_tasks_real(async_client: AsyncClient):
    # Crear usuario y token
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear tareas en distintas categorías
    await create_task(async_client, token, {"titulo": "Limpiar cocina", "categoria": "LIMPIEZA"})
    await create_task(async_client, token, {"titulo": "Organizar cocina", "categoria": "LIMPIEZA"})
    await create_task(async_client, token, {"titulo": "Pagar facturas", "categoria": "MANTENIMIENTO"})
    await create_task(async_client, token, {"titulo": "Revisar recibos", "categoria": "COMPRA"})

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
    assert len(data["grupos"]) >= 2  # Ahora sí debería haber múltiples categorías

    # Comprobamos que cada grupo tiene tareas con estructura válida
    for grupo, tareas in data["grupos"].items():
        assert isinstance(grupo, str)
        assert isinstance(tareas, list)
        for tarea in tareas:
            assert "id" in tarea
            assert "titulo" in tarea

@pytest.mark.asyncio
async def test_rewrite_tasks_real(async_client: AsyncClient):
    # Crear usuario y token
    user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear tareas con títulos reformulables
    await create_task(async_client, token, {"titulo": "Hacer cosas del trabajo", "categoria": "OTRO"})
    await create_task(async_client, token, {"titulo": "Organizar casa", "categoria": "OTRO"})

    # Llamada al endpoint de reformulación
    response = await async_client.post(
        "/api/v1/tasks/ai/rewrite",
        headers=headers,
        json={"task_ids": None}
    )

    assert response.status_code == 200
    data = response.json()

    # Validaciones básicas
    assert isinstance(data, list)
    assert len(data) == 2

    for tarea in data:
        assert "id" in tarea
        assert "original" in tarea
        assert "reformulada" in tarea
        assert tarea["reformulada"].strip() != ""
        # Puede estar marcada como "sin cambios sugeridos" si no cambió
