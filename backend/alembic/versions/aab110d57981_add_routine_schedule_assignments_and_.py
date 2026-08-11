"""add_routine_schedule_assignments_and_remove_training_day_position

Revision ID: aab110d57981
Revises: 273789964714
Create Date: 2026-08-11 21:15:55.440827

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aab110d57981"
down_revision: Union[str, Sequence[str], None] = "273789964714"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "routine_schedule_assignments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=False),
        sa.Column("training_day_id", sa.Integer(), nullable=False),
        sa.Column("week_position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["routine_id"], ["routines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["training_day_id"], ["training_days.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "routine_id", "week_position", name="uq_schedule_assignment_routine_pos"
        ),
        sa.UniqueConstraint("training_day_id"),
    )

    op.execute(
        "INSERT INTO routine_schedule_assignments (routine_id, training_day_id, week_position) "
        "SELECT routine_id, id, position FROM training_days"
    )

    with op.batch_alter_table("training_days") as batch_op:
        batch_op.drop_constraint("uq_training_day_routine_position", type_="unique")
        batch_op.drop_column("position")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("training_days") as batch_op:
        batch_op.add_column(
            sa.Column("position", sa.Integer(), nullable=True),
        )

    op.execute(
        "UPDATE training_days SET position = ("
        "  SELECT COALESCE(r.week_position, 1) FROM routine_schedule_assignments r "
        "  WHERE r.training_day_id = training_days.id"
        ")"
    )

    with op.batch_alter_table("training_days") as batch_op:
        batch_op.alter_column("position", existing_type=sa.Integer(), nullable=False)
        batch_op.create_unique_constraint(
            "uq_training_day_routine_position", ["routine_id", "position"]
        )

    op.drop_table("routine_schedule_assignments")
