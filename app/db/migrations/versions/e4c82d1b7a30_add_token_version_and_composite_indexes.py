"""Add token_version to usuario and composite indexes

Revision ID: e4c82d1b7a30
Revises: f2a71b3e8c40
Create Date: 2026-10-08 18:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4c82d1b7a30"
down_revision: str | None = "a9b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema with SQLite batch alter support."""
    # 1. Add token_version to usuario
    with op.batch_alter_table("usuario", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("token_version", sa.Integer(), nullable=False, server_default="1")
        )

    # 2. Add composite index on taskhistory (task_id, timestamp)
    with op.batch_alter_table("taskhistory", schema=None) as batch_op:
        batch_op.create_index(
            "ix_task_history_task_id_timestamp",
            ["task_id", "timestamp"],
            unique=False,
        )

    # 3. Add composite index on pointtransaction (room_id, user_id, created_at)
    with op.batch_alter_table("pointtransaction", schema=None) as batch_op:
        batch_op.create_index(
            "ix_point_tx_room_user_created",
            ["room_id", "user_id", "created_at"],
            unique=False,
        )

    # 4. Add composite index on task_attachment (task_id, deleted_at, created_at)
    with op.batch_alter_table("task_attachment", schema=None) as batch_op:
        batch_op.create_index(
            "ix_task_attachment_task_deleted_created",
            ["task_id", "deleted_at", "created_at"],
            unique=False,
        )

    # 5. Add composite index on subtask (task_id, deleted_at, orden)
    with op.batch_alter_table("subtask", schema=None) as batch_op:
        batch_op.create_index(
            "ix_subtask_task_deleted_orden",
            ["task_id", "deleted_at", "orden"],
            unique=False,
        )

    # 6. Add composite index on task (room_id, deleted_at, completed, created_at)
    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.create_index(
            "ix_task_room_deleted_completed_created",
            ["room_id", "deleted_at", "completed", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    """Downgrade schema with SQLite batch alter support."""
    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.drop_index("ix_task_room_deleted_completed_created")

    with op.batch_alter_table("subtask", schema=None) as batch_op:
        batch_op.drop_index("ix_subtask_task_deleted_orden")

    with op.batch_alter_table("task_attachment", schema=None) as batch_op:
        batch_op.drop_index("ix_task_attachment_task_deleted_created")

    with op.batch_alter_table("pointtransaction", schema=None) as batch_op:
        batch_op.drop_index("ix_point_tx_room_user_created")

    with op.batch_alter_table("taskhistory", schema=None) as batch_op:
        batch_op.drop_index("ix_task_history_task_id_timestamp")

    with op.batch_alter_table("usuario", schema=None) as batch_op:
        batch_op.drop_column("token_version")
