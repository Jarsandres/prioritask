"""P1 strategic composite indexes

Revision ID: c8f3e1a2b4d5
Revises: b7e2d9c4a1f8
Create Date: 2026-10-09 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8f3e1a2b4d5"
down_revision: str | None = "b7e2d9c4a1f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: add strategic composite indexes."""
    # 1. TaskComment: (task_id, deleted_at, created_at)
    with op.batch_alter_table("taskcomment", schema=None) as batch_op:
        batch_op.create_index(
            "ix_taskcomment_task_id_deleted_at_created_at",
            ["task_id", "deleted_at", "created_at"],
            unique=False,
        )

    # 2. Task: (is_recurring, completed, deleted_at, due_date)
    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.create_index(
            "ix_task_is_recurring_completed_deleted_at_due_date",
            ["is_recurring", "completed", "deleted_at", "due_date"],
            unique=False,
        )

    # 3. HouseholdReward: (room_id, is_active, deleted_at, cost_points)
    with op.batch_alter_table("householdreward", schema=None) as batch_op:
        batch_op.create_index(
            "ix_householdreward_room_active_deleted_cost",
            ["room_id", "is_active", "deleted_at", "cost_points"],
            unique=False,
        )

    # 4. TaskHistory: (user_id, timestamp)
    with op.batch_alter_table("taskhistory", schema=None) as batch_op:
        batch_op.create_index(
            "ix_taskhistory_user_id_timestamp",
            ["user_id", "timestamp"],
            unique=False,
        )


def downgrade() -> None:
    """Downgrade schema: drop strategic composite indexes."""
    with op.batch_alter_table("taskhistory", schema=None) as batch_op:
        batch_op.drop_index("ix_taskhistory_user_id_timestamp")

    with op.batch_alter_table("householdreward", schema=None) as batch_op:
        batch_op.drop_index("ix_householdreward_room_active_deleted_cost")

    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.drop_index("ix_task_is_recurring_completed_deleted_at_due_date")

    with op.batch_alter_table("taskcomment", schema=None) as batch_op:
        batch_op.drop_index("ix_taskcomment_task_id_deleted_at_created_at")
