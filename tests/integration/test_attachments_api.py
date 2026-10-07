from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.attachment import TaskAttachment
from app.models.task import TaskHistory
from app.services.events import event_broadcaster
from tests.utils import create_task, create_user_and_token


@pytest.mark.asyncio
async def test_attachments_full_lifecycle(async_client: AsyncClient, session: AsyncSession):
    # 1. Crear usuario y hogar
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    room_res = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": f"Casa_{uuid4().hex[:6]}"},
        headers=headers,
    )
    room = room_res.json()
    room_id = room["id"]

    # Suscribir cola SSE a la sala
    import uuid
    queue = await event_broadcaster.subscribe(uuid.UUID(room_id))

    # 2. Crear tarea en la sala
    task = await create_task(
        async_client,
        token,
        {"titulo": "Tarea con Evidencias", "categoria": "MANTENIMIENTO", "room_id": room_id},
    )
    task_id = task["id"]

    # 3. GET /tasks/{task_id}/attachments vacío
    res_empty = await async_client.get(f"/api/v1/tasks/{task_id}/attachments", headers=headers)
    assert res_empty.status_code == 200
    assert res_empty.json() == []

    # 4. POST /tasks/{task_id}/attachments - Subir PNG válido
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 30
    files = {"file": ("evidencia_pintura.png", png_content, "image/png")}
    data = {"caption": "Pintura completada en salon"}

    res_upload = await async_client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files=files,
        data=data,
        headers=headers,
    )
    assert res_upload.status_code == 201
    att_data = res_upload.json()
    assert att_data["filename"] == "evidencia_pintura.png"
    assert att_data["content_type"] == "image/png"
    assert att_data["caption"] == "Pintura completada en salon"
    assert att_data["download_url"] == f"/api/v1/tasks/{task_id}/attachments/{att_data['id']}/download"
    att_id = att_data["id"]

    # Verificar recepción de evento SSE
    sse_msg = None
    try:
        while not queue.empty():
            msg = queue.get_nowait()
            if msg.get("event") == "ATTACHMENT_ADDED":
                sse_msg = msg
                break
    finally:
        await event_broadcaster.unsubscribe(uuid.UUID(room_id), queue)

    assert sse_msg is not None
    assert sse_msg["data"]["id"] == att_id

    # 5. GET /tasks/{task_id}/attachments devuelve 1 adjunto
    res_list = await async_client.get(f"/api/v1/tasks/{task_id}/attachments", headers=headers)
    assert res_list.status_code == 200
    items = res_list.json()
    assert len(items) == 1
    assert items[0]["id"] == att_id

    # 6. GET /tasks/{task_id}/attachments/{att_id}/download - Descarga segura
    res_down = await async_client.get(
        f"/api/v1/tasks/{task_id}/attachments/{att_id}/download",
        headers=headers,
    )
    assert res_down.status_code == 200
    assert res_down.content == png_content
    assert res_down.headers["x-content-type-options"] == "nosniff"
    assert "attachment;" in res_down.headers["content-disposition"]
    assert "evidencia_pintura.png" in res_down.headers["content-disposition"]

    # 7. Intento de eliminación por un usuario sin permisos
    _other_user, other_token = await create_user_and_token(async_client)
    other_headers = {"Authorization": f"Bearer {other_token}"}

    res_del_unauth = await async_client.delete(
        f"/api/v1/tasks/{task_id}/attachments/{att_id}",
        headers=other_headers,
    )
    assert res_del_unauth.status_code in (403, 404)

    # 8. DELETE /tasks/{task_id}/attachments/{att_id} por el autor (Soft delete)
    res_del = await async_client.delete(
        f"/api/v1/tasks/{task_id}/attachments/{att_id}",
        headers=headers,
    )
    assert res_del.status_code == 204

    # Verificar que ya no aparece en el listado activo
    res_list_after = await async_client.get(f"/api/v1/tasks/{task_id}/attachments", headers=headers)
    assert res_list_after.status_code == 200
    assert res_list_after.json() == []

    # Verificar registro en TaskHistory
    history_res = await session.exec(
        select(TaskHistory).where(
            TaskHistory.task_id == uuid.UUID(task_id),
            TaskHistory.action == "ATTACHMENT_DELETED",
        )
    )
    history_entry = history_res.first()
    assert history_entry is not None
    assert f"Deleted attachment {att_id}" in history_entry.changes


