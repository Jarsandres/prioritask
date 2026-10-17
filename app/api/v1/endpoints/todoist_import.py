"""Endpoint de importación de datos desde Todoist.

MVP de solo importación (Prioritask ← Todoist). No crea ninguna entidad fuera del
usuario autenticado: se ignoran los identificadores de usuario/sala que vengan en el
archivo y todo se ata a ``current_user`` y a salas propias.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.user import Usuario
from app.schemas.todoist_import import TodoistImportReport, TodoistSyncPayload
from app.services import todoist_import as import_service
from app.services.auth import get_current_user
from app.services.todoist_import import (
    ImportLimitExceededError,
    InvalidPayloadError,
    PayloadTooLargeError,
)

router = APIRouter(prefix="/import", tags=["Importación"])


@router.post(
    "/todoist",
    response_model=TodoistImportReport,
    status_code=status.HTTP_200_OK,
    summary="Importar datos desde Todoist",
    description=(
        "Importa el objeto JSON del modelo Sync de Todoist (claves ``projects``, ``items`` "
        "y ``labels``). Crea hogares, tareas, subtareas y etiquetas **pertenecientes al "
        "usuario autenticado**; ignora cualquier identificador de usuario o sala del archivo. "
        "Devuelve un informe con contadores, entidades omitidas/fallidas y avisos de las "
        "características no soportadas (secciones, deadlines, recordatorios, timezone fijo, "
        "filtros, recurrencia)."
    ),
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {"schema": TodoistSyncPayload.model_json_schema()}
            },
        }
    },
)
async def import_from_todoist(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
) -> TodoistImportReport:
    # Se lee el cuerpo en crudo para poder aplicar el límite anti JSON-bomb antes de parsear.
    raw_body = await request.body()
    try:
        return await import_service.run_todoist_import(
            raw_body, session=session, current_user=current_user
        )
    except PayloadTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=str(exc)
        ) from exc
    except (InvalidPayloadError, ImportLimitExceededError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
