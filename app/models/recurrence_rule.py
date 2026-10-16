"""RecurrenceRule model for recurring tasks."""
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import Field, Relationship, SQLModel

from app.models.enums import RecurrenceFrequency, RecurrenceMode

if TYPE_CHECKING:
    from app.models.task import Task


class RecurrenceRule(SQLModel, table=True):
    __tablename__ = "recurrencerule"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="task.id", unique=True, index=True)
    frequency: RecurrenceFrequency = Field(nullable=False)
    interval: int = Field(default=1, ge=1, le=365)
    mode: RecurrenceMode = Field(default=RecurrenceMode.FIXED, nullable=False)
    anchor_day_of_month: int | None = Field(default=None, ge=1, le=31, nullable=True)
    by_weekdays: list[int] | None = Field(
        default=None,
        sa_column=sa.Column(sa.JSON, nullable=True),
        description="Días de la semana (0=Dom..6=Sáb) para reglas WEEKLY.",
    )
    is_last_day_of_month: bool = Field(
        default=False,
        sa_column=sa.Column(sa.Boolean, nullable=False, server_default=sa.false()),
        description="Fuerza el último día del mes en reglas MONTHLY.",
    )
    reset_subtasks: bool = Field(default=True, nullable=False)
    next_due: datetime = Field(nullable=False)
    end_date: datetime | None = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    task: Optional["Task"] = Relationship(back_populates="recurrence_rule")

