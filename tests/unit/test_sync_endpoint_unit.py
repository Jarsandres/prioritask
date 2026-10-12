from datetime import UTC, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.api.v1.endpoints.sync import (
    _extract_candidate_fields,
    _parse_datetime_utc,
    _resolve_room_for_user,
    _resolve_task_uuid,
    sync_batch,
)
from app.models import CategoriaTarea
from app.models.task import EstadoTarea, Task
from app.models.user import Usuario
from app.schemas.sync import SyncBatchRequest, SyncCommandError, SyncCommandIn


class TestParseDatetimeUtc:
    def test_returns_none_for_none_or_empty_string(self):
        assert _parse_datetime_utc(None) is None
        assert _parse_datetime_utc("") is None

    def test_parses_naive_and_aware_datetime_objects(self):
        naive_dt = datetime.fromisoformat("2026-06-15T12:30:00")
        res_naive = _parse_datetime_utc(naive_dt)
        assert res_naive is not None
        assert res_naive.tzinfo == UTC
        assert res_naive.hour == 12

        tz_plus_2 = timezone(timedelta(hours=2))
        aware_dt = datetime(2026, 6, 15, 14, 30, 0, tzinfo=tz_plus_2)
        res_aware = _parse_datetime_utc(aware_dt)
        assert res_aware is not None
        assert res_aware.tzinfo == UTC
        assert res_aware.hour == 12

    def test_parses_numeric_seconds_and_milliseconds(self):
        sec_ts = 1700000000
        ms_ts = 1700000000000.0
        dt_sec = _parse_datetime_utc(sec_ts)
        dt_ms = _parse_datetime_utc(ms_ts)
        assert dt_sec is not None
        assert dt_ms is not None
        assert dt_sec == dt_ms
        assert dt_sec.tzinfo == UTC

    def test_parses_iso_strings_naive_and_aware(self):
        res_naive = _parse_datetime_utc("2026-06-15T10:00:00")
        assert res_naive is not None
        assert res_naive.tzinfo == UTC
        assert res_naive.hour == 10

        res_aware = _parse_datetime_utc("2026-06-15T12:00:00+02:00")
        assert res_aware is not None
        assert res_aware.tzinfo == UTC
        assert res_aware.hour == 10

    def test_raises_value_error_for_invalid_type(self):
        with pytest.raises(ValueError, match="Formato de fecha inválido"):
            _parse_datetime_utc(["invalid"])


