"""Tests de integración del endpoint de importación de Todoist."""

import asyncio
import json
import logging
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import (
    ProcessedSyncCommand,
    Room,
    Subtask,
    Tag,
    Task,
    TaskTag,
    Usuario,
)
from tests.utils import create_user_and_token

ENDPOINT = "/api/v1/import/todoist"


# Payload mínimo que EJERCITA las cinco tablas del grafo (sala, tarea, subtarea,
# etiqueta y vínculo tarea-etiqueta) para poder verificar la atomicidad completa.
_ATOMIC_PAYLOAD = {
    "projects": [{"id": "P1", "name": "Sala atomica"}],
    "labels": [{"id": "L1", "name": "integridad"}],
    "items": [
        {
            "id": "I1",
            "project_id": "P1",
            "content": "Tarea atomica",
            "labels": ["integridad"],
        },
        {
            "id": "I2",
            "project_id": "P1",
            "content": "Subtarea atomica",
            "parent_id": "I1",
        },
    ],
}


def _atomic_payload_bytes() -> bytes:
    return json.dumps(_ATOMIC_PAYLOAD, separators=(",", ":")).encode("utf-8")


@pytest_asyncio.fixture
async def file_import_db(tmp_path):
    """Engine SQLite **de fichero** con la misma configuración que producción.

    El defecto de atomicidad (``RELEASE SAVEPOINT`` ⇒ COMMIT implícito) no se reproduce
    con la BD de test en memoria compartida por ``StaticPool``: hace falta una conexión
    real a fichero, que es donde el gate lo detectó.
    """
    from app.db.session import get_engine_kwargs

    db_path = tmp_path / "todoist-import.db"
    url = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    engine = create_async_engine(url, **get_engine_kwargs(url))

    @event.listens_for(engine.sync_engine, "connect")
    def _apply_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("PRAGMA journal_mode = WAL;")
        cursor.execute("PRAGMA busy_timeout = 5000;")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        user = Usuario(
            id=uuid4(),
            email=f"import-{uuid4().hex[:8]}@example.com",
            hashed_password="not-used-in-service-tests",
            is_active=True,
        )
        session.add(user)
        await session.commit()

    try:
        yield factory, user
    finally:
        await engine.dispose()


