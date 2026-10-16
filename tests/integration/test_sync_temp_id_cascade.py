from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_temp_id_mapping_never_returns_temp_values(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
):
    """Invariante I1: el mapeo devuelto nunca contiene valores con prefijo ``temp_``."""
    temp_task_id = f"temp_{uuid4().hex}"
    create_uuid = str(uuid4())

    res = await async_client.post(
        "/api/v1/sync/batch",
        headers=user_a_headers,
        json={
            "sync_token": "*",
            "room_id": str(room_owner_a.id),
            "commands": [
                {
                    "uuid": create_uuid,
                    "temp_id": temp_task_id,
                    "type": "task_create",
                    "args": {
                        "titulo": "Tarea Mapeo Determinista",
                        "room_id": str(room_owner_a.id),
                    },
                    "timestamp": 1700000000000,
                }
            ],
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["sync_status"][create_uuid] == "ok"
    mapping = data["temp_id_mapping"]
    assert temp_task_id in mapping
    assert not mapping[temp_task_id].startswith("temp_")
    UUID(mapping[temp_task_id])  # debe ser un UUID v4 real del servidor


@pytest.mark.asyncio
async def test_forward_reference_returns_invalid_temp_id(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
):
    """Un dependiente que referencia un ``temp_id`` irresoluble rinde error semántico."""
    bogus_temp = f"temp_{uuid4().hex}"
    cmd_uuid = str(uuid4())

    res = await async_client.post(
        "/api/v1/sync/batch",
        headers=user_a_headers,
        json={
            "sync_token": "*",
            "room_id": str(room_owner_a.id),
            "commands": [
                {
                    "uuid": cmd_uuid,
                    "type": "task_update",
                    "args": {"id": bogus_temp, "peso": 4.0},
                    "timestamp": 1700000000000,
                }
            ],
        },
    )
    assert res.status_code == 200, res.text
    result = res.json()["sync_status"][cmd_uuid]
    assert isinstance(result, dict), result
    assert result["error_tag"] == "INVALID_TEMP_ID"
    assert result["error_code"] == 422


@pytest.mark.asyncio
async def test_duplicate_temp_id_across_creates_is_rejected(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
):
    """H1: un ``temp_id`` declarado por dos creaciones es un error determinista."""
    duplicated_temp = f"temp_{uuid4().hex}"
    first_uuid = str(uuid4())
    second_uuid = str(uuid4())

    res = await async_client.post(
        "/api/v1/sync/batch",
        headers=user_a_headers,
        json={
            "sync_token": "*",
            "room_id": str(room_owner_a.id),
            "commands": [
                {
                    "uuid": first_uuid,
                    "temp_id": duplicated_temp,
                    "type": "task_create",
                    "args": {
                        "titulo": "Colision Temporal Uno",
                        "room_id": str(room_owner_a.id),
                    },
                    "timestamp": 1700000000001,
                },
                {
                    "uuid": second_uuid,
                    "temp_id": duplicated_temp,
                    "type": "task_create",
                    "args": {
                        "titulo": "Colision Temporal Dos",
                        "room_id": str(room_owner_a.id),
                    },
                    "timestamp": 1700000000002,
                },
            ],
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    for uuid in (first_uuid, second_uuid):
        assert data["sync_status"][uuid]["error_tag"] == "TEMP_ID_COLLISION"
    assert duplicated_temp not in data["temp_id_mapping"]