class TestExtractCandidateFields:
    def test_extracts_task_complete_and_uncomplete_and_schedule_reminder(self):
        cmd_complete = SyncCommandIn(
            uuid="cmd-1",
            type="task_complete",
            args={"id": str(uuid4())},
            timestamp=1700000000000,
        )
        assert _extract_candidate_fields(cmd_complete) == {
            "completed": True,
            "estado": EstadoTarea.DONE,
        }

        cmd_uncomplete = SyncCommandIn(
            uuid="cmd-2",
            type="task_uncomplete",
            args={"id": str(uuid4())},
            timestamp=1700000000000,
        )
        assert _extract_candidate_fields(cmd_uncomplete) == {
            "completed": False,
            "estado": EstadoTarea.TODO,
        }

        cmd_rem = SyncCommandIn(
            uuid="cmd-3",
            type="task_schedule_reminder",
            args={"id": str(uuid4()), "reminder_at": "2026-07-01T08:00:00Z"},
            timestamp=1700000000000,
        )
        rem_fields = _extract_candidate_fields(cmd_rem)
        assert rem_fields["reminder_at"] == datetime(2026, 7, 1, 8, 0, tzinfo=UTC)

    def test_extracts_all_mutable_fields_in_task_update(self):
        cmd_str_enums = SyncCommandIn(
            uuid="cmd-4",
            type="task_update",
            args={
                "id": str(uuid4()),
                "ignored_field": "ignored",
                "titulo": "Tarea válida",
                "descripcion": "Descripción válida",
                "categoria": "LIMPIEZA",
                "estado": "IN_PROGRESS",
                "peso": 5,
                "due_date": "2026-08-01T10:00:00Z",
                "reminder_at": None,
                "completed": 1,
                "is_recurring": 0,
            },
            timestamp=1700000000000,
        )
        fields = _extract_candidate_fields(cmd_str_enums)
        assert fields["titulo"] == "Tarea válida"
        assert fields["descripcion"] == "Descripción válida"
        assert fields["categoria"] == CategoriaTarea.LIMPIEZA
        assert fields["estado"] == EstadoTarea.IN_PROGRESS
        assert fields["peso"] == 5.0
        assert fields["due_date"] == datetime(2026, 8, 1, 10, 0, tzinfo=UTC)
        assert fields["reminder_at"] is None
        assert fields["completed"] is True
        assert fields["is_recurring"] is False
        assert "ignored_field" not in fields

        cmd_enum_instances = SyncCommandIn(
            uuid="cmd-5",
            type="task_update",
            args={
                "categoria": CategoriaTarea.COMPRA,
                "estado": EstadoTarea.DONE,
            },
            timestamp=1700000000000,
        )
        enum_fields = _extract_candidate_fields(cmd_enum_instances)
        assert enum_fields["categoria"] == CategoriaTarea.COMPRA
        assert enum_fields["estado"] == EstadoTarea.DONE

    def test_raises_value_error_on_invalid_fields(self):
        for bad_title in ("ab", "   ", 123, "a" * 101):
            cmd = SyncCommandIn(
                uuid="cmd-err-title",
                type="task_update",
                args={"titulo": bad_title},
                timestamp=1700000000000,
            )
            with pytest.raises(ValueError, match="El título debe tener entre 3 y 100"):
                _extract_candidate_fields(cmd)

        for bad_desc in ("x" * 501, 999):
            cmd = SyncCommandIn(
                uuid="cmd-err-desc",
                type="task_update",
                args={"descripcion": bad_desc},
                timestamp=1700000000000,
            )
            with pytest.raises(
                ValueError, match="La descripción no puede superar 500 caracteres"
            ):
                _extract_candidate_fields(cmd)

        for bad_weight in (
            0,
            -2.5,
            100,
            150.0,
            float("nan"),
            float("inf"),
            float("-inf"),
            True,
            False,
        ):
            cmd = SyncCommandIn(
                uuid="cmd-err-weight",
                type="task_update",
                args={"peso": bad_weight},
                timestamp=1700000000000,
            )
            with pytest.raises(
                ValueError, match="El peso debe ser mayor a 0 y menor a 100"
            ):
                _extract_candidate_fields(cmd)


class TestResolveTaskUuid:
    def test_resolves_from_id_or_task_id_or_temp_id_and_mapping(self):
        real_uuid = uuid4()
        mapping = {"temp_abc": str(real_uuid)}

        cmd_by_id = SyncCommandIn(
            uuid="c1",
            type="task_update",
            args={"id": str(real_uuid)},
            timestamp=1700000000000,
        )
        assert _resolve_task_uuid(cmd_by_id, {}) == real_uuid

        cmd_by_task_id = SyncCommandIn(
            uuid="c2",
            type="task_update",
            args={"task_id": str(real_uuid)},
            timestamp=1700000000000,
        )
        assert _resolve_task_uuid(cmd_by_task_id, {}) == real_uuid

        cmd_by_temp_id = SyncCommandIn(
            uuid="c3",
            temp_id="temp_abc",
            type="task_update",
            args={},
            timestamp=1700000000000,
        )
        assert _resolve_task_uuid(cmd_by_temp_id, mapping) == real_uuid

        cmd_by_mapped_arg = SyncCommandIn(
            uuid="c4",
            type="task_update",
            args={"id": "temp_abc"},
            timestamp=1700000000000,
        )
        assert _resolve_task_uuid(cmd_by_mapped_arg, mapping) == real_uuid

    def test_raises_value_error_when_identifier_missing(self):
        cmd_missing = SyncCommandIn(
            uuid="c5",
            type="task_update",
            args={},
            timestamp=1700000000000,
        )
        with pytest.raises(ValueError, match="Falta el identificador de la tarea"):
            _resolve_task_uuid(cmd_missing, {})


