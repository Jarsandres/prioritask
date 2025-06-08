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
    # La columna 'parent_id' ya fue creada en una migración anterior, no es necesario agregarla nuevamente.
    # La clave foránea 'room_parent_id_fkey' también ya existe.
    pass


def downgrade() -> None:
    """Downgrade schema."""
    # No se requiere eliminar columnas o claves foráneas redundantes.
    pass
