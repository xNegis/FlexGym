"""Add body weight measurements table.

Revision ID: f22_body_weight
Revises: f17_completion
Create Date: 2026-08-14 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f22_body_weight"
down_revision: Union[str, Sequence[str], None] = "f17_completion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "body_weight_measurements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("measurement_date", sa.Date(), nullable=False),
        sa.Column("weight_kg", sa.Numeric(precision=5, scale=1), nullable=False),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "measurement_date", name="uq_body_weight_measurement_user_date"
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("body_weight_measurements")
