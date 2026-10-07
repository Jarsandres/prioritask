import os
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.utils import create_task, create_user_and_token

os.environ["ALLOW_PAST_DUE_DATES"] = "1"


@pytest.mark.asyncio
async def test_tasks_calendar_due_date_filtering(async_client: AsyncClient):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Crear 3 tareas con distintas fechas de vencimiento
    t1 = await create_task(
        async_client,
        token,
        {
            "titulo": "Tarea Mayo",
            "categoria": "OTRO",
            "due_date": "2026-05-15T10:00:00Z",
        },
    )
    t2 = await create_task(
        async_client,
        token,
        {
            "titulo": "Tarea Junio",
            "categoria": "OTRO",
            "due_date": "2026-06-15T10:00:00Z",
        },
    )
    t3 = await create_task(
        async_client,
        token,
        {
            "titulo": "Tarea Julio",
            "categoria": "OTRO",
            "due_date": "2026-07-15T10:00:00Z",
        },
    )

    # 1. Filtro due_date_from con formato fecha (2026-06-01) -> debe excluir t1
    resp_from = await async_client.get(
        "/api/v1/tasks",
        params={"due_date_from": "2026-06-01"},
        headers=headers,
    )
    assert resp_from.status_code == 200
    ids_from = {t["id"] for t in resp_from.json()}
    assert t1["id"] not in ids_from
    assert t2["id"] in ids_from
    assert t3["id"] in ids_from

    # 2. Filtro due_date_to con formato fecha (2026-06-30) -> debe excluir t3
    resp_to = await async_client.get(
        "/api/v1/tasks",
        params={"due_date_to": "2026-06-30"},
        headers=headers,
    )
    assert resp_to.status_code == 200
    ids_to = {t["id"] for t in resp_to.json()}
    assert t1["id"] in ids_to
    assert t2["id"] in ids_to
    assert t3["id"] not in ids_to

    # 3. Rango exacto due_date_from y due_date_to para el mes de Junio -> solo t2
    resp_range = await async_client.get(
        "/api/v1/tasks",
        params={
            "due_date_from": "2026-06-01T00:00:00Z",
            "due_date_to": "2026-06-30T23:59:59Z",
        },
        headers=headers,
    )
    assert resp_range.status_code == 200
    ids_range = {t["id"] for t in resp_range.json()}
    assert ids_range == {t2["id"]}


@pytest.mark.asyncio
async def test_room_tasks_calendar_due_date_filtering(async_client: AsyncClient):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    room_resp = await async_client.post("/api/v1/rooms", json={"nombre": f"Sala Calendar {uuid4().hex[:6]}"}, headers=headers)
    assert room_resp.status_code == 201
    room_id = room_resp.json()["id"]

    t_in = await create_task(
        async_client,
        token,
        {
            "titulo": "Tarea Sala Diciembre",
            "categoria": "OTRO",
            "due_date": "2026-12-10T12:00:00Z",
            "room_id": room_id,
        },
    )
    t_out = await create_task(
        async_client,
        token,
        {
            "titulo": "Tarea Sala Enero",
            "categoria": "OTRO",
            "due_date": "2027-01-10T12:00:00Z",
            "room_id": room_id,
        },
    )

    # Filtrar tareas del hogar para diciembre 2026
    resp = await async_client.get(
        f"/api/v1/rooms/{room_id}/tasks",
        params={
            "due_date_from": "2026-12-01",
            "due_date_to": "2026-12-31",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    tasks = resp.json()
    ids = {t["id"] for t in tasks}
    assert t_in["id"] in ids
    assert t_out["id"] not in ids
