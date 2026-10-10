"""P0 database hardening: drop unconditional task title constraint, add partial index, harden taskassignment

Revision ID: b7e2d9c4a1f8
Revises: d1e2f3a4b5c6
Create Date: 2026-10-09 11:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7e2d9c4a1f8"
down_revision: str | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: drop unconditional unique task title, add partial index, harden taskassignment."""
    # 1. Drop unconditional constraint on task
    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.drop_constraint("unique_user_task_title", type_="unique")

    # 2. Create partial index for active tasks (not deleted, not completed)
    op.create_index(
        "unique_user_active_task_title",
        "task",
        ["user_id", "titulo"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND completed = false"),
        sqlite_where=sa.text("deleted_at IS NULL AND completed = 0"),
    )

    # 3. TaskAssignment hardening: UUID id and uq_task_assignment unique constraint
    with op.batch_alter_table("taskassignment", schema=None) as batch_op:
        batch_op.alter_column(
            "id",
            existing_type=sa.Integer(),
            type_=sa.Uuid(),
            existing_nullable=False,
        )
        batch_op.create_unique_constraint(
            "uq_task_assignment",
            ["task_id", "user_id"],
        )


def downgrade() -> None:
    """Downgrade schema reverting P0 hardening."""
    with op.batch_alter_table("taskassignment", schema=None) as batch_op:
        batch_op.drop_constraint("uq_task_assignment", type_="unique")
        batch_op.alter_column(
            "id",
            existing_type=sa.Uuid(),
            type_=sa.Integer(),
            existing_nullable=False,
        )

    op.drop_index(
        "unique_user_active_task_title",
        table_name="task",
        postgresql_where=sa.text("deleted_at IS NULL AND completed = false"),
        sqlite_where=sa.text("deleted_at IS NULL AND completed = 0"),
    )

    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.create_unique_constraint(
            "unique_user_task_title",
            ["user_id", "titulo"],
        )
