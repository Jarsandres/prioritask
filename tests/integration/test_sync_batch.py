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


@pytest.mark.asyncio
async def test_sync_batch_uncomplete_and_owner_delete_and_collaborator_delete_rejected(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    user_b_headers: dict[str, str],
    task_assigned_b,
):
    task_id = str(task_assigned_b.id)
    complete_uuid = str(uuid4())
    uncomplete_uuid = str(uuid4())
    collab_delete_uuid = str(uuid4())
    owner_delete_uuid = str(uuid4())

    # Colaborador B puede completar y descompletar, pero NO eliminar la tarea del owner A
    collab_res = await async_client.post(
        "/api/v1/sync/batch",
        json={
            "sync_token": "2026-01-01T00:00:00Z",
            "commands": [
                {
                    "uuid": complete_uuid,
                    "type": "task_complete",
                    "args": {"id": task_id},
                    "timestamp": 1700000100000,
                },
                {
                    "uuid": uncomplete_uuid,
                    "type": "task_uncomplete",
                    "args": {"id": task_id},
                    "timestamp": 1700000101000,
                },
                {
                    "uuid": collab_delete_uuid,
                    "type": "task_delete",
                    "args": {"id": task_id},
                    "timestamp": 1700000102000,
                },
            ],
        },
        headers=user_b_headers,
    )
    assert collab_res.status_code == 200
    collab_data = collab_res.json()
    assert collab_data["full_sync"] is False
    assert collab_data["sync_status"][complete_uuid] == "ok"
    assert collab_data["sync_status"][uncomplete_uuid] == "ok"
    assert collab_data["sync_status"][collab_delete_uuid]["error_code"] in (403, 404)

    # Owner A elimina la tarea exitosamente mediante sync/batch
    owner_res = await async_client.post(
        "/api/v1/sync/batch",
        json={
            "sync_token": "2026-01-01T00:00:00Z",
            "commands": [
                {
                    "uuid": owner_delete_uuid,
                    "type": "task_delete",
                    "args": {"id": task_id},
                    "timestamp": 1700000103000,
                }
            ],
        },
        headers=user_a_headers,
    )
    assert owner_res.status_code == 200
    owner_data = owner_res.json()
    assert owner_data["sync_status"][owner_delete_uuid] == "ok"

    # La tarea eliminada con soft-delete ya no debe estar accesible
    get_res = await async_client.get(
        f"/api/v1/tasks/{task_id}",
        headers=user_a_headers,
    )
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_sync_batch_validation_errors_and_command_uuid_collision_across_users(
    async_client: AsyncClient,
    user_a_headers: dict[str, str],
    user_c_headers: dict[str, str],
    room_owner_a,
):
    shared_cmd_uuid = str(uuid4())
    short_title_uuid = str(uuid4())
    missing_id_update_uuid = str(uuid4())
    missing_id_delete_uuid = str(uuid4())
    invalid_weight_uuid = str(uuid4())
    invalid_room_uuid = str(uuid4())

    # 1. Usuario A ejecuta un task_create válido (con recurrencia, due_date numérico y sin room_id explícito)
    res_a = await async_client.post(
        "/api/v1/sync/batch",
        json={
            "sync_token": "*",
            "commands": [
                {
                    "uuid": shared_cmd_uuid,
                    "type": "task_create",
                    "args": {
                        "titulo": "Tarea Recurrente Sincronizada",
                        "descripcion": "Con regla semanal",
                        "categoria": "LIMPIEZA",
                        "estado": "DONE",
                        "peso": 2.5,
                        "due_date": 1700000200000,
                        "recurrence_rule": {
                            "frequency": "WEEKLY",
                            "interval": 1,
                        },
                    },
                    "timestamp": 1700000200000,
                    "hlc_timestamp": "1700000200000:0000:nodeA",
                }
            ],
        },
        headers=user_a_headers,
    )
    assert res_a.status_code == 200
    assert res_a.json()["sync_status"][shared_cmd_uuid] == "ok"
    created_task_id = res_a.json()["items"][0]["id"]

    # 2. Usuario C intenta reutilizar el mismo command.uuid -> 403 FORBIDDEN
    res_c = await async_client.post(
        "/api/v1/sync/batch",
        json={
            "sync_token": "*",
            "commands": [
                {
                    "uuid": shared_cmd_uuid,
                    "type": "task_create",
                    "args": {"titulo": "Intento Colision UUID"},
                    "timestamp": 1700000201000,
                }
            ],
        },
        headers=user_c_headers,
    )
    assert res_c.status_code == 200
    collision_status = res_c.json()["sync_status"][shared_cmd_uuid]
    assert collision_status["error_code"] == 403
    assert collision_status["error_tag"] == "FORBIDDEN"

    # 3. Errores de validación (título corto, sin ID, peso inválido, room inexistente) y conflicto sin HLC
    lww_conflict_uuid = str(uuid4())
    res_err = await async_client.post(
        "/api/v1/sync/batch",
        json={
            "sync_token": "*",
            "commands": [
                {
                    "uuid": short_title_uuid,
                    "type": "task_create",
                    "args": {"titulo": "ab"},
                    "timestamp": 1700000202000,
                },
                {
                    "uuid": invalid_room_uuid,
                    "type": "task_create",
                    "args": {
                        "titulo": "Tarea en hogar fantasma",
                        "room_id": str(uuid4()),
                    },
                    "timestamp": 1700000202500,
                },
                {
                    "uuid": missing_id_update_uuid,
                    "type": "task_update",
                    "args": {"titulo": "Sin ID"},
                    "timestamp": 1700000203000,
                },
                {
                    "uuid": missing_id_delete_uuid,
                    "type": "task_delete",
                    "args": {},
                    "timestamp": 1700000204000,
                },
                {
                    "uuid": invalid_weight_uuid,
                    "type": "task_update",
                    "args": {
                        "id": created_task_id,
                        "peso": 150.0,
                    },
                    "timestamp": 1700000205000,
                },
                {
                    "uuid": lww_conflict_uuid,
                    "type": "task_update",
                    "args": {
                        "id": created_task_id,
                        "descripcion": "Actualizada por LWW timestamp",
                        "categoria": "COMPRA",
                        "estado": "TODO",
                        "is_recurring": False,
                        "expected_updated_at": "2020-01-01T00:00:00Z",
                    },
                    "timestamp": 9999999999000,
                    "base_version": 0,
                },
            ],
        },
        headers=user_a_headers,
    )
    assert res_err.status_code == 200
    err_status = res_err.json()["sync_status"]
    assert err_status[short_title_uuid]["error_code"] == 422
    assert err_status[short_title_uuid]["error_tag"] == "VALIDATION_ERROR"
    assert err_status[invalid_room_uuid]["error_code"] == 404
    assert err_status[invalid_room_uuid]["error_tag"] == "ENTITY_NOT_FOUND"
    assert err_status[missing_id_update_uuid]["error_code"] == 422
    assert err_status[missing_id_delete_uuid]["error_code"] == 422
    assert err_status[invalid_weight_uuid]["error_code"] == 422
    assert err_status[lww_conflict_uuid]["error_code"] == 409
    assert err_status[lww_conflict_uuid]["error_tag"] == "CONFLICT_STALE_TIMESTAMP"