async def _import_row_counts(factory, user_id: UUID) -> dict[str, int]:
    """Cuenta filas del grafo importado y de los marcadores de idempotencia."""
    async with factory() as session:
        rooms = (await session.exec(select(Room).where(Room.owner_id == user_id))).all()
        tasks = (await session.exec(select(Task).where(Task.user_id == user_id))).all()
        task_ids = [task.id for task in tasks]

        if task_ids:
            subtasks = (
                await session.exec(select(Subtask).where(Subtask.task_id.in_(task_ids)))
            ).all()
            links = (
                await session.exec(select(TaskTag).where(TaskTag.task_id.in_(task_ids)))
            ).all()
        else:
            subtasks, links = [], []

        tags = (await session.exec(select(Tag).where(Tag.user_id == user_id))).all()
        markers = (
            await session.exec(
                select(ProcessedSyncCommand).where(ProcessedSyncCommand.user_id == user_id)
            )
        ).all()

    return {
        "rooms": len(rooms),
        "tasks": len(tasks),
        "subtasks": len(subtasks),
        "tags": len(tags),
        "task_tags": len(links),
        "markers": len(markers),
    }


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_import_maps_projects_items_labels_and_subtasks(async_client, session):
    user, token = await create_user_and_token(async_client)
    uid = UUID(user["id"])

    payload = {
        "projects": [
            {"id": "P1", "name": "Trabajo"},
            {"id": "P2", "name": "Sub", "parent_id": "P1"},
        ],
        "labels": [{"id": "L1", "name": "urgente"}],
        "items": [
            {
                "id": "I1",
                "project_id": "P1",
                "content": "Preparar informe",
                "description": "Detallado",
                "priority": 4,
                "due": {"date": "2999-01-02"},
                "labels": ["urgente", "extra"],
                "child_order": 0,
            },
            {"id": "I2", "project_id": "P1", "content": "Subtarea hija", "parent_id": "I1", "child_order": 1},
            {"id": "I3", "project_id": "P2", "content": "Comprar cafe", "priority": 1},
        ],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["rooms_created"] == 2
    assert report["tasks_created"] == 2
    assert report["subtasks_created"] == 1
    assert report["tags_created"] == 2
    assert report["task_tags_created"] == 2
    assert report["skipped"] == 0
    assert report["failed"] == 0

    rooms = (await session.exec(select(Room).where(Room.owner_id == uid))).all()
    assert len(rooms) == 2
    rooms_by_name = {r.nombre: r for r in rooms}
    assert rooms_by_name["Sub"].parent_id == rooms_by_name["Trabajo"].id

    tasks = (await session.exec(select(Task).where(Task.user_id == uid))).all()
    assert len(tasks) == 2
    by_title = {t.titulo: t for t in tasks}
    main = by_title["Preparar informe"]
    # R1: Todoist 4 (muy urgente) → peso 5 (P1 Urgente) en la escala canónica 1..5.
    assert main.peso == 5.0
    assert main.descripcion == "Detallado"
    assert main.due_date is not None
    assert main.room_id == rooms_by_name["Trabajo"].id
    # R1: Todoist 1 (natural) → peso 2 (P4 Baja), el nivel más bajo representable.
    assert by_title["Comprar cafe"].peso == 2.0

    subtasks = (await session.exec(select(Subtask).where(Subtask.task_id == main.id))).all()
    assert len(subtasks) == 1
    assert subtasks[0].titulo == "Subtarea hija"
    assert subtasks[0].orden == 1

    tags = (await session.exec(select(Tag).where(Tag.user_id == uid))).all()
    assert {t.nombre for t in tags} == {"urgente", "extra"}
    links = (await session.exec(select(TaskTag).where(TaskTag.task_id == main.id))).all()
    assert len(links) == 2


@pytest.mark.asyncio
async def test_priority_maps_to_canonical_peso_scale(async_client, session):
    """R1: mapeo monotónico a la escala canónica 1..5 (P1=5), sin colisiones."""
    user, token = await create_user_and_token(async_client)
    uid = UUID(user["id"])

    payload = {
        "projects": [{"id": "P1", "name": "R"}],
        "items": [
            {"id": "A", "project_id": "P1", "content": "Tarea uno", "priority": 1},
            {"id": "B", "project_id": "P1", "content": "Tarea dos", "priority": 2},
            {"id": "C", "project_id": "P1", "content": "Tarea tres", "priority": 3},
            {"id": "D", "project_id": "P1", "content": "Tarea cuatro", "priority": 4},
        ],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text
    assert resp.json()["tasks_created"] == 4

    tasks = (await session.exec(select(Task).where(Task.user_id == uid))).all()
    pesos = {t.titulo: t.peso for t in tasks}
    assert pesos == {
        "Tarea uno": 2.0,
        "Tarea dos": 3.0,
        "Tarea tres": 4.0,
        "Tarea cuatro": 5.0,
    }


@pytest.mark.asyncio
async def test_urgent_todoist_task_lands_in_p1_filter(async_client, session):
    """R1 regresión: Todoist 4 debe ser visible en el filtro canónico "P1 (Urgente)" (peso>=5)."""
    user, token = await create_user_and_token(async_client)
    uid = UUID(user["id"])

    payload = {
        "projects": [{"id": "P1", "name": "R"}],
        "items": [{"id": "U", "project_id": "P1", "content": "Urgente de verdad", "priority": 4}],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text

    task = (await session.exec(select(Task).where(Task.user_id == uid))).one()
    assert task.peso >= 5  # rango del filtro P1 (Urgente): pesoMin=pesoMax=5


@pytest.mark.asyncio
async def test_duplicate_active_titles_are_suffixed_without_error(async_client, session):
    user, token = await create_user_and_token(async_client)
    uid = UUID(user["id"])

    pre = await async_client.post(
        "/api/v1/tasks", headers=_auth(token), json={"titulo": "Duplicada", "categoria": "OTRO"}
    )
    assert pre.status_code == 201

    payload = {
        "projects": [{"id": "P1", "name": "Sala"}],
        "items": [
            {"id": "A", "project_id": "P1", "content": "Duplicada"},
            {"id": "B", "project_id": "P1", "content": "Duplicada"},
        ],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["tasks_created"] == 2
    assert report["renamed"] == 2

    titles = {t.titulo for t in (await session.exec(select(Task).where(Task.user_id == uid))).all()}
    assert {"Duplicada", "Duplicada (2)", "Duplicada (3)"} <= titles


@pytest.mark.asyncio
async def test_deeply_nested_items_flatten_to_root_task(async_client, session):
    user, token = await create_user_and_token(async_client)

    payload = {
        "projects": [{"id": "P1", "name": "R"}],
        "items": [
            {"id": "I1", "project_id": "P1", "content": "Tarea raiz"},
            {"id": "I2", "project_id": "P1", "content": "Nivel dos", "parent_id": "I1"},
            {"id": "I3", "project_id": "P1", "content": "Nivel tres", "parent_id": "I2"},
        ],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["tasks_created"] == 1
    assert report["subtasks_created"] == 2

    uid = UUID(user["id"])
    root_task = (await session.exec(select(Task).where(Task.user_id == uid))).one()
    subtasks = (await session.exec(select(Subtask).where(Subtask.task_id == root_task.id))).all()
    assert {s.titulo for s in subtasks} == {"Nivel dos", "Nivel tres"}


@pytest.mark.asyncio
async def test_import_ignores_external_user_and_room_ids(
    async_client, session, user_a, user_b, user_b_headers, room_owner_a
):
    payload = {
        "projects": [{"id": "P1", "name": "Infiltrado", "owner_id": str(user_a.id)}],
        "items": [
            {
                "id": "A",
                "project_id": "P1",
                "content": "Tarea ajena",
                "user_id": str(user_a.id),
                "owner_id": str(user_a.id),
                "room_id": str(room_owner_a.id),
                "responsible_uid": str(user_a.id),
            },
            {"id": "B", "project_id": "GHOST", "content": "Proyecto fantasma"},
        ],
    }

    resp = await async_client.post(ENDPOINT, headers=user_b_headers, json=payload)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["tasks_created"] == 1
    assert report["skipped"] == 1

    room = (await session.exec(select(Room).where(Room.owner_id == user_b.id))).one()
    assert room.id != room_owner_a.id

    task = (await session.exec(select(Task).where(Task.user_id == user_b.id))).one()
    assert task.user_id == user_b.id
    assert task.room_id == room.id
    assert task.room_id != room_owner_a.id

    # El usuario A (dueño de las referencias inyectadas) no recibe ninguna tarea.
    a_tasks = (await session.exec(select(Task).where(Task.user_id == user_a.id))).all()
    assert a_tasks == []

    reasons = {detail["reason"] for detail in report["skipped_details"]}
    assert any("no está en el payload" in reason for reason in reasons)


@pytest.mark.asyncio
async def test_empty_payload_returns_zero_report(async_client):
    _user, token = await create_user_and_token(async_client)
    resp = await async_client.post(ENDPOINT, headers=_auth(token), json={})
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["rooms_created"] == 0
    assert report["tasks_created"] == 0
    assert report["subtasks_created"] == 0
    assert report["tags_created"] == 0
    assert report["skipped"] == 0
    assert report["failed"] == 0
    assert report["warnings"] == []


@pytest.mark.asyncio
async def test_report_flags_unsupported_features(async_client):
    _user, token = await create_user_and_token(async_client)
    payload = {
        "projects": [{"id": "P1", "name": "R"}],
        "items": [
            {
                "id": "A",
                "project_id": "P1",
                "content": "Tarea con extras",
                "deadline": {"date": "2030-01-01"},
                "due": {
                    "date": "2030-01-01T10:00:00Z",
                    "timezone": "Europe/Madrid",
                    "is_recurring": True,
                    "string": "every day",
                },
            }
        ],
        "sections": [{"id": "S1", "name": "Seccion"}],
        "notes": [{"id": "N1"}],
        "reminders": [{"id": "R1"}],
        "filters": [{"id": "F1"}],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["tasks_created"] == 1
    warnings = report["warnings"]
    assert any("Secciones" in w for w in warnings)
    assert any("Deadline" in w for w in warnings)
    assert any("Recordatorios" in w for w in warnings)
    assert any("Recurrencia" in w for w in warnings)
    assert any("Zona horaria" in w for w in warnings)
    assert any("Filtros" in w for w in warnings)
    assert any("Comentarios" in w for w in warnings)


@pytest.mark.asyncio
async def test_invalid_normalizations_are_skipped_or_reported(async_client, session, monkeypatch):
    user, token = await create_user_and_token(async_client)
    uid = UUID(user["id"])
    # La suite global activa ALLOW_PAST_DUE_DATES en otros módulos; aquí forzamos el
    # comportamiento por defecto (re-anclaje a now()) para verificar el clamping.
    monkeypatch.delenv("ALLOW_PAST_DUE_DATES", raising=False)

    payload = {
        "projects": [{"id": "P1", "name": "R"}],
        "items": [
            {"id": "S", "project_id": "P1", "content": "ab"},
            {"id": "E", "project_id": "P1", "content": "   "},
            {"id": "L", "project_id": "P1", "content": "L" * 150},
            {"id": "D", "project_id": "P1", "content": "Tarea pasada", "due": {"date": "2000-01-01"}},
        ],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["tasks_created"] == 2
    assert report["skipped"] == 2
    assert report["truncated"] >= 1
    assert report["clamped_due_dates"] == 1

    tasks = (await session.exec(select(Task).where(Task.user_id == uid))).all()
    truncated = next(t for t in tasks if t.titulo.startswith("L"))
    assert len(truncated.titulo) == 100
    past = next(t for t in tasks if t.titulo == "Tarea pasada")
    assert past.due_date is not None


@pytest.mark.asyncio
async def test_past_due_date_is_preserved_when_allowed(async_client, session, monkeypatch):
    """M6: con ALLOW_PAST_DUE_DATES activo se respeta la fecha pasada (estado "atrasada")."""
    user, token = await create_user_and_token(async_client)
    uid = UUID(user["id"])
    monkeypatch.setenv("ALLOW_PAST_DUE_DATES", "1")

    payload = {
        "projects": [{"id": "P1", "name": "R"}],
        "items": [{"id": "D", "project_id": "P1", "content": "Tarea atrasada", "due": {"date": "2000-01-01"}}],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["tasks_created"] == 1
    assert report["clamped_due_dates"] == 0

    task = (await session.exec(select(Task).where(Task.user_id == uid))).one()
    assert task.due_date is not None
    assert task.due_date.year == 2000


@pytest.mark.asyncio
async def test_duplicate_external_ids_are_reported(async_client, session):
    """M4: los IDs duplicados en el payload no colapsan en silencio."""
    user, token = await create_user_and_token(async_client)
    uid = UUID(user["id"])

    payload = {
        "projects": [{"id": "P1", "name": "R"}],
        "items": [
            {"id": "DUP", "project_id": "P1", "content": "Primera aparicion"},
            {"id": "DUP", "project_id": "P1", "content": "Segunda aparicion"},
        ],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["tasks_created"] == 1  # el índice conserva la última aparición
    assert report["skipped"] >= 1
    assert any("duplicado" in w.lower() for w in report["warnings"])
    assert any("duplicado" in d["reason"].lower() for d in report["skipped_details"])

    tasks = (await session.exec(select(Task).where(Task.user_id == uid))).all()
    assert [t.titulo for t in tasks] == ["Segunda aparicion"]


@pytest.mark.asyncio
async def test_second_identical_import_is_idempotent(async_client, session):
    """R2: un doble envío byte-idéntico no duplica el grafo y se reporta como ya importado."""
    user, token = await create_user_and_token(async_client)
    uid = UUID(user["id"])

    payload = {
        "projects": [{"id": "P1", "name": "Trabajo"}],
        "labels": [{"id": "L1", "name": "urgente"}],
        "items": [
            {"id": "I1", "project_id": "P1", "content": "Preparar informe", "priority": 4},
        ],
    }

    first = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["rooms_created"] == 1
    assert first.json()["tasks_created"] == 1
    assert first.json()["already_imported"] is False

    second = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert second.status_code == 200, second.text
    report = second.json()
    assert report["rooms_created"] == 0
    assert report["tasks_created"] == 0
    assert report["tags_created"] == 0
    assert report["already_imported"] is True

    rooms = (await session.exec(select(Room).where(Room.owner_id == uid))).all()
    assert [r.nombre for r in rooms] == ["Trabajo"]
    tasks = (await session.exec(select(Task).where(Task.user_id == uid))).all()
    assert len(tasks) == 1


@pytest.mark.asyncio
async def test_idempotency_key_header_deduplicates_reformatted_body(async_client):
    """R2: la cabecera Idempotency-Key deduplica aunque el cuerpo difiera en formato."""
    _user, token = await create_user_and_token(async_client)
    headers = {**_auth(token), "Idempotency-Key": "retry-abc-123"}

    payload = {"projects": [{"id": "P1", "name": "Sala clave"}]}

    first = await async_client.post(ENDPOINT, headers=headers, json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["rooms_created"] == 1

    # Cuerpo equivalente pero no byte-idéntico (espacios/orden): la clave explícita lo omite.
    second = await async_client.post(
        ENDPOINT,
        headers={**_auth(token), "Idempotency-Key": "retry-abc-123"},
        content=b'{ "projects" : [ { "id" : "P1", "name" : "Sala clave" } ] }',
    )
    assert second.status_code == 200, second.text
    assert second.json()["already_imported"] is True
    assert second.json()["rooms_created"] == 0


@pytest.mark.asyncio
async def test_different_payload_is_not_deduplicated(async_client, session):
    """R2: la idempotencia es por contenido/clave, no un bloqueo global."""
    _user, token = await create_user_and_token(async_client)

    first = await async_client.post(
        ENDPOINT, headers=_auth(token), json={"projects": [{"id": "P1", "name": "Uno"}]}
    )
    assert first.status_code == 200, first.text
    second = await async_client.post(
        ENDPOINT, headers=_auth(token), json={"projects": [{"id": "P2", "name": "Dos"}]}
    )
    assert second.status_code == 200, second.text
    assert second.json()["already_imported"] is False
    assert second.json()["rooms_created"] == 1


@pytest.mark.asyncio
async def test_idempotency_is_scoped_per_user(async_client):
    """R2: dos usuarios que importan el mismo archivo no colisionan entre sí."""
    _u1, t1 = await create_user_and_token(async_client)
    _u2, t2 = await create_user_and_token(async_client)

    payload = {"projects": [{"id": "P1", "name": "Compartido"}]}

    r1 = await async_client.post(ENDPOINT, headers=_auth(t1), json=payload)
    r2 = await async_client.post(ENDPOINT, headers=_auth(t2), json=payload)
    assert r1.json()["rooms_created"] == 1
    assert r1.json()["already_imported"] is False
    assert r2.json()["rooms_created"] == 1
    assert r2.json()["already_imported"] is False


@pytest.mark.asyncio
async def test_import_emits_single_aggregate_event_per_room(async_client, monkeypatch):
    _user, token = await create_user_and_token(async_client)

    import app.services.todoist_import as svc

    calls: list[tuple] = []

    async def fake_broadcast(room_id, event_type, data):
        calls.append((room_id, event_type, data))

    async def fake_invalidate(room_id):
        return None

    monkeypatch.setattr(svc.event_broadcaster, "broadcast", fake_broadcast)
    monkeypatch.setattr(svc, "invalidate_room_analytics_cache", fake_invalidate)

    payload = {
        "projects": [{"id": "P1", "name": "R1"}, {"id": "P2", "name": "R2"}],
        "items": [
            {"id": "A", "project_id": "P1", "content": "Tarea uno"},
            {"id": "B", "project_id": "P1", "content": "Tarea dos"},
            {"id": "C", "project_id": "P2", "content": "Tarea tres"},
        ],
    }

    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 200, resp.text

    # Un único evento agregado por sala (dos salas), no uno por tarea.
    assert len(calls) == 2
    assert all(call[1] == "TASKS_IMPORTED" for call in calls)
    assert all(call[2]["tasks_created"] == 3 for call in calls)


@pytest.mark.asyncio
async def test_payload_too_large_returns_413(async_client, monkeypatch):
    _user, token = await create_user_and_token(async_client)
    import app.services.todoist_import as svc

    monkeypatch.setattr(svc, "MAX_PAYLOAD_BYTES", 10)

    resp = await async_client.post(
        ENDPOINT,
        headers=_auth(token),
        json={"items": [{"id": "A", "content": "Tarea lo bastante larga"}]},
    )
    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_entity_count_limit_returns_422(async_client, monkeypatch):
    _user, token = await create_user_and_token(async_client)
    import app.services.todoist_import as svc

    monkeypatch.setattr(svc, "MAX_ENTITIES", 1)

    payload = {
        "projects": [{"id": "P1", "name": "R"}],
        "items": [
            {"id": "A", "project_id": "P1", "content": "Tarea uno"},
            {"id": "B", "project_id": "P1", "content": "Tarea dos"},
        ],
    }
    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_nesting_depth_limit_returns_422(async_client, monkeypatch):
    _user, token = await create_user_and_token(async_client)
    import app.services.todoist_import as svc

    monkeypatch.setattr(svc, "MAX_NESTING_DEPTH", 1)

    payload = {
        "projects": [
            {"id": "P1", "name": "Raiz"},
            {"id": "P2", "name": "Hijo", "parent_id": "P1"},
        ]
    }
    resp = await async_client.post(ENDPOINT, headers=_auth(token), json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_json_returns_422(async_client):
    _user, token = await create_user_and_token(async_client)
    resp = await async_client.post(
        ENDPOINT,
        headers={**_auth(token), "Content-Type": "application/json"},
        content=b"{not-json",
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_import_requires_authentication(async_client):
    resp = await async_client.post(ENDPOINT, json={})
    assert resp.status_code == 401


# ── R2: atomicidad real (BD de fichero, sin SAVEPOINTs intermedios) ─────────────


@pytest.mark.asyncio
async def test_import_failure_rolls_back_entire_batch(file_import_db, monkeypatch):
    """Un fallo en cualquier paso revierte el lote COMPLETO, incluido el marcador.

    Con BD de fichero el defecto original (``RELEASE SAVEPOINT`` ⇒ COMMIT implícito)
    persistía salas/tareas/etiquetas aunque la importación abortara después. Aquí el
    fallo se inyecta en ``_create_subtasks``, es decir, DESPUÉS de que rooms, tags,
    tasks y task_tags ya se hayan hecho *flush* en la transacción en curso.
    """
    factory, user = file_import_db
    import app.services.todoist_import as svc

    async def _boom(payload, state):  # firma idéntica a la real
        raise RuntimeError("fallo simulado al persistir subtareas")

    monkeypatch.setattr(svc, "_create_subtasks", _boom)

    async with factory() as session:
        with pytest.raises(svc.ImportPersistenceError):
            await svc.run_todoist_import(
                raw_body=_atomic_payload_bytes(),
                session=session,
                current_user=user,
            )

    counts = await _import_row_counts(factory, user.id)
    assert counts == {
        "rooms": 0,
        "tasks": 0,
        "subtasks": 0,
        "tags": 0,
        "task_tags": 0,
        "markers": 0,
    }, f"el lote dejó filas huérfanas: {counts}"


@pytest.mark.asyncio
async def test_persistence_failure_logs_type_without_user_content(
    file_import_db, monkeypatch, caplog
):
    """Un fallo de persistencia no debe volcar contenido del usuario en los logs.

    El mensaje de la excepción inyectada contiene un centinela sensible (simulando un
    título/descripción que SQLAlchemy arrastraría en ``[parameters: ...]``). El log debe
    registrar únicamente el TIPO de excepción y contexto no-PII.
    """
    factory, user = file_import_db
    import app.services.todoist_import as svc

    sentinel = "SECRETO_TITULO_USUARIO"

    async def _boom(payload, state):  # firma idéntica a la real
        raise RuntimeError(f"fallo al persistir subtareas: {sentinel}")

    monkeypatch.setattr(svc, "_create_subtasks", _boom)

    with caplog.at_level(logging.ERROR, logger=svc.__name__):
        async with factory() as session:
            with pytest.raises(svc.ImportPersistenceError):
                await svc.run_todoist_import(
                    raw_body=_atomic_payload_bytes(),
                    session=session,
                    current_user=user,
                )

    assert sentinel not in caplog.text, f"contenido del usuario filtrado en logs: {caplog.text}"
    assert "RuntimeError" in caplog.text, f"falta el tipo de excepción: {caplog.text}"


@pytest.mark.asyncio
async def test_retry_after_failure_imports_cleanly(file_import_db, monkeypatch):
    """Tras revertir el lote, un reintento sin el fallo importa limpio y sin sufijos."""
    factory, user = file_import_db
    import app.services.todoist_import as svc

    original = svc._create_subtasks

    async def _boom(payload, state):
        raise RuntimeError("fallo simulado al persistir subtareas")

    monkeypatch.setattr(svc, "_create_subtasks", _boom)

    async with factory() as session:
        with pytest.raises(svc.ImportPersistenceError):
            await svc.run_todoist_import(
                raw_body=_atomic_payload_bytes(),
                session=session,
                current_user=user,
            )

    # Se retira el parche: el reintento debe encontrar la base de datos virgen.
    monkeypatch.setattr(svc, "_create_subtasks", original)

    async with factory() as session:
        report = await svc.run_todoist_import(
            raw_body=_atomic_payload_bytes(),
            session=session,
            current_user=user,
        )

    assert report.already_imported is False
    assert report.rooms_created == 1
    assert report.tasks_created == 1
    assert report.subtasks_created == 1
    assert report.tags_created == 1
    assert report.task_tags_created == 1

    counts = await _import_row_counts(factory, user.id)
    assert counts == {
        "rooms": 1,
        "tasks": 1,
        "subtasks": 1,
        "tags": 1,
        "task_tags": 1,
        "markers": 1,
    }, f"el grafo reintentado quedó incompleto: {counts}"

    # El reintento no genera duplicados con sufijo " (2)" (no encontró filas previas).
    async with factory() as session:
        rooms = (await session.exec(select(Room).where(Room.owner_id == user.id))).all()
        tasks = (await session.exec(select(Task).where(Task.user_id == user.id))).all()

    assert [room.nombre for room in rooms] == ["Sala atomica"]
    assert [task.titulo for task in tasks] == ["Tarea atomica"]
    assert not any(name.endswith(" (2)") for name in (room.nombre for room in rooms))
    assert not any(title.endswith(" (2)") for title in (task.titulo for task in tasks))


@pytest.mark.asyncio
async def test_concurrent_duplicate_submit_returns_already_imported(file_import_db):
    """Dos envíos simultáneos con la misma clave: uno importa, el otro es idempotente.

    Nunca debe propagarse una excepción (500): el perdedor de la carrera revierte su
    lote y responde ``already_imported=True``.
    """
    factory, user = file_import_db
    import app.services.todoist_import as svc

    async def _submit():
        async with factory() as session:
            return await svc.run_todoist_import(
                raw_body=_atomic_payload_bytes(),
                session=session,
                current_user=user,
                idempotency_key="doble-envio-concurrente",
            )

    results = await asyncio.gather(_submit(), _submit(), return_exceptions=True)

    errors = [r for r in results if isinstance(r, BaseException)]
    assert not errors, f"un envío concurrente falló en vez de ser idempotente: {errors!r}"

    already = [r.already_imported for r in results]
    assert already.count(True) == 1, f"se esperaba exactamente un reintento idempotente: {already}"
    assert already.count(False) == 1

    counts = await _import_row_counts(factory, user.id)
    assert counts == {
        "rooms": 1,
        "tasks": 1,
        "subtasks": 1,
        "tags": 1,
        "task_tags": 1,
        "markers": 1,
    }, f"el doble envío duplicó el grafo: {counts}"
