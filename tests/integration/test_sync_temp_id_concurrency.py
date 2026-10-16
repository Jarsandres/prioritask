import asyncio
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select

from app.models import Task


async def _create_task_batch(
    async_client: AsyncClient,
    headers: dict[str, str],
    room_id: UUID,
    temp_id: str,
    title: str,
    timestamp: int,
):
    cmd_uuid = str(uuid4())
    return await async_client.post(
        "/api/v1/sync/batch",
        headers=headers,
        json={
            "sync_token": "*",
            "room_id": str(room_id),
            "commands": [
                {
                    "uuid": cmd_uuid,
                    "temp_id": temp_id,
                    "type": "task_create",
                    "args": {"titulo": title, "room_id": str(room_id)},
                    "timestamp": timestamp,
                }
            ],
        },
    )


@pytest.mark.asyncio
async def test_temp_id_mapping_is_scoped_per_request_and_user(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
    session,
):
    """El mismo placeholder en dos peticiones distintas no provoca crosstalk de mapeo."""
    shared_temp = "temp_shared_placeholder"

    res_a = await _create_task_batch(
        async_client, user_a_headers, room_owner_a.id, shared_temp, "Tarea A Compartida", 1700000000000
    )
    res_b = await _create_task_batch(
        async_client, user_a_headers, room_owner_a.id, shared_temp, "Tarea B Compartida", 1700000000001
    )
    assert res_a.status_code == 200 and res_b.status_code == 200
    assert res_a.json()["sync_status"] and "ok" in res_a.json()["sync_status"].values()
    assert res_b.json()["sync_status"] and "ok" in res_b.json()["sync_status"].values()

    mapping_a = res_a.json()["temp_id_mapping"][shared_temp]
    mapping_b = res_b.json()["temp_id_mapping"][shared_temp]
    assert mapping_a != mapping_b

    tasks = (await session.exec(select(Task).where(Task.titulo.like("Tarea % Compartida")))).all()
    titles_to_ids = {t.titulo: str(t.id) for t in tasks}
    assert titles_to_ids["Tarea A Compartida"] == mapping_a
    assert titles_to_ids["Tarea B Compartida"] == mapping_b


@pytest.mark.asyncio
async def test_concurrent_batches_with_distinct_temp_ids_do_not_crosstalk(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
):
    """Dos lotes concurrentes con placeholders distintos conservan su propio mapeo."""
    temp_one = f"temp_{uuid4().hex}"
    temp_two = f"temp_{uuid4().hex}"

    res_one, res_two = await asyncio.gather(
        _create_task_batch(
            async_client, user_a_headers, room_owner_a.id, temp_one, "Concurrente Uno", 1700000100000
        ),
        _create_task_batch(
            async_client, user_a_headers, room_owner_a.id, temp_two, "Concurrente Dos", 1700000100001
        ),
    )

    assert res_one.status_code == 200, res_one.text
    assert res_two.status_code == 200, res_two.text

    real_one = res_one.json()["temp_id_mapping"][temp_one]
    real_two = res_two.json()["temp_id_mapping"][temp_two]
    assert real_one != real_two
    assert temp_two not in res_one.json()["temp_id_mapping"]
