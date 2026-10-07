from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import CategoriaTarea
from app.models.room import Room
from app.models.subtask import Subtask
from app.models.tag import Tag
from app.models.task import Task
from app.models.task_tag import TaskTag
from app.models.user import Usuario
from app.services.search import SearchEngineService


@pytest.mark.asyncio

async def test_search_weights_and_relevance(session: AsyncSession, user_a: Usuario, room_owner_a: Room):
    """
    Verifica que el motor de búsqueda pondera correctamente:
    Título (3.0), Etiquetas (2.0), Descripción (1.0), Subtareas (1.0).
    """
    # Tarea 1: Coincidencia en título
    task_title = Task(
        titulo="Comprar leche desnatada",
        descripcion="Detalle genérico",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    # Tarea 2: Coincidencia en etiqueta
    task_tag = Task(
        titulo="Ir al supermercado",
        descripcion="Detalle genérico",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    # Tarea 3: Coincidencia en descripción
    task_desc = Task(
        titulo="Hacer recados matutinos",
        descripcion="No olvidar la leche en el super",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    # Tarea 4: Coincidencia en subtarea
    task_subtask = Task(
        titulo="Preparar desayuno",
        descripcion="Preparativos de la mañana",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )

    session.add_all([task_title, task_tag, task_desc, task_subtask])
    await session.commit()
    await session.refresh(task_title)
    await session.refresh(task_tag)
    await session.refresh(task_desc)
    await session.refresh(task_subtask)

    tag = Tag(nombre="leche", user_id=user_a.id)
    session.add(tag)
    await session.commit()
    await session.refresh(tag)

    tt = TaskTag(task_id=task_tag.id, tag_id=tag.id)
    sub = Subtask(task_id=task_subtask.id, titulo="Servir un vaso de leche", orden=1)
    session.add_all([tt, sub])
    await session.commit()

    # Buscar "leche"
    res = await SearchEngineService.search(
        query="leche",
        current_user=user_a,
        session=session,
        room_id=room_owner_a.id,
    )

    assert res.total_matches == 4
    # El orden debe reflejar los pesos: Título (score >= 3.0) > Etiqueta (2.0) > Descripción/Subtareas (1.0)
    scores = {item.task.id: item.relevance_score for item in res.results}
    assert scores[task_title.id] >= 3.0
    assert scores[task_tag.id] == 2.0
    assert scores[task_desc.id] == 1.0
    assert scores[task_subtask.id] == 1.0

    # Verificar que el primer resultado es el que tiene la palabra en el título
    assert res.results[0].task.id == task_title.id
    assert "titulo" in res.results[0].matched_fields


@pytest.mark.asyncio
async def test_search_sanitization_and_limits(session: AsyncSession, user_a: Usuario, room_owner_a: Room):
    """
    Verifica que consultas vacías, caracteres especiales de inyección o consultas > 100 caracteres se manejan limpiamente.
    """
    # Consulta vacía
    res_empty = await SearchEngineService.search(
        query="   ",
        current_user=user_a,
        session=session,
    )
    assert res_empty.total_matches == 0
    assert res_empty.results == []

    # Consulta con solo caracteres de control / especiales
    res_special = await SearchEngineService.search(
        query="\x00\x1f---???***",
        current_user=user_a,
        session=session,
    )
    assert res_special.total_matches == 0

    # Consulta muy larga (> 100 caracteres)
    long_query = "palabra " * 30  # > 200 caracteres
    res_long = await SearchEngineService.search(
        query=long_query,
        current_user=user_a,
        session=session,
    )
    assert isinstance(res_long.results, list)


@pytest.mark.asyncio
async def test_search_security_and_room_isolation(
    session: AsyncSession,
    user_a: Usuario,
    user_c: Usuario,
    room_owner_a: Room,
):
    """
    Verifica que tareas eliminadas (soft delete) o de hogares a los que el usuario no pertenece no aparecen en los resultados.
    """
    # Tarea activa de user_a
    task_active = Task(
        titulo="Documento Confidencial Alpha",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    # Tarea eliminada de user_a
    task_deleted = Task(
        titulo="Documento Confidencial Antiguo",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
        deleted_at=datetime.now(UTC),
    )
    session.add_all([task_active, task_deleted])
    await session.commit()

    # Búsqueda realizada por user_a: solo debe ver la activa
    res_a = await SearchEngineService.search(
        query="Confidencial",
        current_user=user_a,
        session=session,
    )
    assert res_a.total_matches == 1
    assert res_a.results[0].task.id == task_active.id

    # Búsqueda realizada por user_c (sin acceso al room de user_a)
    res_c = await SearchEngineService.search(
        query="Confidencial",
        current_user=user_c,
        session=session,
    )
    assert res_c.total_matches == 0

    # Intento de user_c de buscar especificando el room de user_a -> 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        await SearchEngineService.search(
            query="Confidencial",
            current_user=user_c,
            session=session,
            room_id=room_owner_a.id,
        )
    assert exc_info.value.status_code == 403
