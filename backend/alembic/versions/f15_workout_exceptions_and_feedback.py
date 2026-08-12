"""f15_workout_exceptions_and_feedback

Revision ID: f15_exceptions
Revises: f14_2_set_started
Create Date: 2026-08-12 10:00:00.000000

"""
from collections.abc import Sequence
from typing import Union

from alembic import op


revision: str = "f15_exceptions"
down_revision: Union[str, None] = "f14_2_set_started"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE workout_exceptions (
            id INTEGER NOT NULL,
            workout_session_id INTEGER NOT NULL,
            workout_exercise_id INTEGER NOT NULL,
            workout_planned_set_id INTEGER,
            scope VARCHAR NOT NULL,
            reason_code VARCHAR(50),
            note VARCHAR(500),
            occurred_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            PRIMARY KEY (id),
            CONSTRAINT ck_workout_exceptions_scope CHECK (
                scope IN ('set', 'exercise')
            ),
            CONSTRAINT ck_workout_exceptions_reason_code CHECK (
                reason_code IS NULL OR reason_code IN (
                    'not_enough_time','too_fatigued',
                    'equipment_unavailable','unable_to_perform','other'
                )
            ),
            CONSTRAINT ck_workout_exceptions_scope_refs CHECK (
                (scope = 'set' AND workout_planned_set_id IS NOT NULL)
                OR (scope = 'exercise' AND workout_planned_set_id IS NULL)
            ),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id)
                ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id)
                ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id) REFERENCES workout_planned_sets (id)
                ON DELETE SET NULL
        )
    """)

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
            CONSTRAINT uq_workout_events_session_sequence
                UNIQUE (workout_session_id, sequence),
            CONSTRAINT ck_workout_events_sequence CHECK (sequence >= 1),
            CONSTRAINT ck_workout_events_event_type CHECK (
                event_type IN (
                    'workout_started','exercise_started','set_started',
                    'set_completed','set_updated','set_marked_incomplete',
                    'exercise_completed','workout_cancelled',
                    'set_skipped','set_skip_reverted',
                    'exercise_skipped','exercise_skip_reverted'
                )
            ),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id)
                ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id)
                ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id) REFERENCES workout_planned_sets (id)
                ON DELETE SET NULL,
            FOREIGN KEY (workout_exception_id) REFERENCES workout_exceptions (id)
                ON DELETE SET NULL
        )
    """)
    op.execute("""
        INSERT INTO workout_events_new
        SELECT id, workout_session_id, sequence, event_type,
               workout_exercise_id, workout_planned_set_id,
               NULL, occurred_at
        FROM workout_events
    """)
    op.execute("DROP TABLE workout_events")
    op.execute("ALTER TABLE workout_events_new RENAME TO workout_events")


def downgrade() -> None:
    op.execute("""
        CREATE TABLE workout_events_old (
            id INTEGER NOT NULL,
            workout_session_id INTEGER NOT NULL,
            sequence INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            workout_exercise_id INTEGER,
            workout_planned_set_id INTEGER,
            occurred_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            CONSTRAINT uq_workout_events_session_sequence
                UNIQUE (workout_session_id, sequence),
            CONSTRAINT ck_workout_events_sequence CHECK (sequence >= 1),
            CONSTRAINT ck_workout_events_event_type CHECK (
                event_type IN (
                    'workout_started','exercise_started','set_started',
                    'set_completed','set_updated','set_marked_incomplete',
                    'exercise_completed','workout_cancelled'
                )
            ),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id)
                ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id)
                ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id) REFERENCES workout_planned_sets (id)
                ON DELETE SET NULL
        )
    """)
    op.execute("""
        INSERT INTO workout_events_old
        SELECT id, workout_session_id, sequence, event_type,
               workout_exercise_id, workout_planned_set_id, occurred_at
        FROM workout_events
    """)
    op.execute("DROP TABLE workout_events")
    op.execute("ALTER TABLE workout_events_old RENAME TO workout_events")
    op.execute("DROP TABLE workout_exceptions")