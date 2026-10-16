import re
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.task import TaskRead

_HLC_REGEX = re.compile(r"^\d{13}:[0-9a-fA-F]{4}:[a-zA-Z0-9_\-]{1,36}$")
_MAX_HLC_FUTURE_DRIFT_MS = 300_000

_MUTABLE_TASK_FIELDS = {
    "titulo",
    "descripcion",
    "categoria",
    "estado",
    "peso",
    "due_date",
    "reminder_at",
    "completed",
    "is_recurring",
}

SyncCommandType = Literal[
    "task_create",
    "task_update",
    "task_complete",
    "task_uncomplete",
    "task_schedule_reminder",
    "task_delete",
    "subtask_create",
    "tag_create",
    "tag_attach",
]

SyncErrorTag = Literal[
    "CONFLICT_STALE_TIMESTAMP",
    "ENTITY_NOT_FOUND",
    "VALIDATION_ERROR",
    "FORBIDDEN",
    "INVALID_TEMP_ID",
    "TEMP_ID_COLLISION",
]


def validate_hlc_timestamp(hlc_str: str) -> str:
    if not isinstance(hlc_str, str) or not _HLC_REGEX.match(hlc_str):
        raise ValueError("Formato de HLC inválido")
    epoch_ms = int(hlc_str.split(":", 1)[0])
    max_allowed_ms = int(datetime.now(UTC).timestamp() * 1000) + _MAX_HLC_FUTURE_DRIFT_MS
    if epoch_ms > max_allowed_ms:
        raise ValueError("El timestamp HLC excede la deriva futura máxima permitida")
    return hlc_str


def filter_valid_field_hlc(raw_hlc: dict[str, str]) -> dict[str, str]:
    valid: dict[str, str] = {}
    for k, v in raw_hlc.items():
        if k not in _MUTABLE_TASK_FIELDS:
            continue
        try:
            valid[k] = validate_hlc_timestamp(v)
        except ValueError:
            continue
    return valid


class SyncCommandIn(BaseModel):
    uuid: str = Field(min_length=1, max_length=64)
    temp_id: str | None = Field(default=None, max_length=100)
    type: SyncCommandType
    args: dict[str, Any] = Field(default_factory=dict)
    timestamp: int
    hlc_timestamp: str | None = Field(default=None, max_length=64)
    base_version: int | None = Field(default=None, ge=0)
    field_hlc: dict[str, str] | None = None

    @field_validator("hlc_timestamp")
    @classmethod
    def _validate_hlc_timestamp(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_hlc_timestamp(value)

    @field_validator("field_hlc")
    @classmethod
    def _validate_field_hlc(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return None
        if len(value) > 16:
            raise ValueError("field_hlc no puede contener más de 16 claves")
        cleaned: dict[str, str] = {}
        for k, v in value.items():
            if k in _MUTABLE_TASK_FIELDS:
                cleaned[k] = validate_hlc_timestamp(v)
        return cleaned


class SyncCommandError(BaseModel):
    error_code: int
    error: str
    error_tag: SyncErrorTag
    retryable: bool = False
    server_record: TaskRead | None = None


class SyncBatchRequest(BaseModel):
    sync_token: str = Field(default="*", max_length=128)
    room_id: UUID | None = None
    commands: list[SyncCommandIn] = Field(default_factory=list, max_length=100)


class SyncBatchResponse(BaseModel):
    sync_token: str
    full_sync: bool
    sync_status: dict[str, Literal["ok"] | SyncCommandError] = Field(
        default_factory=dict
    )
    temp_id_mapping: dict[str, str] = Field(default_factory=dict)
    items: list[TaskRead] = Field(default_factory=list)

