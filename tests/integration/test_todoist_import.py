"""Tests de integración del endpoint de importación de Todoist."""

from uuid import UUID

import pytest
from sqlmodel import select

from app.models import Room, Subtask, Tag, Task, TaskTag
from tests.utils import create_user_and_token

ENDPOINT = "/api/v1/import/todoist"


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
    assert main.peso == 4.0
    assert main.descripcion == "Detallado"
    assert main.due_date is not None
    assert main.room_id == rooms_by_name["Trabajo"].id
    assert by_title["Comprar cafe"].peso == 1.0

    subtasks = (await session.exec(select(Subtask).where(Subtask.task_id == main.id))).all()
    assert len(subtasks) == 1
    assert subtasks[0].titulo == "Subtarea hija"
    assert subtasks[0].orden == 1

    tags = (await session.exec(select(Tag).where(Tag.user_id == uid))).all()
    assert {t.nombre for t in tags} == {"urgente", "extra"}
    links = (await session.exec(select(TaskTag).where(TaskTag.task_id == main.id))).all()
    assert len(links) == 2


@pytest.mark.asyncio
async def test_priority_uses_numeric_identity_mapping(async_client, session):
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
        "Tarea uno": 1.0,
        "Tarea dos": 2.0,
        "Tarea tres": 3.0,
        "Tarea cuatro": 4.0,
    }


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
async def test_invalid_normalizations_are_skipped_or_reported(async_client, session):
    user, token = await create_user_and_token(async_client)
    uid = UUID(user["id"])

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
