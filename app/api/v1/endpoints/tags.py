from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.exc import IntegrityError
from sqlmodel import select, delete
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models import TaskTag, Task
from app.models.tag import Tag
from app.schemas.tag import TagCreate, TagRead, TagAssignRequest, TagUpdate
from app.services.auth import get_current_user
from app.models.user import Usuario

router = APIRouter(prefix="/tags", tags=["Etiquetas"])

@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED, summary="Crear etiqueta", description="Crea una nueva etiqueta asociada al usuario autenticado. Devuelve un error 400 si ya existe una etiqueta con el mismo nombre.")
async def create_tag(
        payload: TagCreate,
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user)
):
    try:
        nueva_tag = Tag(
            nombre=payload.nombre,
            user_id=current_user.id
        )
        session.add(nueva_tag)
        await session.commit()
        await session.refresh(nueva_tag)
        return nueva_tag
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=400,
            detail="Duplicado: ya existe una etiqueta con ese nombre para este usuario."
        )

@router.get("", response_model=List[TagRead], summary="Obtener etiquetas", description="Devuelve todas las etiquetas asociadas al usuario autenticado.")
async def get_my_tags(
        session: AsyncSession = Depends(get_session),
        current_user: Usuario = Depends(get_current_user)
):
    statement = select(Tag).where(Tag.user_id == current_user.id).order_by(Tag.nombre)
    result = await session.exec(statement)
    return result.all()

@router.post(
    "/tasks/{task_id}/tags",
    status_code=200,
    summary="Asignar etiquetas",
    description="Asigna etiquetas a una tarea específica."
)
async def assign_tags_to_task(
    task_id: UUID,
    payload: TagAssignRequest,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user)
):
    task = await session.get(Task, task_id)
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Tarea no encontrada.")

    for tag_id in payload.tag_ids:
        tag = await session.get(Tag, tag_id)
        if not tag or tag.user_id != current_user.id:
            raise HTTPException(status_code=404, detail=f"Etiqueta ({tag_id}) no encontrada.")

        existing = await session.exec(
            select(TaskTag).where(
                TaskTag.task_id == task_id,
                TaskTag.tag_id == tag_id
            )
        )
        if not existing.first():
            session.add(TaskTag(task_id=task_id, tag_id=tag_id))

    await session.commit()
    return {"message": "Etiquetas asignadas correctamente"}

@router.delete(
    "/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar etiqueta",
    description="Elimina una etiqueta específica del usuario autenticado. "
                "También elimina en cascada todas las relaciones TaskTag asociadas."
)
async def delete_tag(
    tag_id: UUID = Path(..., description="ID de la etiqueta a eliminar"),
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user)
):
    tag = await session.get(Tag, tag_id)
    if not tag or tag.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Etiqueta no encontrada.")

    stmt_delete_tasktag = delete(TaskTag).where(TaskTag.tag_id == tag_id)
    await session.exec(stmt_delete_tasktag)

    await session.delete(tag)
    await session.commit()

@router.patch(
    "/{tag_id}",
    response_model=TagRead,
    status_code=status.HTTP_200_OK,
    summary="Actualizar etiqueta",
    description="Actualiza el nombre de una etiqueta específica del usuario autenticado."
)
async def update_tag(
    payload: TagUpdate,
    tag_id: UUID = Path(..., description="ID de la etiqueta a actualizar"),
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user)
):
    tag = await session.get(Tag, tag_id)
    if not tag or tag.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Etiqueta no encontrada.")

    tag.nombre = payload.nombre
    session.add(tag)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=400,
            detail="Duplicado: ya existe una etiqueta con ese nombre para este usuario."
        )

    await session.refresh(tag)
    return tag
