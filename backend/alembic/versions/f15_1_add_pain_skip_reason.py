"""Add pain or discomfort as a structured skip reason.

Revision ID: f15_1_pain_reason
Revises: f15_exceptions
Create Date: 2026-08-12 19:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "f15_1_pain_reason"
down_revision: Union[str, None] = "f15_exceptions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_exceptions(table_name: str, include_pain: bool) -> None:
    reasons = (
        "'not_enough_time','too_fatigued','equipment_unavailable',"
        "'unable_to_perform','pain_or_discomfort','other'"
        if include_pain
        else "'not_enough_time','too_fatigued','equipment_unavailable','unable_to_perform','other'"
    )
    op.execute(f"""
        CREATE TABLE {table_name} (
            id INTEGER NOT NULL,
            workout_session_id INTEGER NOT NULL,
            workout_exercise_id INTEGER NOT NULL,
            workout_planned_set_id INTEGER,
            scope VARCHAR NOT NULL,
            reason_code VARCHAR(50),
            note VARCHAR(500),
            occurred_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            PRIMARY KEY (id),
            CONSTRAINT ck_workout_exceptions_scope CHECK (scope IN ('set', 'exercise')),
            CONSTRAINT ck_workout_exceptions_reason_code CHECK (
                reason_code IS NULL OR reason_code IN ({reasons})
            ),
            CONSTRAINT ck_workout_exceptions_scope_refs CHECK (
                (scope = 'set' AND workout_planned_set_id IS NOT NULL)
                OR (scope = 'exercise' AND workout_planned_set_id IS NULL)
            ),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id) ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id)
                REFERENCES workout_planned_sets (id) ON DELETE SET NULL
        )
    """)


def _create_events(table_name: str, exception_table: str) -> None:
    op.execute(f"""
        CREATE TABLE {table_name} (
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
                    'exercise_completed','workout_cancelled',
                    'set_skipped','set_skip_reverted',
                    'exercise_skipped','exercise_skip_reverted'
                )
            ),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id) ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id)
                REFERENCES workout_planned_sets (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_exception_id) REFERENCES {exception_table} (id) ON DELETE SET NULL
        )
    """)


def _rebuild(include_pain: bool) -> None:
    _create_exceptions("workout_exceptions_new", include_pain)
    op.execute("""
        INSERT INTO workout_exceptions_new
        SELECT id, workout_session_id, workout_exercise_id, workout_planned_set_id,
               scope, reason_code, note, occurred_at
        FROM workout_exceptions
    """)
    _create_events("workout_events_new", "workout_exceptions_new")
    op.execute("""
        INSERT INTO workout_events_new
        SELECT id, workout_session_id, sequence, event_type, workout_exercise_id,
               workout_planned_set_id, workout_exception_id, occurred_at
        FROM workout_events
    """)
    op.execute("DROP TABLE workout_events")
    op.execute("DROP TABLE workout_exceptions")
    op.execute("ALTER TABLE workout_exceptions_new RENAME TO workout_exceptions")
    op.execute("ALTER TABLE workout_events_new RENAME TO workout_events")


def upgrade() -> None:
    _rebuild(include_pain=True)


def downgrade() -> None:
    connection = op.get_bind()
    pain_count = connection.exec_driver_sql(
        "SELECT COUNT(*) FROM workout_exceptions WHERE reason_code = 'pain_or_discomfort'"
    ).scalar_one()
    if pain_count:
        raise RuntimeError("Cannot downgrade while pain_or_discomfort workout exceptions exist")
    _rebuild(include_pain=False)
