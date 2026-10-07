"""Add TaskAttachment model

Revision ID: a9b1c2d3e4f5
Revises: f2a71b3e8c40
Create Date: 2026-10-07 22:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9b1c2d3e4f5"
down_revision: str | None = "f2a71b3e8c40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema with SQLite batch alter support."""
    op.create_table(
        "task_attachment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("file_key", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("caption", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["usuario.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("task_attachment", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_task_attachment_task_id"), ["task_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_task_attachment_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_task_attachment_file_key"), ["file_key"], unique=True)
        batch_op.create_index(batch_op.f("ix_task_attachment_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_task_attachment_deleted_at"), ["deleted_at"], unique=False)


def downgrade() -> None:
    """Downgrade schema with SQLite batch alter support."""
    with op.batch_alter_table("task_attachment", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_task_attachment_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_task_attachment_created_at"))
        batch_op.drop_index(batch_op.f("ix_task_attachment_file_key"))
        batch_op.drop_index(batch_op.f("ix_task_attachment_user_id"))
        batch_op.drop_index(batch_op.f("ix_task_attachment_task_id"))
    op.drop_table("task_attachment")
