from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.enums import CategoriaTarea, RecurrenceFrequency, RoomMemberRole
from app.models.recurrence_rule import RecurrenceRule
from app.models.task import Task
from app.schemas.room import RoomRead
from app.schemas.room_member import (
    RoomMemberBase,
    RoomMemberCreate,
    RoomMemberRead,
    RoomMemberUpdate,
)
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate


def test_room_member_schemas():
    # Base
    base = RoomMemberBase()
    assert base.role == RoomMemberRole.MEMBER

    # Create
    user_id = uuid4()
    member_create = RoomMemberCreate(user_id=user_id)
    assert member_create.user_id == user_id
    assert member_create.role == RoomMemberRole.MEMBER

    member_admin = RoomMemberCreate(user_id=user_id, role=RoomMemberRole.ADMIN)
    assert member_admin.role == RoomMemberRole.ADMIN

    # Update
    update = RoomMemberUpdate(role=RoomMemberRole.ADMIN)
    assert update.role == RoomMemberRole.ADMIN

    # Read
    room_id = uuid4()
    now = datetime.now(UTC)
    read = RoomMemberRead(
        user_id=user_id,
        room_id=room_id,
        role=RoomMemberRole.MEMBER,
        joined_at=now,
        user_email="test@example.com",
        user_nombre="Test User",
    )
    assert read.user_id == user_id
    assert read.room_id == room_id
    assert read.role == RoomMemberRole.MEMBER
    assert read.joined_at == now
    assert read.user_email == "test@example.com"
    assert read.user_nombre == "Test User"


def test_room_read_enrichment_backward_compatibility():
    # Default values for members, is_owner, and my_role
    room_read = RoomRead(
        id=uuid4(),
        nombre="Sala Principal",
        owner_id=uuid4(),
        owner="owner@example.com",
        parent_id=None,
    )
    assert room_read.members == []
    assert room_read.is_owner is False
    assert room_read.my_role is None

    # Custom enriched values
    member_read = RoomMemberRead(
        user_id=uuid4(),
        room_id=room_read.id,
        role=RoomMemberRole.ADMIN,
        joined_at=datetime.now(UTC),
    )
    enriched_room = RoomRead(
        id=room_read.id,
        nombre="Sala Principal",
        owner_id=room_read.owner_id,
        owner="owner@example.com",
        parent_id=None,
        members=[member_read],
        is_owner=True,
        my_role=RoomMemberRole.ADMIN,
    )
    assert len(enriched_room.members) == 1
    assert enriched_room.is_owner is True
    assert enriched_room.my_role == RoomMemberRole.ADMIN


def test_recurrence_frequency_enum():
    assert RecurrenceFrequency.DAILY == "DAILY"
    assert RecurrenceFrequency.WEEKLY == "WEEKLY"
    assert RecurrenceFrequency.MONTHLY == "MONTHLY"
    assert len(RecurrenceFrequency) == 3


def test_recurrence_rule_model():
    task_id = uuid4()
    next_due = datetime.now(UTC)
    rule = RecurrenceRule(
        task_id=task_id,
        frequency=RecurrenceFrequency.WEEKLY,
        interval=2,
        next_due=next_due,
    )
    assert rule.task_id == task_id
    assert rule.frequency == RecurrenceFrequency.WEEKLY
    assert rule.interval == 2
    assert rule.next_due == next_due
    assert rule.end_date is None
    assert rule.id is not None
    assert isinstance(rule.created_at, datetime)

    # Interval validation (ge=1, le=365) via model_validate
    with pytest.raises(ValidationError):
        RecurrenceRule.model_validate({
            "task_id": task_id,
            "frequency": RecurrenceFrequency.DAILY,
            "interval": 0,
            "next_due": next_due,
        })

    with pytest.raises(ValidationError):
        RecurrenceRule.model_validate({
            "task_id": task_id,
            "frequency": RecurrenceFrequency.DAILY,
            "interval": 366,
            "next_due": next_due,
        })


def test_task_is_recurring_schemas_and_model():
    # Model
    task = Task(
        titulo="Tarea recurrente",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=uuid4(),
        room_id=uuid4(),
        is_recurring=True,
    )
    assert task.is_recurring is True

    # Schemas
    task_create = TaskCreate(
        titulo="Tarea test",
        categoria=CategoriaTarea.OTRO,
    )
    assert task_create.is_recurring is False

    task_create_recurring = TaskCreate(
        titulo="Tarea test",
        categoria=CategoriaTarea.OTRO,
        is_recurring=True,
    )
    assert task_create_recurring.is_recurring is True

    task_read = TaskRead(
        id=uuid4(),
        titulo="Tarea leída",
        categoria=CategoriaTarea.OTRO,
        estado="TODO",
        peso=1.0,
        created_at=datetime.now(UTC),
        user_id=uuid4(),
    )
    assert task_read.is_recurring is False

    task_update = TaskUpdate(titulo="Nuevo título")
    assert task_update.is_recurring is False
