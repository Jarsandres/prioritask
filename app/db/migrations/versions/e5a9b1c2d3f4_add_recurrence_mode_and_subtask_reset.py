"""Add mode, anchor_day_of_month and reset_subtasks to RecurrenceRule

Revision ID: e5a9b1c2d3f4
Revises: c8f3e1a2b4d5
Create Date: 2026-10-10 20:35:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5a9b1c2d3f4"
down_revision: str | None = "c8f3e1a2b4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: add mode, anchor_day_of_month, and reset_subtasks to recurrencerule."""
    recurrence_mode_enum = sa.Enum("FIXED", "FLOATING", name="recurrencemode")
    with op.batch_alter_table("recurrencerule", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "mode",
                recurrence_mode_enum,
                nullable=False,
                server_default="FIXED",
            )
        )
        batch_op.add_column(
            sa.Column("anchor_day_of_month", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "reset_subtasks",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )


def downgrade() -> None:
    """Downgrade schema: remove mode, anchor_day_of_month, and reset_subtasks from recurrencerule."""
    with op.batch_alter_table("recurrencerule", schema=None) as batch_op:
        batch_op.drop_column("reset_subtasks")
        batch_op.drop_column("anchor_day_of_month")
        batch_op.drop_column("mode")