class TestResolveRoomForUser:
    @pytest.mark.asyncio
    async def test_resolve_room_all_branches(self):
        user = MagicMock()
        user.id = uuid4()
        room_id = uuid4()

        # 1. Room solicitado no existe -> 404 (línea 69)
        session = AsyncMock()
        session.get.return_value = None
        with pytest.raises(HTTPException) as exc_404:
            await _resolve_room_for_user(session, user, room_id)
        assert exc_404.value.status_code == 404

        # 2. Room solicitado pertenece a otro owner pero usuario ES miembro -> retorna room_id (línea 79)
        room_obj = MagicMock()
        room_obj.owner_id = uuid4()
        session.get.return_value = room_obj
        member_res = MagicMock()
        member_res.first.return_value = MagicMock()
        session.exec.return_value = member_res
        assert await _resolve_room_for_user(session, user, room_id) == room_id

        # 3. Room solicitado pertenece a otro owner y usuario NO es miembro -> 404 (línea 78)
        non_member_res = MagicMock()
        non_member_res.first.return_value = None
        session.exec.return_value = non_member_res
        with pytest.raises(HTTPException) as exc_non_member:
            await _resolve_room_for_user(session, user, room_id)
        assert exc_non_member.value.status_code == 404

        # 4. Sin room_id solicitado y usuario ya tiene un room propio -> retorna first_room (línea 86)
        existing_room_res = MagicMock()
        existing_room_res.first.return_value = (room_id,)
        session.exec.return_value = existing_room_res
        assert await _resolve_room_for_user(session, user, None) == room_id

        # 5. Sin room_id solicitado y sin room previo -> crea Default room (línea 92)
        empty_res = MagicMock()
        empty_res.first.return_value = None
        session.exec.return_value = empty_res
        session.add = MagicMock()
        created_id = await _resolve_room_for_user(session, user, None)
        assert created_id is not None

        # 6. Fallback ante IntegrityError concurrente (líneas 93-101)
        recovered_res = MagicMock()
        recovered_res.first.return_value = (room_id,)
        session.exec.side_effect = [empty_res, recovered_res]
        session.flush.side_effect = IntegrityError("stmt", "params", Exception("dup"))
        assert await _resolve_room_for_user(session, user, None) == room_id


