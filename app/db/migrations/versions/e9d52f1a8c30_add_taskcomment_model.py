"""Add TaskComment model

Revision ID: e9d52f1a8c30
Revises: b8c41d9e2f50
Create Date: 2026-10-02 09:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e9d52f1a8c30"
down_revision: str | None = "b8c41d9e2f50"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema with SQLite batch alter support."""
    op.create_table(
        "taskcomment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("contenido", sa.String(length=2000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["usuario.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("taskcomment", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_taskcomment_task_id"), ["task_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_taskcomment_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_taskcomment_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_taskcomment_deleted_at"), ["deleted_at"], unique=False)


def downgrade() -> None:
    """Downgrade schema with SQLite batch alter support."""
    with op.batch_alter_table("taskcomment", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_taskcomment_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_taskcomment_created_at"))
        batch_op.drop_index(batch_op.f("ix_taskcomment_user_id"))
        batch_op.drop_index(batch_op.f("ix_taskcomment_task_id"))
    op.drop_table("taskcomment")
