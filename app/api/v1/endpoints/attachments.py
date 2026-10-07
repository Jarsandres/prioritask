from datetime import UTC, datetime
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import asc
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.v1.endpoints.tasks import _get_task_with_access
from app.core.config import settings
from app.db.session import get_session
from app.models.attachment import TaskAttachment
from app.models.task import Task, TaskHistory
from app.models.user import Usuario
from app.schemas.attachment import AttachmentRead
from app.services.auth import get_current_user
from app.services.events import event_broadcaster
from app.services.storage import (
    StoragePort,
    get_storage_adapter,
    sanitize_filename,
    validate_file_security,
)

router = APIRouter(prefix="/tasks/{task_id}/attachments", tags=["Adjuntos"])


@router.post(
    "",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Subir evidencia o archivo adjunto",
    description="Sube un archivo adjunto a la tarea, validando magic bytes, límites y cuota de la sala.",
)
async def upload_task_attachment(
    task_id: UUID,
    file: UploadFile = File(..., description="Archivo a adjuntar (JPEG, PNG, WebP o PDF)"),
    caption: str | None = Form(None, description="Descripción opcional del archivo adjunto"),
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
    storage: StoragePort = Depends(get_storage_adapter),
) -> AttachmentRead:
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    file_bytes = await file.read()
    filename = file.filename or "archivo"

    # 1. Validación de seguridad binaria Zero Trust
    detected_mime = validate_file_security(
        file_bytes=file_bytes,
        filename=filename,
        max_size_bytes=settings.MAX_FILE_SIZE_BYTES,
    )

    # 2. Validación de cuota agregada de la sala (máximo 250 MB por sala)
    if task.room_id:
        room_usage_query = (
            select(func.coalesce(func.sum(TaskAttachment.file_size_bytes), 0))
            .join(Task, Task.id == TaskAttachment.task_id)
            .where(
                Task.room_id == task.room_id,
                TaskAttachment.deleted_at.is_(None),
                Task.deleted_at.is_(None),
            )
        )
        usage_res = await session.exec(room_usage_query)
        current_room_usage = usage_res.one()
        if current_room_usage + len(file_bytes) > settings.MAX_ROOM_STORAGE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cuota de almacenamiento del hogar excedida (máximo 250 MB).",
            )

    # 3. Guardado desacoplado mediante el Storage Port
    safe_filename = sanitize_filename(filename)
    storage_key, size_bytes = storage.save_file(
        file_bytes=file_bytes,
        filename=safe_filename,
        content_type=detected_mime,
    )

    # 4. Persistencia en BD
    attachment = TaskAttachment(
        task_id=task.id,
        user_id=current_user.id,
        filename=safe_filename,
        file_key=storage_key,
        content_type=detected_mime,
        file_size_bytes=size_bytes,
        caption=caption,
    )
    session.add(attachment)

    # 5. Registro de auditoría inmutable
    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action="ATTACHMENT_ADDED",
        changes=f"Added attachment {safe_filename} ({size_bytes} bytes)",
    )
    session.add(history)
    await session.commit()
    await session.refresh(attachment)

    read_dto = AttachmentRead(
        id=attachment.id,
        task_id=attachment.task_id,
        user_id=attachment.user_id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        file_size_bytes=attachment.file_size_bytes,
        caption=attachment.caption,
        download_url=f"/api/v1/tasks/{task_id}/attachments/{attachment.id}/download",
        created_at=attachment.created_at,
    )

    # 6. Notificación SSE para miembros de la sala
    if task.room_id:
        await event_broadcaster.broadcast(
            task.room_id,
            "ATTACHMENT_ADDED",
            read_dto.model_dump(mode="json"),
        )

    return read_dto


@router.get(
    "",
    response_model=list[AttachmentRead],
    summary="Listar adjuntos de una tarea",
    description="Devuelve la lista de adjuntos activos de la tarea.",
)
async def list_task_attachments(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> list[AttachmentRead]:
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    result = await session.exec(
        select(TaskAttachment)
        .where(
            TaskAttachment.task_id == task.id,
            TaskAttachment.deleted_at.is_(None),
        )
        .order_by(asc(TaskAttachment.created_at))
    )
    attachments = result.all()

    return [
        AttachmentRead(
            id=att.id,
            task_id=att.task_id,
            user_id=att.user_id,
            filename=att.filename,
            content_type=att.content_type,
            file_size_bytes=att.file_size_bytes,
            caption=att.caption,
            download_url=f"/api/v1/tasks/{task_id}/attachments/{att.id}/download",
            created_at=att.created_at,
        )
        for att in attachments
    ]


@router.get(
    "/{attachment_id}/download",
    summary="Descargar adjunto de una tarea",
    description="Descarga el archivo físico de forma segura con cabeceras nosniff y content-disposition.",
)
async def download_task_attachment(
    task_id: UUID,
    attachment_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
    storage: StoragePort = Depends(get_storage_adapter),
):
    task, _ = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    result = await session.exec(
        select(TaskAttachment).where(
            TaskAttachment.id == attachment_id,
            TaskAttachment.task_id == task.id,
            TaskAttachment.deleted_at.is_(None),
        )
    )
    attachment = result.one_or_none()
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Adjunto no encontrado.",
        )

    try:
        file_path = storage.get_file_path(attachment.file_key)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Clave de almacenamiento no válida.",
        )

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El archivo físico solicitado no fue encontrado en el servidor.",
        )

    headers = {
        "Content-Disposition": f'attachment; filename="{attachment.filename}"',
        "X-Content-Type-Options": "nosniff",
    }

    return FileResponse(
        path=str(file_path),
        media_type=attachment.content_type,
        filename=attachment.filename,
        headers=headers,
    )


@router.delete(
    "/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar adjunto de una tarea (Soft Delete)",
    description="Elimina lógicamente el adjunto. Solo el autor del adjunto o el creador de la tarea tienen permiso.",
)
async def delete_task_attachment(
    task_id: UUID,
    attachment_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    task, is_owner = await _get_task_with_access(session, task_id, current_user, allow_collaborator=True)

    result = await session.exec(
        select(TaskAttachment).where(
            TaskAttachment.id == attachment_id,
            TaskAttachment.task_id == task.id,
            TaskAttachment.deleted_at.is_(None),
        )
    )
    attachment = result.one_or_none()
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Adjunto no encontrado.",
        )

    # Solo el autor del adjunto o el creador de la tarea pueden eliminarlo
    if attachment.user_id != current_user.id and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el autor del adjunto o el creador de la tarea pueden eliminarlo.",
        )

    # Soft delete y auditoría inmutable
    attachment.deleted_at = datetime.now(UTC)
    session.add(attachment)

    history = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action="ATTACHMENT_DELETED",
        changes=f"Deleted attachment {attachment.id} ({attachment.filename})",
    )
    session.add(history)
    await session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
