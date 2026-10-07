"""Add deleted_at to Subtask

Revision ID: b8c41d9e2f50
Revises: 4a781b2c9e31
Create Date: 2026-10-02 02:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8c41d9e2f50"
down_revision: str | None = "4a781b2c9e31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema with SQLite batch alter support."""
    with op.batch_alter_table("subtask", schema=None) as batch_op:
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))
        batch_op.create_index(batch_op.f("ix_subtask_deleted_at"), ["deleted_at"], unique=False)


def downgrade() -> None:
    """Downgrade schema with SQLite batch alter support."""
    with op.batch_alter_table("subtask", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_subtask_deleted_at"))
        batch_op.drop_column("deleted_at")
