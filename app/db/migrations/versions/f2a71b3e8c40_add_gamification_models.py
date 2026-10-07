"""Add gamification models

Revision ID: f2a71b3e8c40
Revises: e9d52f1a8c30
Create Date: 2026-10-07 20:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a71b3e8c40"
down_revision: str | None = "e9d52f1a8c30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema with SQLite batch alter support."""
    # 1. userroomgamification
    op.create_table(
        "userroomgamification",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("points_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lifetime_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("longest_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_completed_date", sa.Date(), nullable=True),
        sa.Column("streak_freeze_available", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["usuario.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("room_id", "user_id", name="uq_user_room_gamification"),
    )
    with op.batch_alter_table("userroomgamification", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_userroomgamification_room_id"), ["room_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_userroomgamification_user_id"), ["user_id"], unique=False)

    # 2. pointtransaction
    op.create_table(
        "pointtransaction",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("action_type", sa.String(length=50), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["usuario.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "user_id", "action_type", name="uq_point_tx"),
    )
    with op.batch_alter_table("pointtransaction", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_pointtransaction_room_id"), ["room_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_pointtransaction_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_pointtransaction_task_id"), ["task_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_pointtransaction_action_type"), ["action_type"], unique=False)

    # 3. householdreward
    op.create_table(
        "householdreward",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("cost_points", sa.Integer(), nullable=False),
        sa.Column("icon_name", sa.String(length=50), nullable=True, server_default="gift"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("householdreward", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_householdreward_room_id"), ["room_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_householdreward_deleted_at"), ["deleted_at"], unique=False)

    # 4. rewardredemption
    op.create_table(
        "rewardredemption",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reward_id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="APPROVED"),
        sa.Column("points_spent", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["reward_id"], ["householdreward.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["usuario.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("rewardredemption", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_rewardredemption_reward_id"), ["reward_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_rewardredemption_room_id"), ["room_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_rewardredemption_user_id"), ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema with SQLite batch alter support."""
    with op.batch_alter_table("rewardredemption", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_rewardredemption_user_id"))
        batch_op.drop_index(batch_op.f("ix_rewardredemption_room_id"))
        batch_op.drop_index(batch_op.f("ix_rewardredemption_reward_id"))
    op.drop_table("rewardredemption")

    with op.batch_alter_table("householdreward", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_householdreward_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_householdreward_room_id"))
    op.drop_table("householdreward")

    with op.batch_alter_table("pointtransaction", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_pointtransaction_action_type"))
        batch_op.drop_index(batch_op.f("ix_pointtransaction_task_id"))
        batch_op.drop_index(batch_op.f("ix_pointtransaction_user_id"))
        batch_op.drop_index(batch_op.f("ix_pointtransaction_room_id"))
    op.drop_table("pointtransaction")

    with op.batch_alter_table("userroomgamification", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_userroomgamification_user_id"))
        batch_op.drop_index(batch_op.f("ix_userroomgamification_room_id"))
    op.drop_table("userroomgamification")
