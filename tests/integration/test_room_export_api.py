import csv
import io
import json
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_room_export_json_and_csv(async_client: AsyncClient):
    # 1. Crear dueño y sala
    _owner, owner_token = await create_user_and_token(async_client)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    room_res = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": f"Familia_{uuid4().hex[:6]}"},
        headers=owner_headers,
    )
    assert room_res.status_code == 201
    room = room_res.json()
    room_id = room["id"]

    # 2. Agregar miembro
    member_user, member_token = await create_user_and_token(async_client)
    member_headers = {"Authorization": f"Bearer {member_token}"}

    await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": member_user["id"], "role": "MEMBER"},
        headers=owner_headers,
    )

    # 3. Crear tareas con subtareas, comentarios y adjuntos
    task1 = await create_task(
        async_client,
        owner_token,
        {"titulo": "Hacer compra semanal", "categoria": "COMPRA", "room_id": room_id, "peso": 2.0},
    )
    t1_id = task1["id"]

    # Agregar subtarea a tarea 1
    sub_res = await async_client.post(
        f"/api/v1/tasks/{t1_id}/subtasks",
        json={"titulo": "Comprar manzanas"},
        headers=owner_headers,
    )
    assert sub_res.status_code == 201
    sub_id = sub_res.json()["id"]
    patch_res = await async_client.patch(
        f"/api/v1/tasks/{t1_id}/subtasks/{sub_id}",
        json={"completada": True},
        headers=owner_headers,
    )
    assert patch_res.status_code == 200


    # Agregar comentario a tarea 1
    await async_client.post(
        f"/api/v1/tasks/{t1_id}/comments",
        json={"contenido": "Recordar comprar fruta fresca"},
        headers=member_headers,
    )

    # Agregar adjunto a tarea 1
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 30
    await async_client.post(
        f"/api/v1/tasks/{t1_id}/attachments",
        files={"file": ("lista_compra.png", png_content, "image/png")},
        data={"caption": "Foto de la nevera"},
        headers=owner_headers,
    )

    # 4. Probar Exportación JSON (GDPR)
    res_json = await async_client.get(
        f"/api/v1/rooms/{room_id}/export?format=json",
        headers=owner_headers,
    )
    assert res_json.status_code == 200
    assert "application/json" in res_json.headers["content-type"]
    assert "attachment; filename=" in res_json.headers["content-disposition"]
    assert f"prioritask_room_{room_id}_" in res_json.headers["content-disposition"]
    assert res_json.headers["content-disposition"].endswith('.json"')

    dump_data = json.loads(res_json.text)
    assert "hogar" in dump_data or "room" in dump_data
    assert "miembros" in dump_data or "members" in dump_data
    assert "tareas" in dump_data or "tasks" in dump_data

    tasks_exported = dump_data.get("tasks") or dump_data.get("tareas")
    assert len(tasks_exported) >= 1
    exported_t1 = next(t for t in tasks_exported if t["id"] == t1_id)
    assert exported_t1["titulo"] == "Hacer compra semanal"
    assert len(exported_t1["subtasks"]) == 1
    assert exported_t1["subtasks"][0]["titulo"] == "Comprar manzanas"
    assert exported_t1["subtasks"][0]["completada"] is True
    assert len(exported_t1["comments"]) == 1
    assert exported_t1["comments"][0]["contenido"] == "Recordar comprar fruta fresca"
    assert len(exported_t1["attachments"]) == 1
    assert exported_t1["attachments"][0]["filename"] == "lista_compra.png"

    # 5. Probar Exportación CSV (GDPR) por un miembro
    res_csv = await async_client.get(
        f"/api/v1/rooms/{room_id}/export?format=csv",
        headers=member_headers,
    )
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert f"prioritask_room_{room_id}_" in res_csv.headers["content-disposition"]
    assert res_csv.headers["content-disposition"].endswith('.csv"')

    csv_reader = list(csv.reader(io.StringIO(res_csv.text)))
    assert len(csv_reader) >= 2  # Header + al menos 1 fila
    headers_row = csv_reader[0]
    assert "ID tarea" in headers_row
    assert "Título" in headers_row
    assert "Categoría" in headers_row
    assert "Subtareas completadas" in headers_row

    # Buscar fila de t1
    t1_row = next(r for r in csv_reader[1:] if r[0] == t1_id)
    assert t1_row[1] == "Hacer compra semanal"
    assert t1_row[2] == "COMPRA"
    assert t1_row[6] == "1/1"  # 1 completada de 1 total


@pytest.mark.asyncio
async def test_room_export_permissions_and_validation(async_client: AsyncClient):
    _owner, owner_token = await create_user_and_token(async_client)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    room_res = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": f"SalaPrivada_{uuid4().hex[:6]}"},
        headers=owner_headers,
    )
    room_id = room_res.json()["id"]

    # 1. Usuario ajeno intenta exportar -> 404 o 403
    _intruder, intruder_token = await create_user_and_token(async_client)
    intruder_headers = {"Authorization": f"Bearer {intruder_token}"}

    res_unauth = await async_client.get(
        f"/api/v1/rooms/{room_id}/export?format=json",
        headers=intruder_headers,
    )
    assert res_unauth.status_code in (403, 404)

    # 2. Formato inválido -> 400
    res_bad_fmt = await async_client.get(
        f"/api/v1/rooms/{room_id}/export?format=xml",
        headers=owner_headers,
    )
    assert res_bad_fmt.status_code == 400
