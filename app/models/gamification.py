from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint

if TYPE_CHECKING:
    from .room import Room
    from .task import Task
    from .user import Usuario


class UserRoomGamification(SQLModel, table=True):
    __tablename__ = "userroomgamification"
    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_user_room_gamification"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    room_id: UUID = Field(foreign_key="room.id", index=True, nullable=False)
    user_id: UUID = Field(foreign_key="usuario.id", index=True, nullable=False)
    points_balance: int = Field(default=0, nullable=False)
    lifetime_points: int = Field(default=0, nullable=False)
    current_streak: int = Field(default=0, nullable=False)
    longest_streak: int = Field(default=0, nullable=False)
    last_completed_date: date | None = Field(default=None, nullable=True)
    streak_freeze_available: int = Field(default=1, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)

    room: Optional["Room"] = Relationship()
    user: Optional["Usuario"] = Relationship()


class PointTransaction(SQLModel, table=True):
    __tablename__ = "pointtransaction"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", "action_type", name="uq_point_tx"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    room_id: UUID = Field(foreign_key="room.id", index=True, nullable=False)
    user_id: UUID = Field(foreign_key="usuario.id", index=True, nullable=False)
    task_id: UUID | None = Field(default=None, foreign_key="task.id", index=True, nullable=True)
    action_type: str = Field(index=True, nullable=False)
    points: int = Field(nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)

    room: Optional["Room"] = Relationship()
    user: Optional["Usuario"] = Relationship()
    task: Optional["Task"] = Relationship()


class HouseholdReward(SQLModel, table=True):
    __tablename__ = "householdreward"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    room_id: UUID = Field(foreign_key="room.id", index=True, nullable=False)
    title: str = Field(max_length=150, nullable=False)
    description: str | None = Field(default=None, max_length=500, nullable=True)
    cost_points: int = Field(ge=1, nullable=False)
    icon_name: str | None = Field(default="gift", max_length=50, nullable=True)
    is_active: bool = Field(default=True, nullable=False)
    deleted_at: datetime | None = Field(default=None, index=True, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)

    room: Optional["Room"] = Relationship()


class RewardRedemption(SQLModel, table=True):
    __tablename__ = "rewardredemption"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    reward_id: UUID = Field(foreign_key="householdreward.id", index=True, nullable=False)
    room_id: UUID = Field(foreign_key="room.id", index=True, nullable=False)
    user_id: UUID = Field(foreign_key="usuario.id", index=True, nullable=False)
    status: str = Field(default="APPROVED", nullable=False)
    points_spent: int = Field(ge=0, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)

    reward: HouseholdReward | None = Relationship()
    room: Optional["Room"] = Relationship()
    user: Optional["Usuario"] = Relationship()

