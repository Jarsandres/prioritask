from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_sync_batch_offline_create_with_temp_id_and_complete_in_same_batch(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
):
    create_cmd_uuid = str(uuid4())
    complete_cmd_uuid = str(uuid4())
    reminder_cmd_uuid = str(uuid4())
    temp_task_id = f"temp_{uuid4().hex[:12]}"

    batch_payload = {
        "sync_token": "*",
        "room_id": str(room_owner_a.id),
        "commands": [
            {
                "uuid": create_cmd_uuid,
                "temp_id": temp_task_id,
                "type": "task_create",
                "args": {
                    "titulo": "Tarea Offline con TempID",
                    "descripcion": "Creada sin conexión",
                    "categoria": "LIMPIEZA",
                    "peso": 3.0,
                    "room_id": str(room_owner_a.id),
                },
                "timestamp": 1700000001000,
                "hlc_timestamp": "1700000001000:0000:clientA",
                "field_hlc": {
                    "titulo": "1700000001000:0000:clientA",
                    "peso": "1700000001000:0000:clientA",
                },
            },
            {
                "uuid": reminder_cmd_uuid,
                "type": "task_schedule_reminder",
                "args": {
                    "id": temp_task_id,
                    "reminder_at": "2026-12-01T09:30:00Z",
                },
                "timestamp": 1700000001500,
                "hlc_timestamp": "1700000001500:0000:clientA",
                "base_version": 1,
                "field_hlc": {
                    "reminder_at": "1700000001500:0000:clientA",
                },
            },
            {
                "uuid": complete_cmd_uuid,
                "type": "task_complete",
                "args": {
                    "id": temp_task_id,
                },
                "timestamp": 1700000002000,
                "hlc_timestamp": "1700000002000:0000:clientA",
                "base_version": 2,
                "field_hlc": {
                    "completed": "1700000002000:0000:clientA",
                    "estado": "1700000002000:0000:clientA",
                },
            },
        ],
    }

    res = await async_client.post(
        "/api/v1/sync/batch",
        json=batch_payload,
        headers=user_a_headers,
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["sync_status"][create_cmd_uuid] == "ok"
    assert data["sync_status"][reminder_cmd_uuid] == "ok"
    assert data["sync_status"][complete_cmd_uuid] == "ok"
    assert temp_task_id in data["temp_id_mapping"]

    real_task_id = data["temp_id_mapping"][temp_task_id]
    get_res = await async_client.get(
        f"/api/v1/tasks/{real_task_id}",
        headers=user_a_headers,
    )
    assert get_res.status_code == 200
    task_data = get_res.json()
    assert task_data["titulo"] == "Tarea Offline con TempID"
    assert task_data["completed"] is True
    assert task_data["estado"] == "DONE"
    assert task_data["version"] == 3
    assert task_data["reminder_at"] is not None
    assert "2026-12-01T09:30:00" in task_data["reminder_at"]


@pytest.mark.asyncio
async def test_sync_batch_idempotency_does_not_duplicate_or_reapply(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
):
    create_cmd_uuid = str(uuid4())
    update_cmd_uuid = str(uuid4())
    temp_task_id = f"temp_{uuid4().hex[:10]}"

    batch_payload = {
        "sync_token": "*",
        "room_id": str(room_owner_a.id),
        "commands": [
            {
                "uuid": create_cmd_uuid,
                "temp_id": temp_task_id,
                "type": "task_create",
                "args": {
                    "titulo": "Tarea Idempotente Unica",
                    "categoria": "COMPRA",
                    "peso": 2.0,
                    "room_id": str(room_owner_a.id),
                },
                "timestamp": 1700000010000,
                "hlc_timestamp": "1700000010000:0000:clientA",
            },
            {
                "uuid": update_cmd_uuid,
                "type": "task_update",
                "args": {
                    "id": temp_task_id,
                    "peso": 4.0,
                },
                "timestamp": 1700000011000,
                "hlc_timestamp": "1700000011000:0000:clientA",
                "base_version": 1,
                "field_hlc": {"peso": "1700000011000:0000:clientA"},
            },
        ],
    }

    first_res = await async_client.post(
        "/api/v1/sync/batch",
        json=batch_payload,
        headers=user_a_headers,
    )
    assert first_res.status_code == 200
    first_data = first_res.json()
    real_task_id = first_data["temp_id_mapping"][temp_task_id]

    # Reenviar exactamente el mismo lote (reintento de red)
    second_res = await async_client.post(
        "/api/v1/sync/batch",
        json=batch_payload,
        headers=user_a_headers,
    )
    assert second_res.status_code == 200
    second_data = second_res.json()
    assert second_data["sync_status"][create_cmd_uuid] == "ok"
    assert second_data["sync_status"][update_cmd_uuid] == "ok"
    assert second_data["temp_id_mapping"][temp_task_id] == real_task_id

    get_res = await async_client.get(
        f"/api/v1/tasks/{real_task_id}",
        headers=user_a_headers,
    )
    assert get_res.status_code == 200
    task_data = get_res.json()
    assert task_data["version"] == 2
    assert task_data["peso"] == 4.0


@pytest.mark.asyncio
async def test_sync_batch_field_hlc_merge_on_disjoint_fields_conflict(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    room_owner_a,
):
    # 1. Crear tarea inicial (version = 1)
    create_res = await async_client.post(
        "/api/v1/tasks",
        json={
            "titulo": "Tarea Base Concurrencia",
            "categoria": "MANTENIMIENTO",
            "peso": 1.0,
            "room_id": str(room_owner_a.id),
        },
        headers=user_a_headers,
    )
    assert create_res.status_code == 201
    task_id = create_res.json()["id"]
    assert create_res.json()["version"] == 1

    # 2. Cliente A (online) actualiza el título a version = 2 con HLC alto en 'titulo'
    put_res = await async_client.put(
        f"/api/v1/tasks/{task_id}",
        json={
            "titulo": "Título Actualizado Online",
            "expected_version": 1,
            "field_hlc": {"titulo": "1700000050000:0000:nodeOnline"},
        },
        headers=user_a_headers,
    )
    assert put_res.status_code == 200
    assert put_res.json()["version"] == 2

    # 3. Cliente B (offline) tenía base_version = 1 y modificó 'peso' (campo disjunto)
    # e intentó modificar 'titulo' con un HLC más antiguo que el de nodeOnline
    conflict_cmd_uuid = str(uuid4())
    sync_res = await async_client.post(
        "/api/v1/sync/batch",
        json={
            "sync_token": "*",
            "room_id": str(room_owner_a.id),
            "commands": [
                {
                    "uuid": conflict_cmd_uuid,
                    "type": "task_update",
                    "args": {
                        "id": task_id,
                        "peso": 8.5,
                        "titulo": "Título Offline Obsoleto",
                    },
                    "timestamp": 1700000040000,
                    "hlc_timestamp": "1700000040000:0000:nodeOffline",
                    "base_version": 1,
                    "field_hlc": {
                        "peso": "1700000040000:0000:nodeOffline",
                        "titulo": "1700000030000:0000:nodeOffline",
                    },
                }
            ],
        },
        headers=user_a_headers,
    )
    assert sync_res.status_code == 200
    sync_data = sync_res.json()

    cmd_result = sync_data["sync_status"][conflict_cmd_uuid]
    assert isinstance(cmd_result, dict)
    assert cmd_result["error_code"] == 409
    assert cmd_result["error_tag"] == "CONFLICT_STALE_TIMESTAMP"
    assert cmd_result["retryable"] is False

    server_record = cmd_result["server_record"]
    assert server_record is not None
    # 'titulo' conserva el valor de nodeOnline (HLC mayor), 'peso' adopta el valor de nodeOffline (campo disjunto)
    assert server_record["titulo"] == "Título Actualizado Online"
    assert server_record["peso"] == 8.5
    assert server_record["version"] == 3
    assert server_record["field_hlc"]["titulo"] == "1700000050000:0000:nodeOnline"
    assert server_record["field_hlc"]["peso"] == "1700000040000:0000:nodeOffline"


@pytest.mark.asyncio
async def test_sync_batch_anti_idor_prevents_cross_tenant_mutation_and_deletion(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    user_c_headers: dict[str, str],
    room_owner_a,
):
    # Usuario A crea una tarea en su hogar
    create_res = await async_client.post(
        "/api/v1/tasks",
        json={
            "titulo": "Tarea Privada de Usuario A",
            "categoria": "OTRO",
            "peso": 2.0,
            "room_id": str(room_owner_a.id),
        },
        headers=user_a_headers,
    )
    assert create_res.status_code == 201
    task_id = create_res.json()["id"]

    # Usuario C (ajeno al hogar) intenta actualizar, completar y eliminar la tarea de A vía /sync/batch
    upd_uuid = str(uuid4())
    cmp_uuid = str(uuid4())
    del_uuid = str(uuid4())

    idor_res = await async_client.post(
        "/api/v1/sync/batch",
        json={
            "sync_token": "*",
            "commands": [
                {
                    "uuid": upd_uuid,
                    "type": "task_update",
                    "args": {"id": task_id, "titulo": "Hackeada por C"},
                    "timestamp": 1700000090000,
                },
                {
                    "uuid": cmp_uuid,
                    "type": "task_complete",
                    "args": {"id": task_id},
                    "timestamp": 1700000091000,
                },
                {
                    "uuid": del_uuid,
                    "type": "task_delete",
                    "args": {"id": task_id},
                    "timestamp": 1700000092000,
                },
            ],
        },
        headers=user_c_headers,
    )
    assert idor_res.status_code == 200
    status_map = idor_res.json()["sync_status"]

    for cmd_id in (upd_uuid, cmp_uuid, del_uuid):
        assert status_map[cmd_id]["error_code"] == 404
        assert status_map[cmd_id]["error_tag"] == "ENTITY_NOT_FOUND"

    # Verificar que la tarea de Usuario A sigue intacta
    verify_res = await async_client.get(
        f"/api/v1/tasks/{task_id}",
        headers=user_a_headers,
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["titulo"] == "Tarea Privada de Usuario A"
    assert verify_data["completed"] is False
    assert verify_data["version"] == 1
