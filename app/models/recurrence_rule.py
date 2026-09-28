from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

from app.models.enums import RecurrenceFrequency

if TYPE_CHECKING:
    from app.models.task import Task


class RecurrenceRule(SQLModel, table=True):
    __tablename__ = "recurrencerule"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="task.id", unique=True, index=True)
    frequency: RecurrenceFrequency = Field(nullable=False)
    interval: int = Field(default=1, ge=1, le=365)
    next_due: datetime = Field(nullable=False)
    end_date: datetime | None = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    task: Optional["Task"] = Relationship(back_populates="recurrence_rule")
