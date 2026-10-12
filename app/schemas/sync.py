from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.task import TaskRead

SyncCommandType = Literal[
    "task_create",
    "task_update",
    "task_complete",
    "task_uncomplete",
    "task_schedule_reminder",
    "task_delete",
]

SyncErrorTag = Literal[
    "CONFLICT_STALE_TIMESTAMP",
    "ENTITY_NOT_FOUND",
    "VALIDATION_ERROR",
    "FORBIDDEN",
]


class SyncCommandIn(BaseModel):
    uuid: str = Field(max_length=64)
    temp_id: str | None = None
    type: SyncCommandType
    args: dict[str, Any] = Field(default_factory=dict)
    timestamp: int
    hlc_timestamp: str | None = None
    base_version: int | None = None
    field_hlc: dict[str, str] | None = None


class SyncCommandError(BaseModel):
    error_code: int
    error: str
    error_tag: SyncErrorTag
    retryable: bool = False
    server_record: TaskRead | None = None


class SyncBatchRequest(BaseModel):
    sync_token: str = "*"
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