@pytest.mark.asyncio
async def test_attachments_security_validations(async_client: AsyncClient):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(
        async_client,
        token,
        {"titulo": "Tarea Validaciones", "categoria": "OTRO"},
    )
    task_id = task["id"]

    # 1. Prohibir SVG
    svg_data = b"<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg'><circle r='5'/></svg>"
    res_svg = await async_client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("malicious.svg", svg_data, "image/svg+xml")},
        headers=headers,
    )
    assert res_svg.status_code == 415

    # 2. Prohibir ejecutable binario PE
    exe_data = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 40
    res_exe = await async_client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("trojan.exe", exe_data, "application/octet-stream")},
        headers=headers,
    )
    assert res_exe.status_code == 415

    # 3. Prohibir archivo vacío
    res_empty = await async_client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("empty.png", b"", "image/png")},
        headers=headers,
    )
    assert res_empty.status_code == 400

    # 4. Descargar adjunto inexistente -> 404
    non_existent_id = uuid4()
    res_not_found = await async_client.get(
        f"/api/v1/tasks/{task_id}/attachments/{non_existent_id}/download",
        headers=headers,
    )
    assert res_not_found.status_code == 404


@pytest.mark.asyncio
async def test_attachment_owner_can_delete_others_attachment(
    async_client: AsyncClient,
    session: AsyncSession,
):
    # Dueño crea sala y tarea
    _owner, owner_token = await create_user_and_token(async_client)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    room_res = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": f"Sala_{uuid4().hex[:6]}"},
        headers=owner_headers,
    )
    room = room_res.json()
    room_id = room["id"]

    # Colaborador se une a la sala
    collab_user, collab_token = await create_user_and_token(async_client)
    collab_headers = {"Authorization": f"Bearer {collab_token}"}

    await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": collab_user["id"], "role": "MEMBER"},
        headers=owner_headers,
    )

    # Dueño crea la tarea
    task = await create_task(
        async_client,
        owner_token,
        {"titulo": "Tarea Compartida", "categoria": "COMPRA", "room_id": room_id},
    )
    task_id = task["id"]

    # Colaborador sube PDF
    pdf_content = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n" + b"\x00" * 30
    res_up = await async_client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("factura.pdf", pdf_content, "application/pdf")},
        headers=collab_headers,
    )
    assert res_up.status_code == 201
    att_id = res_up.json()["id"]

    # Dueño de la tarea elimina el adjunto del colaborador
    res_del_by_owner = await async_client.delete(
        f"/api/v1/tasks/{task_id}/attachments/{att_id}",
        headers=owner_headers,
    )
    assert res_del_by_owner.status_code == 204


@pytest.mark.asyncio
async def test_attachment_filename_path_traversal_sanitization(async_client: AsyncClient):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(
        async_client,
        token,
        {"titulo": "Tarea Path Traversal", "categoria": "OTRO"},
    )
    task_id = task["id"]

    # Enviar filename con ../../../
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 30
    res = await async_client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("../../../../etc/passwd.png", png_content, "image/png")},
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert ".." not in data["filename"]
    assert "/" not in data["filename"]
    assert "\\" not in data["filename"]
    assert data["filename"] == "passwd.png"


@pytest.mark.asyncio
async def test_attachment_room_quota_exceeded(
    async_client: AsyncClient,
    session: AsyncSession,
):
    _owner, owner_token = await create_user_and_token(async_client)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    room_res = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": f"SalaQuota_{uuid4().hex[:6]}"},
        headers=owner_headers,
    )
    room = room_res.json()
    room_id = room["id"]

    task = await create_task(
        async_client,
        owner_token,
        {"titulo": "Tarea Quota", "categoria": "OTRO", "room_id": room_id},
    )
    task_id = task["id"]

    # Simular que la sala ya consumió los 250 MB
    existing_att = TaskAttachment(
        task_id=UUID(task["id"]),
        user_id=UUID(_owner["id"]),
        filename="archivo_grande.pdf",
        file_key=f"{uuid4()}.pdf",
        content_type="application/pdf",
        file_size_bytes=250 * 1024 * 1024,
    )
    session.add(existing_att)
    await session.commit()

    # Intentar subir un nuevo archivo
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 30
    res = await async_client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("nuevo.png", png_content, "image/png")},
        headers=owner_headers,
    )
    assert res.status_code == 400
    assert "Cuota de almacenamiento" in res.json()["detail"]


@pytest.mark.asyncio
async def test_attachment_file_too_large(async_client: AsyncClient):
    _user, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await create_task(
        async_client,
        token,
        {"titulo": "Tarea Too Large", "categoria": "OTRO"},
    )
    task_id = task["id"]

    # Archivo que excede 10 MB (10 MB + 10 bytes)
    png_header = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    oversized_content = png_header + (b"\x00" * (10 * 1024 * 1024 + 10))

    res = await async_client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("too_large.png", oversized_content, "image/png")},
        headers=headers,
    )
    assert res.status_code == 413
    assert "excede el límite" in res.json()["detail"]

