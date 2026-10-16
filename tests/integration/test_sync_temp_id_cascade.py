from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select

from app.models import Subtask, Tag, Task, TaskTag


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


@pytest.mark.asyncio
async def test_idempotent_replay_reconstructs_mapping_from_args_task_id(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
):
    """H4: un ``task_create`` que declara su placeholder en ``args.task_id`` también se mapea."""
    temp_alias = f"temp_{uuid4().hex}"
    create_uuid = str(uuid4())
    batch = {
        "sync_token": "*",
        "room_id": str(room_owner_a.id),
        "commands": [
            {
                "uuid": create_uuid,
                "type": "task_create",
                "args": {
                    "task_id": temp_alias,
                    "titulo": "Alias Idempotente",
                    "room_id": str(room_owner_a.id),
                },
                "timestamp": 1700000000000,
            }
        ],
    }

    first = await async_client.post(
        "/api/v1/sync/batch", headers=user_a_headers, json=batch
    )
    assert first.status_code == 200, first.text
    real_id = first.json()["temp_id_mapping"][temp_alias]
    assert not real_id.startswith("temp_")

    # Reenvío exactamente el mismo lote (reintento de red)
    second = await async_client.post(
        "/api/v1/sync/batch", headers=user_a_headers, json=batch
    )
    assert second.status_code == 200, second.text
    assert second.json()["sync_status"][create_uuid] == "ok"
    assert second.json()["temp_id_mapping"][temp_alias] == real_id


@pytest.mark.asyncio
async def test_subtask_create_with_temp_parent_keeps_referential_integrity(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
    session,
):
    """I2: una subtarea offline creada contra un padre temporal no deja FK huérfanas."""
    parent_temp = f"temp_{uuid4().hex}"
    subtask_temp = f"temp_{uuid4().hex}"
    parent_uuid = str(uuid4())
    subtask_uuid = str(uuid4())

    res = await async_client.post(
        "/api/v1/sync/batch",
        headers=user_a_headers,
        json={
            "sync_token": "*",
            "room_id": str(room_owner_a.id),
            "commands": [
                {
                    "uuid": parent_uuid,
                    "temp_id": parent_temp,
                    "type": "task_create",
                    "args": {
                        "titulo": "Padre Offline",
                        "room_id": str(room_owner_a.id),
                    },
                    "timestamp": 1700000000000,
                },
                {
                    "uuid": subtask_uuid,
                    "temp_id": subtask_temp,
                    "type": "subtask_create",
                    "args": {"task_id": parent_temp, "titulo": "Hija Offline", "orden": 1},
                    "timestamp": 1700000000001,
                },
            ],
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["sync_status"][parent_uuid] == "ok", data["sync_status"]
    assert data["sync_status"][subtask_uuid] == "ok", data["sync_status"]

    real_parent = data["temp_id_mapping"][parent_temp]
    real_subtask = data["temp_id_mapping"][subtask_temp]
    assert not real_subtask.startswith("temp_")

    linked = (
        await session.exec(select(Subtask).where(Subtask.id == UUID(real_subtask)))
    ).one()
    assert str(linked.task_id) == real_parent

    task_ids = {str(t.id) for t in (await session.exec(select(Task))).all()}
    orphans = [
        s for s in (await session.exec(select(Subtask))).all()
        if str(s.task_id) not in task_ids
    ]
    assert orphans == []


@pytest.mark.asyncio
async def test_tag_create_and_attach_resolve_temp_ids(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
    session,
):
    """I2: tag_attach contra un task_create y tag_create temporales crea FK válidas."""
    task_temp = f"temp_{uuid4().hex}"
    tag_temp = f"temp_{uuid4().hex}"
    task_uuid = str(uuid4())
    tag_uuid = str(uuid4())
    attach_uuid = str(uuid4())

    res = await async_client.post(
        "/api/v1/sync/batch",
        headers=user_a_headers,
        json={
            "sync_token": "*",
            "room_id": str(room_owner_a.id),
            "commands": [
                {
                    "uuid": task_uuid,
                    "temp_id": task_temp,
                    "type": "task_create",
                    "args": {
                        "titulo": "Tarea Con Etiqueta Offline",
                        "room_id": str(room_owner_a.id),
                    },
                    "timestamp": 1700000000000,
                },
                {
                    "uuid": tag_uuid,
                    "temp_id": tag_temp,
                    "type": "tag_create",
                    "args": {"nombre": f"Etiqueta-{uuid4().hex[:8]}"},
                    "timestamp": 1700000000001,
                },
                {
                    "uuid": attach_uuid,
                    "type": "tag_attach",
                    "args": {"task_id": task_temp, "tag_id": tag_temp},
                    "timestamp": 1700000000002,
                },
            ],
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["sync_status"][task_uuid] == "ok", data["sync_status"]
    assert data["sync_status"][tag_uuid] == "ok", data["sync_status"]
    assert data["sync_status"][attach_uuid] == "ok", data["sync_status"]

    real_task = data["temp_id_mapping"][task_temp]
    real_tag = data["temp_id_mapping"][tag_temp]

    links = (
        await session.exec(
            select(TaskTag).where(
                TaskTag.task_id == UUID(real_task), TaskTag.tag_id == UUID(real_tag)
            )
        )
    ).all()
    assert len(links) == 1

    task_ids = {str(t.id) for t in (await session.exec(select(Task))).all()}
    tag_ids = {str(t.id) for t in (await session.exec(select(Tag))).all()}
    for link in (await session.exec(select(TaskTag))).all():
        assert str(link.task_id) in task_ids
        assert str(link.tag_id) in tag_ids


@pytest.mark.asyncio
async def test_subtask_create_unknown_parent_returns_invalid_temp_id(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
):
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
                    "type": "subtask_create",
                    "args": {"task_id": f"temp_{uuid4().hex}", "titulo": "Huérfana"},
                    "timestamp": 1700000000000,
                }
            ],
        },
    )
    assert res.status_code == 200, res.text
    result = res.json()["sync_status"][cmd_uuid]
    assert isinstance(result, dict), result
    assert result["error_tag"] == "INVALID_TEMP_ID"


@pytest.mark.asyncio
async def test_tag_attach_anti_idor_rejects_foreign_task(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    user_c_headers: dict[str, str],
    room_owner_a,
):
    create_res = await async_client.post(
        "/api/v1/tasks",
        json={
            "titulo": "Tarea Privada A Para IDOR",
            "categoria": "OTRO",
            "peso": 2.0,
            "room_id": str(room_owner_a.id),
        },
        headers=user_a_headers,
    )
    assert create_res.status_code == 201
    task_id = create_res.json()["id"]

    tag_res = await async_client.post(
        "/api/v1/tags",
        json={"nombre": f"C-Tag-{uuid4().hex[:8]}"},
        headers=user_c_headers,
    )
    assert tag_res.status_code == 201, tag_res.text
    tag_id = tag_res.json()["id"]

    cmd_uuid = str(uuid4())
    res = await async_client.post(
        "/api/v1/sync/batch",
        headers=user_c_headers,
        json={
            "sync_token": "*",
            "commands": [
                {
                    "uuid": cmd_uuid,
                    "type": "tag_attach",
                    "args": {"task_id": task_id, "tag_id": tag_id},
                    "timestamp": 1700000000000,
                }
            ],
        },
    )
    assert res.status_code == 200, res.text
    result = res.json()["sync_status"][cmd_uuid]
    assert isinstance(result, dict), result
    assert result["error_code"] in (403, 404)
