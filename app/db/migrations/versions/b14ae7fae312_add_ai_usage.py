"""add ai usage table

Revision ID: b14ae7fae312
Revises: a132b4b95a59
Create Date: 2025-06-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision: str = 'b14ae7fae312'
down_revision: Union[str, None] = 'a132b4b95a59'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'aiusage',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('action', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['usuario.id']),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('aiusage')
