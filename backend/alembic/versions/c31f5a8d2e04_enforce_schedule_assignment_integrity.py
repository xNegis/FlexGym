"""enforce_schedule_assignment_integrity

Revision ID: c31f5a8d2e04
Revises: aab110d57981
Create Date: 2026-08-11 23:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c31f5a8d2e04"
down_revision: Union[str, Sequence[str], None] = "aab110d57981"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add database-level position and same-routine invariants."""
    with op.batch_alter_table("training_days") as batch_op:
        batch_op.create_unique_constraint("uq_training_day_id_routine", ["id", "routine_id"])

    with op.batch_alter_table("routine_schedule_assignments") as batch_op:
        batch_op.create_check_constraint(
            "ck_schedule_assignment_week_position",
            "week_position >= 1 AND week_position <= 7",
        )
        batch_op.create_foreign_key(
            "fk_schedule_assignment_day_routine",
            "training_days",
            ["training_day_id", "routine_id"],
            ["id", "routine_id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    """Remove the additional database-level integrity constraints."""
    with op.batch_alter_table("routine_schedule_assignments") as batch_op:
        batch_op.drop_constraint("fk_schedule_assignment_day_routine", type_="foreignkey")
        batch_op.drop_constraint("ck_schedule_assignment_week_position", type_="check")

    with op.batch_alter_table("training_days") as batch_op:
        batch_op.drop_constraint("uq_training_day_id_routine", type_="unique")
