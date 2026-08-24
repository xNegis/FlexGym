"""Add workout preferences, workout snapshot delay, and set_auto_started event type.

Revision ID: f27_auto_start
Revises: f22_1_global_photo_limit
Create Date: 2026-08-24 00:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "f27_auto_start"
down_revision: Union[str, None] = "f22_1_global_photo_limit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "workout_preferences",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("automatic_set_start_delay_seconds", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "automatic_set_start_delay_seconds IN (0, 5, 10, 15, 20, 30)",
            name="ck_workout_preferences_delay",
        ),
    )

    op.execute(
        "ALTER TABLE workout_sessions ADD COLUMN automatic_set_start_delay_seconds "
        "INTEGER NOT NULL DEFAULT 0 "
        "CHECK (automatic_set_start_delay_seconds IN (0, 5, 10, 15, 20, 30))"
    )

    op.execute("""
        CREATE TABLE workout_events_new (
            id INTEGER NOT NULL,
            workout_session_id INTEGER NOT NULL,
            sequence INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            workout_exercise_id INTEGER,
            workout_planned_set_id INTEGER,
            workout_exception_id INTEGER,
            occurred_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            CONSTRAINT uq_workout_events_session_sequence UNIQUE (workout_session_id, sequence),
            CONSTRAINT ck_workout_events_sequence CHECK (sequence >= 1),
            CONSTRAINT ck_workout_events_event_type CHECK (
                event_type IN (
                    'workout_started','exercise_started','set_started',
                    'set_completed','set_updated','set_marked_incomplete',
                    'exercise_completed','workout_cancelled','workout_completed',
                    'set_skipped','set_skip_reverted',
                    'exercise_skipped','exercise_skip_reverted',
                    'set_auto_started'
                )
            ),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id) ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id)
                REFERENCES workout_planned_sets (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_exception_id) REFERENCES workout_exceptions (id)
                ON DELETE SET NULL
        )
    """)
    op.execute("""
        INSERT INTO workout_events_new
        SELECT id, workout_session_id, sequence, event_type, workout_exercise_id,
               workout_planned_set_id, workout_exception_id, occurred_at
        FROM workout_events
    """)
    op.execute("DROP TABLE workout_events")
    op.execute("ALTER TABLE workout_events_new RENAME TO workout_events")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
        CREATE TABLE workout_events_old (
            id INTEGER NOT NULL,
            workout_session_id INTEGER NOT NULL,
            sequence INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            workout_exercise_id INTEGER,
            workout_planned_set_id INTEGER,
            workout_exception_id INTEGER,
            occurred_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            CONSTRAINT uq_workout_events_session_sequence UNIQUE (workout_session_id, sequence),
            CONSTRAINT ck_workout_events_sequence CHECK (sequence >= 1),
            CONSTRAINT ck_workout_events_event_type CHECK (
                event_type IN (
                    'workout_started','exercise_started','set_started',
                    'set_completed','set_updated','set_marked_incomplete',
                    'exercise_completed','workout_cancelled','workout_completed',
                    'set_skipped','set_skip_reverted',
                    'exercise_skipped','exercise_skip_reverted'
                )
            ),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id) ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id)
                REFERENCES workout_planned_sets (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_exception_id) REFERENCES workout_exceptions (id)
                ON DELETE SET NULL
        )
    """)
    op.execute("""
        INSERT INTO workout_events_old
        SELECT id, workout_session_id, sequence, event_type, workout_exercise_id,
               workout_planned_set_id, workout_exception_id, occurred_at
        FROM workout_events
        WHERE event_type != 'set_auto_started'
    """)
    op.execute("DROP TABLE workout_events")
    op.execute("ALTER TABLE workout_events_old RENAME TO workout_events")

    op.execute("ALTER TABLE workout_sessions DROP COLUMN automatic_set_start_delay_seconds")
    op.drop_table("workout_preferences")
