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
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Drop unconditional constraint on task if it exists
    existing_unique_constraints = [c["name"] for c in insp.get_unique_constraints("task")]
    if "unique_user_task_title" in existing_unique_constraints:
        with op.batch_alter_table("task", schema=None) as batch_op:
            batch_op.drop_constraint("unique_user_task_title", type_="unique")

    # 2. Create partial index for active tasks (not deleted, not completed) if it doesn't already exist
    existing_indexes = [idx["name"] for idx in insp.get_indexes("task")]
    if "unique_user_active_task_title" not in existing_indexes:
        op.create_index(
            "unique_user_active_task_title",
            "task",
            ["user_id", "titulo"],
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL AND completed = false"),
            sqlite_where=sa.text("deleted_at IS NULL AND completed = 0"),
        )

    # 3. TaskAssignment hardening: UUID id and uq_task_assignment unique constraint
    ta_constraints = [c["name"] for c in insp.get_unique_constraints("taskassignment")]
    with op.batch_alter_table("taskassignment", schema=None) as batch_op:
        batch_op.alter_column(
            "id",
            existing_type=sa.Integer(),
            type_=sa.Uuid(),
            existing_nullable=False,
        )
        if "uq_task_assignment" not in ta_constraints:
            batch_op.create_unique_constraint(
                "uq_task_assignment",
                ["task_id", "user_id"],
            )

    # 4. Convert any integer IDs in taskassignment to valid UUID hex strings
    import uuid
    rows = bind.execute(sa.text("SELECT id FROM taskassignment")).fetchall()
    for row in rows:
        val = str(row[0])
        if len(val) < 32:
            new_id = uuid.uuid4().hex
            bind.execute(
                sa.text("UPDATE taskassignment SET id = :new_id WHERE id = :old_id"),
                {"new_id": new_id, "old_id": row[0]},
            )


def downgrade() -> None:
    """Downgrade schema reverting P0 hardening."""
    bind = op.get_bind()
    insp = sa.inspect(bind)

    ta_constraints = [c["name"] for c in insp.get_unique_constraints("taskassignment")]
    with op.batch_alter_table("taskassignment", schema=None) as batch_op:
        if "uq_task_assignment" in ta_constraints:
            batch_op.drop_constraint("uq_task_assignment", type_="unique")
        batch_op.alter_column(
            "id",
            existing_type=sa.Uuid(),
            type_=sa.Integer(),
            existing_nullable=False,
        )

    existing_indexes = [idx["name"] for idx in insp.get_indexes("task")]
    if "unique_user_active_task_title" in existing_indexes:
        op.drop_index(
            "unique_user_active_task_title",
            table_name="task",
            postgresql_where=sa.text("deleted_at IS NULL AND completed = false"),
            sqlite_where=sa.text("deleted_at IS NULL AND completed = 0"),
        )

    existing_unique_constraints = [c["name"] for c in insp.get_unique_constraints("task")]
    if "unique_user_task_title" not in existing_unique_constraints:
        with op.batch_alter_table("task", schema=None) as batch_op:
            batch_op.create_unique_constraint(
                "unique_user_task_title",
                ["user_id", "titulo"],
            )
