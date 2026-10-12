"""Add task OCC/HLC columns and processedsynccommand table

Revision ID: f9b2c3d4e5a6
Revises: f8a1b2c3d4e5
Create Date: 2026-10-12 13:15:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f9b2c3d4e5a6"
down_revision: str | None = "f8a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: add reminder_at, version, field_hlc to task and create processedsynccommand."""
    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.add_column(sa.Column("reminder_at", sa.DateTime(), nullable=True))
        batch_op.add_column(
            sa.Column("version", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(
            sa.Column("field_hlc", sa.JSON(), nullable=False, server_default="{}")
        )
        batch_op.create_index(
            batch_op.f("ix_task_reminder_at"), ["reminder_at"], unique=False
        )

    op.create_table(
        "processedsynccommand",
        sa.Column("command_uuid", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=True),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("command_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ok"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["usuario.id"]),
        sa.PrimaryKeyConstraint("command_uuid"),
    )
    with op.batch_alter_table("processedsynccommand", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_processedsynccommand_created_at"),
            ["created_at"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_processedsynccommand_room_id"),
            ["room_id"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_processedsynccommand_task_id"),
            ["task_id"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_processedsynccommand_user_id"),
            ["user_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_processedsynccommand_user_created",
            ["user_id", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    """Downgrade schema: drop processedsynccommand and remove OCC/HLC columns from task."""
    with op.batch_alter_table("processedsynccommand", schema=None) as batch_op:
        batch_op.drop_index("ix_processedsynccommand_user_created")
        batch_op.drop_index(batch_op.f("ix_processedsynccommand_user_id"))
        batch_op.drop_index(batch_op.f("ix_processedsynccommand_task_id"))
        batch_op.drop_index(batch_op.f("ix_processedsynccommand_room_id"))
        batch_op.drop_index(batch_op.f("ix_processedsynccommand_created_at"))
    op.drop_table("processedsynccommand")

    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_task_reminder_at"))
        batch_op.drop_column("field_hlc")
        batch_op.drop_column("version")
        batch_op.drop_column("reminder_at")
