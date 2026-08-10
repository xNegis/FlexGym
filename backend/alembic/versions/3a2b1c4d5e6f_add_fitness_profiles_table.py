"""add_fitness_profiles_table

Revision ID: 3a2b1c4d5e6f
Revises: e70e5601ecf6
Create Date: 2026-08-11 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3a2b1c4d5e6f"
down_revision: Union[str, Sequence[str], None] = "e70e5601ecf6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "fitness_profiles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("biological_sex", sa.String(), nullable=False),
        sa.Column("height_cm", sa.Numeric(precision=4, scale=1), nullable=False),
        sa.Column("weight_kg", sa.Numeric(precision=5, scale=1), nullable=False),
        sa.Column("body_fat_percentage", sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column("training_experience", sa.String(), nullable=False),
        sa.Column("primary_goal", sa.String(), nullable=False),
        sa.Column("training_days_per_week", sa.Integer(), nullable=False),
        sa.Column("preferred_workout_duration_minutes", sa.Integer(), nullable=False),
        sa.Column("training_environment", sa.String(), nullable=False),
        sa.Column("physical_limitations", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("fitness_profiles")
