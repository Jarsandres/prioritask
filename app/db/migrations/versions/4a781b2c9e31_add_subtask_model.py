"""Add Subtask model

Revision ID: 4a781b2c9e31
Revises: 3f641387ca16
Create Date: 2026-10-02 01:20:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4a781b2c9e31"
down_revision: str | None = "3f641387ca16"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "subtask",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("titulo", sa.String(length=255), nullable=False),
        sa.Column("completada", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("orden", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("subtask", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_subtask_task_id"), ["task_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_subtask_completada"), ["completada"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("subtask", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_subtask_completada"))
        batch_op.drop_index(batch_op.f("ix_subtask_task_id"))
    op.drop_table("subtask")
