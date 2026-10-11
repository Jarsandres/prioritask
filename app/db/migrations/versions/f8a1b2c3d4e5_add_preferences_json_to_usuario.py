"""Add preferences_json column to usuario

Revision ID: f8a1b2c3d4e5
Revises: e5a9b1c2d3f4
Create Date: 2026-10-11 13:15:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8a1b2c3d4e5"
down_revision: str | None = "e5a9b1c2d3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: add preferences_json to usuario."""
    with op.batch_alter_table("usuario", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("preferences_json", sa.String(), nullable=True)
        )


def downgrade() -> None:
    """Downgrade schema: remove preferences_json from usuario."""
    with op.batch_alter_table("usuario", schema=None) as batch_op:
        batch_op.drop_column("preferences_json")
