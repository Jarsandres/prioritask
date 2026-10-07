from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_room_analytics_unauthenticated_and_unauthorized(async_client: AsyncClient):
    # Create owner and room
    _owner, owner_token = await create_user_and_token(async_client)
    room_resp = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Hogar Analytics Auth"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert room_resp.status_code == 201
    room_id = room_resp.json()["id"]

    # 1. Unauthenticated -> 401
    unauth_resp = await async_client.get(f"/api/v1/rooms/{room_id}/analytics")
    assert unauth_resp.status_code == 401

    # 2. Non-member user -> 404
    _stranger, stranger_token = await create_user_and_token(async_client)
    stranger_resp = await async_client.get(
        f"/api/v1/rooms/{room_id}/analytics",
        headers={"Authorization": f"Bearer {stranger_token}"},
    )
    assert stranger_resp.status_code == 404

    # 3. Non-existent room -> 404
    fake_room_id = str(uuid4())
    nf_resp = await async_client.get(
        f"/api/v1/rooms/{fake_room_id}/analytics",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert nf_resp.status_code == 404


@pytest.mark.asyncio
async def test_room_analytics_empty_room(async_client: AsyncClient):
    _owner, owner_token = await create_user_and_token(async_client)
    room_resp = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Hogar Vacio"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert room_resp.status_code == 201
    room_id = room_resp.json()["id"]

    resp = await async_client.get(
        f"/api/v1/rooms/{room_id}/analytics",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["room_id"] == room_id
    assert data["total_tareas_activas"] == 0
    assert data["total_tareas_completadas"] == 0
    assert data["tasa_completitud"] == 0.0
    assert data["tareas_vencidas"] == 0
    assert "LIMPIEZA" in data["distribucion_por_categoria"]
    assert len(data["distribucion_por_miembro"]) >= 1


@pytest.mark.asyncio
async def test_room_analytics_full_metrics_calculation(async_client: AsyncClient):
    # 1. Crear propietario y sala
    owner_email = f"owner_{uuid4().hex[:6]}@example.com"
    _owner, owner_token = await create_user_and_token(async_client, email=owner_email)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    room_resp = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": f"Hogar Metricas {uuid4().hex[:4]}"},
        headers=owner_headers,
    )
    assert room_resp.status_code == 201
    room_id = room_resp.json()["id"]

    # 2. Invitar un segundo miembro
    member_email = f"collab_{uuid4().hex[:6]}@example.com"
    member_user, member_token = await create_user_and_token(async_client, email=member_email)
    member_id = member_user["id"]
    member_headers = {"Authorization": f"Bearer {member_token}"}

    add_member_resp = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": member_id, "role": "MEMBER"},
        headers=owner_headers,
    )
    assert add_member_resp.status_code == 201

    now = datetime.now(UTC)
    yesterday = (now - timedelta(days=1)).isoformat()
    tomorrow = (now + timedelta(days=1)).isoformat()

    # 3. Crear tareas:
    # Tarea 1: LIMPIEZA, peso 2.0, vencida ayer, no completada (due_date in past)
    await create_task(
        async_client,
        owner_token,
        {
            "titulo": "Limpieza profunda de cocina",
            "categoria": "LIMPIEZA",
            "peso": 2.0,
            "due_date": yesterday,
            "room_id": room_id,
        },
    )

    # Tarea 2: COMPRA, peso 1.5, para mañana, completada
    task2 = await create_task(
        async_client,
        owner_token,
        {
            "titulo": "Comprar provisiones",
            "categoria": "COMPRA",
            "peso": 1.5,
            "due_date": tomorrow,
            "room_id": room_id,
        },
    )
    # Marcar tarea 2 como completada
    patch_resp = await async_client.patch(
        f"/api/v1/tasks/{task2['id']}",
        json={"completed": True},
        headers=owner_headers,
    )
    assert patch_resp.status_code == 200

    # Tarea 3: MANTENIMIENTO, peso 3.0, asignada al segundo miembro, completada
    task3 = await create_task(
        async_client,
        owner_token,
        {
            "titulo": "Reparar grifo",
            "categoria": "MANTENIMIENTO",
            "peso": 3.0,
            "room_id": room_id,
        },
    )
    assign_resp = await async_client.post(
        "/api/v1/tasks/assign",
        json={"task_id": task3["id"], "user_id": member_id},
        headers=owner_headers,
    )
    assert assign_resp.status_code == 201

    patch_task3 = await async_client.patch(
        f"/api/v1/tasks/{task3['id']}",
        json={"completed": True},
        headers=member_headers,
    )
    assert patch_task3.status_code == 200

    # Tarea 4: OTRO, eliminada mediante soft delete
    task4 = await create_task(
        async_client,
        owner_token,
        {
            "titulo": "Tarea descartada",
            "categoria": "OTRO",
            "room_id": room_id,
        },
    )
    del_resp = await async_client.delete(f"/api/v1/tasks/{task4['id']}", headers=owner_headers)
    assert del_resp.status_code == 204

    # 4. Consultar métricas (como miembro de la sala)
    analytics_resp = await async_client.get(
        f"/api/v1/rooms/{room_id}/analytics",
        headers=member_headers,
    )
    assert analytics_resp.status_code == 200
    analytics = analytics_resp.json()

    # Validar métricas globales
    assert analytics["room_id"] == room_id
    assert analytics["total_tareas_activas"] == 1  # Tarea 1
    assert analytics["total_tareas_completadas"] == 2  # Tarea 2 y 3 (Tarea 4 eliminada)
    assert analytics["tareas_vencidas"] == 1  # Solo Tarea 1 (due_date en el pasado y no completada)
    assert analytics["tasa_completitud"] == round((2 / 3) * 100.0, 2)

    # Validar categorías (Tarea 1: LIMPIEZA, Tarea 2: COMPRA, Tarea 3: MANTENIMIENTO)
    cats = analytics["distribucion_por_categoria"]
    assert cats["LIMPIEZA"] == 1
    assert cats["COMPRA"] == 1
    assert cats["MANTENIMIENTO"] == 1
    assert cats["OTRO"] == 0  # Eliminada

    # Validar distribución por miembro
    members_workload = {m["user_id"]: m for m in analytics["distribucion_por_miembro"]}
    assert member_id in members_workload
    member_stats = members_workload[member_id]
    assert member_stats["tareas_asignadas"] == 1
    assert member_stats["tareas_completadas"] == 1
    assert member_stats["peso_total_completado"] == 3.0