class TestSyncBatchEndpointUnit:
    def _make_user(self) -> Usuario:
        return Usuario(
            id=uuid4(),
            email="unit@example.com",
            nombre="Unit Tester",
            hashed_password="hash",
            is_active=True,
        )

    def _make_task(self, user_id, room_id) -> Task:
        t = Task(
            id=uuid4(),
            titulo="Tarea Existente",
            descripcion="Desc",
            categoria=CategoriaTarea.OTRO,
            estado=EstadoTarea.TODO,
            peso=2.0,
            completed=False,
            is_recurring=False,
            version=2,
            field_hlc={"titulo": "1700000050000:0000:srv"},
            user_id=user_id,
            room_id=room_id,
            created_at=datetime(2026, 1, 1, 10, 0, tzinfo=UTC),
            updated_at=datetime(2026, 1, 2, 10, 0, tzinfo=UTC),
        )
        t.etiquetas = []
        t.subtasks = []
        t.colaboradores = []
        t.recurrence_rule = None
        return t

    @pytest.mark.asyncio
    async def test_sync_batch_idempotency_and_create_and_delete_flows(self):
        user = self._make_user()
        room_id = uuid4()
        session = AsyncMock()
        session.add = MagicMock()

        # Configurar refresh para inicializar relaciones en tareas recién creadas
        async def _fake_refresh(obj, attrs=None):
            if isinstance(obj, Task):
                obj.etiquetas = []
                obj.subtasks = []
                obj.colaboradores = []
                obj.recurrence_rule = None

        session.refresh.side_effect = _fake_refresh

        # Comandos:
        # 1. cmd_forbidden: ya procesado por otro usuario -> 403
        # 2. cmd_idem: ya procesado por el mismo usuario -> ok + mapeo temp_id
        # 3. cmd_create_ok: creación recurrente con hlc_timestamp y temp_id
        # 4. cmd_create_hlc_dict: creación con field_hlc explícito
        # 5. cmd_create_404: falla _resolve_room_for_user con 404
        # 6. cmd_create_integrity: falla flush con IntegrityError -> 422
        # 7. cmd_create_val_err: título inválido -> 422
        # 8. cmd_del_missing_id: sin id -> 422
        # 9. cmd_del_not_found: tarea no existe -> 404
        # 10. cmd_del_ok: borrado lógico exitoso -> ok

        other_cmd = MagicMock(user_id=uuid4(), task_id=uuid4())
        own_cmd_task_id = uuid4()
        own_cmd = MagicMock(user_id=user.id, task_id=own_cmd_task_id)

        session.get.side_effect = [
            other_cmd,  # cmd_forbidden
            own_cmd,    # cmd_idem
            None,       # cmd_create_ok
            None,       # cmd_create_hlc_dict
            None,       # cmd_create_404
            None,       # cmd_create_integrity
            None,       # cmd_create_val_err
            None,       # cmd_del_missing_id
            None,       # cmd_del_not_found
            None,       # cmd_del_ok
        ]

        # Respuestas de session.exec para los dos task_delete (not_found y ok)
        del_not_found_res = MagicMock()
        del_not_found_res.one_or_none.return_value = None

        task_to_delete = self._make_task(user.id, room_id)
        del_ok_res = MagicMock()
        del_ok_res.one_or_none.return_value = task_to_delete

        session.exec.side_effect = [del_not_found_res, del_ok_res]

        # Controlar flush para que falle con IntegrityError solo en cmd_create_integrity
        flush_calls = 0

        async def _controlled_flush():
            nonlocal flush_calls
            flush_calls += 1
            # cmd_create_ok hace 2 flushes (1, 2), cmd_create_hlc_dict hace 2 flushes (3, 4),
            # cmd_create_integrity falla en el flush 5
            if flush_calls == 5:
                raise IntegrityError("stmt", "params", Exception("duplicate"))

        session.flush.side_effect = _controlled_flush

        payload = SyncBatchRequest(
            sync_token="*",
            room_id=room_id,
            commands=[
                SyncCommandIn(
                    uuid="cmd-forbidden",
                    type="task_create",
                    args={"titulo": "Ajena"},
                    timestamp=1700000000000,
                ),
                SyncCommandIn(
                    uuid="cmd-idem",
                    temp_id="temp_idem_1",
                    type="task_create",
                    args={"id": "temp_idem_arg", "titulo": "Idempotente"},
                    timestamp=1700000000000,
                ),
                SyncCommandIn(
                    uuid="cmd-create-ok",
                    temp_id="temp_new_1",
                    type="task_create",
                    args={
                        "id": "temp_new_1_arg",
                        "titulo": "Nueva Recurrente",
                        "completed": True,
                        "recurrence_rule": {"frequency": "DAILY", "interval": 1},
                    },
                    timestamp=1700000001000,
                    hlc_timestamp="1700000001000:0000:node1",
                ),
                SyncCommandIn(
                    uuid="cmd-create-hlc-dict",
                    type="task_create",
                    args={"titulo": "Con Field HLC"},
                    timestamp=1700000001500,
                    field_hlc={"titulo": "1700000001500:0000:node1"},
                ),
                SyncCommandIn(
                    uuid="cmd-create-404",
                    type="task_create",
                    args={"titulo": "Room 404"},
                    timestamp=1700000002000,
                ),
                SyncCommandIn(
                    uuid="cmd-create-integrity",
                    type="task_create",
                    args={"titulo": "Duplicada"},
                    timestamp=1700000003000,
                ),
                SyncCommandIn(
                    uuid="cmd-create-val-err",
                    type="task_create",
                    args={"titulo": "ab"},
                    timestamp=1700000004000,
                ),
                SyncCommandIn(
                    uuid="cmd-del-missing-id",
                    type="task_delete",
                    args={},
                    timestamp=1700000005000,
                ),
                SyncCommandIn(
                    uuid="cmd-del-not-found",
                    type="task_delete",
                    args={"id": str(uuid4())},
                    timestamp=1700000006000,
                ),
                SyncCommandIn(
                    uuid="cmd-del-ok",
                    type="task_delete",
                    args={"id": str(task_to_delete.id)},
                    timestamp=1700000007000,
                ),
            ],
        )

        room_calls = 0

        async def _fake_resolve_room(_s, _u, _r):
            nonlocal room_calls
            room_calls += 1
            if room_calls == 3:
                raise HTTPException(status_code=404, detail="Hogar no encontrado")
            return room_id

        with (
            patch(
                "app.api.v1.endpoints.sync._resolve_room_for_user",
                side_effect=_fake_resolve_room,
            ),
            patch(
                "app.api.v1.endpoints.sync._fetch_tasks",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.v1.endpoints.sync.event_broadcaster.broadcast",
                new=AsyncMock(),
            ),
        ):
            res = await sync_batch(payload=payload, session=session, current_user=user)

        assert isinstance(res.sync_status["cmd-forbidden"], SyncCommandError)
        assert res.sync_status["cmd-forbidden"].error_code == 403
        assert res.sync_status["cmd-idem"] == "ok"
        assert res.temp_id_mapping["temp_idem_1"] == str(own_cmd_task_id)
        assert res.temp_id_mapping["temp_idem_arg"] == str(own_cmd_task_id)
        assert res.sync_status["cmd-create-ok"] == "ok"
        assert res.sync_status["cmd-create-hlc-dict"] == "ok"
        assert res.sync_status["cmd-create-404"].error_code == 404
        assert res.sync_status["cmd-create-integrity"].error_code == 422
        assert res.sync_status["cmd-create-val-err"].error_code == 422
        assert res.sync_status["cmd-del-missing-id"].error_code == 422
        assert res.sync_status["cmd-del-not-found"].error_code == 404
        assert res.sync_status["cmd-del-ok"] == "ok"

    @pytest.mark.asyncio
    async def test_sync_batch_mutations_conflicts_and_direct_updates(self):
        user = self._make_user()
        room_id = uuid4()
        session = AsyncMock()
        session.add = MagicMock()
        session.get.return_value = None

        async def _fake_refresh(obj, attrs=None):
            return None

        session.refresh.side_effect = _fake_refresh

        task_hlc_completed = self._make_task(user.id, room_id)
        task_hlc_estado = self._make_task(user.id, room_id)
        task_lww = self._make_task(user.id, room_id)
        task_direct_completed = self._make_task(user.id, room_id)
        task_direct_estado = self._make_task(user.id, room_id)

        access_calls = 0
        tasks_seq = [
            task_hlc_completed,
            task_hlc_estado,
            task_lww,
            task_direct_completed,
            task_direct_estado,
        ]

        async def _fake_get_task_with_access(_s, _tid, _u, allow_collaborator=True):
            nonlocal access_calls
            access_calls += 1
            if access_calls == 1:
                raise HTTPException(status_code=404, detail="No encontrada")
            if access_calls == 2:
                return task_hlc_completed, True
            return tasks_seq[access_calls - 3], True

        payload = SyncBatchRequest(
            sync_token="2026-01-01T00:00:00Z",
            room_id=room_id,
            commands=[
                # 1. Falta ID -> 422
                SyncCommandIn(
                    uuid="mut-no-id",
                    type="task_update",
                    args={"titulo": "Sin ID"},
                    timestamp=1700000000000,
                ),
                # 2. Tarea no encontrada -> 404
                SyncCommandIn(
                    uuid="mut-404",
                    type="task_update",
                    args={"id": str(uuid4()), "titulo": "No existe"},
                    timestamp=1700000000000,
                ),
                # 3. Error de validación en _extract_candidate_fields -> 422
                SyncCommandIn(
                    uuid="mut-val-err",
                    type="task_update",
                    args={"id": str(task_hlc_completed.id), "peso": -5},
                    timestamp=1700000000000,
                ),
                # 4. Conflicto con HLC actualizando completed=True + expected_updated_at válido antiguo
                SyncCommandIn(
                    uuid="mut-conflict-hlc-completed",
                    type="task_update",
                    args={
                        "id": str(task_hlc_completed.id),
                        "completed": True,
                        "expected_updated_at": "2025-01-01T00:00:00Z",
                    },
                    timestamp=1700000090000,
                    base_version=1,
                    field_hlc={"completed": "1700000090000:0000:cli"},
                ),
                # 5. Conflicto con HLC actualizando estado=DONE + expected_updated_at inválido
                SyncCommandIn(
                    uuid="mut-conflict-hlc-estado",
                    type="task_update",
                    args={
                        "id": str(task_hlc_estado.id),
                        "estado": "DONE",
                        "expected_updated_at": "not-a-date",
                    },
                    timestamp=1700000091000,
                    base_version=1,
                    hlc_timestamp="1700000091000:0000:cli",
                ),
                # 6. Conflicto sin HLC (LWW por timestamp)
                SyncCommandIn(
                    uuid="mut-conflict-lww",
                    type="task_update",
                    args={
                        "id": str(task_lww.id),
                        "titulo": "Ganador LWW",
                    },
                    timestamp=9999999999000,
                    base_version=1,
                ),
                # 7. Actualización directa (sin conflicto) con completed=True
                SyncCommandIn(
                    uuid="mut-direct-completed",
                    type="task_update",
                    args={
                        "id": str(task_direct_completed.id),
                        "completed": True,
                    },
                    timestamp=1700000095000,
                    base_version=2,
                    field_hlc={"completed": "1700000095000:0000:cli"},
                ),
                # 8. Actualización directa (sin conflicto) con estado=DONE
                SyncCommandIn(
                    uuid="mut-direct-estado",
                    type="task_update",
                    args={
                        "id": str(task_direct_estado.id),
                        "estado": "DONE",
                    },
                    timestamp=1700000096000,
                    base_version=2,
                    hlc_timestamp="1700000096000:0000:cli",
                ),
            ],
        )

        with (
            patch(
                "app.api.v1.endpoints.sync._get_task_with_access",
                side_effect=_fake_get_task_with_access,
            ),
            patch(
                "app.api.v1.endpoints.sync.award_task_points",
                new=AsyncMock(),
            ) as mock_award,
            patch(
                "app.api.v1.endpoints.sync._fetch_tasks",
                new=AsyncMock(return_value=[task_direct_completed]),
            ),
            patch(
                "app.api.v1.endpoints.sync.event_broadcaster.broadcast",
                new=AsyncMock(),
            ),
        ):
            res = await sync_batch(payload=payload, session=session, current_user=user)

        assert res.full_sync is False
        assert res.sync_status["mut-no-id"].error_code == 422
        assert res.sync_status["mut-404"].error_code == 404
        assert res.sync_status["mut-val-err"].error_code == 422

        c_comp = res.sync_status["mut-conflict-hlc-completed"]
        assert isinstance(c_comp, SyncCommandError)
        assert c_comp.error_code == 409
        assert c_comp.server_record.estado == EstadoTarea.DONE
        assert c_comp.server_record.completed is True

        c_est = res.sync_status["mut-conflict-hlc-estado"]
        assert isinstance(c_est, SyncCommandError)
        assert c_est.error_code == 409
        assert c_est.server_record.completed is True

        c_lww = res.sync_status["mut-conflict-lww"]
        assert isinstance(c_lww, SyncCommandError)
        assert c_lww.error_code == 409
        assert c_lww.server_record.titulo == "Ganador LWW"

        assert res.sync_status["mut-direct-completed"] == "ok"
        assert task_direct_completed.estado == EstadoTarea.DONE
        assert res.sync_status["mut-direct-estado"] == "ok"
        assert task_direct_estado.completed is True
        assert mock_award.await_count == 4

    @pytest.mark.asyncio
    async def test_sync_batch_task_create_rejects_nan_inf_weight_and_long_description(self):
        user = self._make_user()
        room_id = uuid4()
        session = AsyncMock()
        session.add = MagicMock()
        session.get.return_value = None

        payload = SyncBatchRequest(
            sync_token="*",
            room_id=room_id,
            commands=[
                SyncCommandIn(
                    uuid="create-nan-peso",
                    type="task_create",
                    args={"titulo": "Tarea NaN", "peso": float("nan")},
                    timestamp=1700000000000,
                ),
                SyncCommandIn(
                    uuid="create-inf-peso",
                    type="task_create",
                    args={"titulo": "Tarea Inf", "peso": float("inf")},
                    timestamp=1700000000000,
                ),
                SyncCommandIn(
                    uuid="create-bool-peso",
                    type="task_create",
                    args={"titulo": "Tarea Bool", "peso": True},
                    timestamp=1700000000000,
                ),
                SyncCommandIn(
                    uuid="create-long-desc",
                    type="task_create",
                    args={"titulo": "Tarea Desc Larga", "descripcion": "x" * 501},
                    timestamp=1700000000000,
                ),
            ],
        )

        with (
            patch(
                "app.api.v1.endpoints.sync._fetch_tasks",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.v1.endpoints.sync.event_broadcaster.broadcast",
                new=AsyncMock(),
            ),
        ):
            res = await sync_batch(payload=payload, session=session, current_user=user)

        for cmd_uuid in (
            "create-nan-peso",
            "create-inf-peso",
            "create-bool-peso",
            "create-long-desc",
        ):
            err = res.sync_status[cmd_uuid]
            assert isinstance(err, SyncCommandError)
            assert err.error_code == 422
            assert err.error_tag == "VALIDATION_ERROR"

    def test_hlc_poisoning_and_schema_bounds(self):
        from pydantic import ValidationError as PydanticValidationError

        from app.schemas.sync import filter_valid_field_hlc
        from app.schemas.user import UsuarioUpdate

        # Future HLC poisoning rejected in hlc_timestamp
        with pytest.raises(PydanticValidationError):
            SyncCommandIn(
                uuid="cmd-poison-1",
                type="task_create",
                args={"titulo": "Poison"},
                timestamp=1700000000000,
                hlc_timestamp="9999999999999:ffff:node",
            )

        # Future HLC poisoning rejected in field_hlc
        with pytest.raises(PydanticValidationError):
            SyncCommandIn(
                uuid="cmd-poison-2",
                type="task_update",
                args={"titulo": "Poison"},
                timestamp=1700000000000,
                field_hlc={"titulo": "9999999999999:ffff:node"},
            )

        # Malformed HLC rejected
        with pytest.raises(PydanticValidationError):
            SyncCommandIn(
                uuid="cmd-malformed-hlc",
                type="task_update",
                args={"titulo": "Bad HLC"},
                timestamp=1700000000000,
                hlc_timestamp="not-an-hlc",
            )

        # More than 16 keys in field_hlc rejected
        with pytest.raises(PydanticValidationError):
            SyncCommandIn(
                uuid="cmd-too-many-hlc",
                type="task_update",
                args={"titulo": "Too many"},
                timestamp=1700000000000,
                field_hlc={f"k{i}": "1700000001000:0000:node" for i in range(17)},
            )

        # Non-mutable keys stripped from SyncCommandIn.field_hlc and filter_valid_field_hlc
        valid_cmd = SyncCommandIn(
            uuid="cmd-strip-unknown",
            type="task_update",
            args={"titulo": "Clean"},
            timestamp=1700000000000,
            field_hlc={
                "titulo": "1700000001000:0000:node",
                "malicious_key": "1700000001000:0000:node",
            },
        )
        assert valid_cmd.field_hlc == {"titulo": "1700000001000:0000:node"}

        cleaned = filter_valid_field_hlc(
            {
                "titulo": "1700000001000:0000:node",
                "unknown": "1700000001000:0000:node",
                "peso": "9999999999999:ffff:node",
                "estado": "bad-format",
            }
        )
        assert cleaned == {"titulo": "1700000001000:0000:node"}

        # UsuarioUpdate preferences limits (>32 keys and >16KB)
        with pytest.raises(PydanticValidationError):
            UsuarioUpdate(preferences={f"k{i}": i for i in range(33)})

        with pytest.raises(PydanticValidationError):
            UsuarioUpdate(preferences={"big": "a" * 17000})

