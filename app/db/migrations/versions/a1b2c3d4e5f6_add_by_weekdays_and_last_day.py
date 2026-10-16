"""Add by_weekdays and is_last_day_of_month to RecurrenceRule

Revision ID: a1b2c3d4e5f6
Revises: f9b2c3d4e5a6
Create Date: 2026-10-16 14:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f9b2c3d4e5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: persist weekly day lists and last-day-of-month rules."""
    with op.batch_alter_table("recurrencerule", schema=None) as batch_op:
        batch_op.add_column(sa.Column("by_weekdays", sa.JSON(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "is_last_day_of_month",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    """Downgrade schema: remove by_weekdays and is_last_day_of_month."""
    with op.batch_alter_table("recurrencerule", schema=None) as batch_op:
        batch_op.drop_column("is_last_day_of_month")
        batch_op.drop_column("by_weekdays")
