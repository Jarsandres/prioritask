"""add room parent fk and enforce task.room_id

Revision ID: 6926083f0630
Revises: fd7a1cfc7b9d
Create Date: 2025-06-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '6926083f0630'
down_revision: Union[str, None] = 'fd7a1cfc7b9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('room', sa.Column('parent_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(None, 'room', 'room', ['parent_id'], ['id'])
    op.add_column('task', sa.Column('room_id', sa.Uuid(), nullable=False))
    op.create_foreign_key(None, 'task', 'room', ['room_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('task_room_id_fkey', 'task', type_='foreignkey')
    op.drop_column('task', 'room_id')
    op.drop_constraint('room_parent_id_fkey', 'room', type_='foreignkey')
    op.drop_column('room', 'parent_id')
