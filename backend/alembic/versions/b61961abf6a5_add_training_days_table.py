"""add_training_days_table

Revision ID: b61961abf6a5
Revises: a7b2c3d4e5f6
Create Date: 2026-08-11 15:34:29.230112

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b61961abf6a5"
down_revision: Union[str, Sequence[str], None] = "a7b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "training_days",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["routine_id"], ["routines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("routine_id", "position", name="uq_training_day_routine_position"),
    )


def downgrade() -> None:
    op.drop_table("training_days")
