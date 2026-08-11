"""add_active_routines_table

Revision ID: f11a1b2c3d4e
Revises: c31f5a8d2e04
Create Date: 2026-08-11 23:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f11a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "c31f5a8d2e04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("routines") as batch_op:
        batch_op.create_unique_constraint("uq_routine_id_user_id", ["id", "user_id"])

    op.create_table(
        "active_routines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=False),
        sa.Column(
            "activated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_active_routine_user",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["routine_id"],
            ["routines.id"],
            name="fk_active_routine_routine",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_active_routines"),
        sa.UniqueConstraint("user_id", name="uq_active_routine_user"),
        sa.UniqueConstraint("routine_id", name="uq_active_routine_routine"),
        sa.ForeignKeyConstraint(
            ["routine_id", "user_id"],
            ["routines.id", "routines.user_id"],
            name="fk_active_routine_routine_user",
        ),
    )


def downgrade() -> None:
    op.drop_table("active_routines")

    with op.batch_alter_table("routines") as batch_op:
        batch_op.drop_constraint("uq_routine_id_user_id", type_="unique")
