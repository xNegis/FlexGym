"""add_exercises_table

Revision ID: 4a0245aea892
Revises: 3a2b1c4d5e6f
Create Date: 2026-08-11 12:04:32.164964

"""

# ruff: noqa: E501
import json
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "4a0245aea892"
down_revision: Union[str, Sequence[str], None] = "3a2b1c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exercises",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("primary_muscle", sa.String(), nullable=False),
        sa.Column("secondary_muscles", sa.JSON(), nullable=False),
        sa.Column("equipment", sa.String(), nullable=False),
        sa.Column("movement_pattern", sa.String(), nullable=False),
        sa.Column("execution_type", sa.String(), nullable=False),
        sa.Column("instructions", sa.String(length=500), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("slug"),
    )

    from app.exercise_data import EXERCISE_SEED_DATA

    connection = op.get_bind()
    for (
        slug,
        name,
        primary_muscle,
        secondary_muscles,
        equipment,
        movement_pattern,
        execution_type,
        instructions,
    ) in EXERCISE_SEED_DATA:
        connection.execute(
            sa.text(
                "INSERT INTO exercises "
                "(slug, name, primary_muscle, secondary_muscles, equipment, movement_pattern, execution_type, instructions) "
                "VALUES (:slug, :name, :primary_muscle, :secondary_muscles, :equipment, :movement_pattern, :execution_type, :instructions)"
            ),
            {
                "slug": slug,
                "name": name,
                "primary_muscle": primary_muscle,
                "secondary_muscles": json.dumps(secondary_muscles),
                "equipment": equipment,
                "movement_pattern": movement_pattern,
                "execution_type": execution_type,
                "instructions": instructions,
            },
        )


def downgrade() -> None:
    op.drop_table("exercises")
