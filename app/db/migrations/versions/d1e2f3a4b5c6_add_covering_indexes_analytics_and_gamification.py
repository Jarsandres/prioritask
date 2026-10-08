"""Add covering indexes for room analytics and gamification leaderboard

Revision ID: d1e2f3a4b5c6
Revises: e4c82d1b7a30
Create Date: 2026-10-08 20:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "e4c82d1b7a30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema with SQLite and PostgreSQL batch alter covering indexes."""
    # 1. Covering index for task room analytics
    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.create_index(
            "ix_task_room_analytics_covering",
            ["room_id", "deleted_at", "completed", "estado", "peso", "due_date", "user_id"],
            unique=False,
        )

    # 2. Covering index for gamification leaderboard
    with op.batch_alter_table("userroomgamification", schema=None) as batch_op:
        batch_op.create_index(
            "ix_gamification_leaderboard_covering",
            ["room_id", "lifetime_points", "points_balance", "user_id"],
            unique=False,
        )


def downgrade() -> None:
    """Downgrade schema dropping covering indexes."""
    with op.batch_alter_table("userroomgamification", schema=None) as batch_op:
        batch_op.drop_index("ix_gamification_leaderboard_covering")

    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.drop_index("ix_task_room_analytics_covering")
