"""Add completed lifecycle state and the workout_completed event.

Revision ID: f17_completion
Revises: f15_1_pain_reason
Create Date: 2026-08-12 20:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "f17_completion"
down_revision: Union[str, None] = "f15_1_pain_reason"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_sessions(include_completed: bool) -> None:
    statuses = (
        "'in_progress', 'cancelled', 'completed'"
        if include_completed
        else "'in_progress', 'cancelled'"
    )
    completed_column = ", completed_at DATETIME" if include_completed else ""
    status_timestamp_check = (
        "(status = 'in_progress' AND cancelled_at IS NULL AND completed_at IS NULL) OR "
        "(status = 'cancelled' AND cancelled_at IS NOT NULL AND completed_at IS NULL) OR "
        "(status = 'completed' AND completed_at IS NOT NULL AND cancelled_at IS NULL)"
        if include_completed
        else "(status = 'in_progress' AND cancelled_at IS NULL) OR "
        "(status = 'cancelled' AND cancelled_at IS NOT NULL)"
    )
    op.execute(f"""
        CREATE TABLE workout_sessions_new (
            id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            source_routine_id INTEGER,
            source_training_day_id INTEGER,
            routine_name VARCHAR(120) NOT NULL,
            local_date DATE NOT NULL,
            scheduled_week_position INTEGER NOT NULL,
            scheduled_slot_was_rest INTEGER NOT NULL,
            scheduled_training_day_id INTEGER,
            scheduled_training_day_name VARCHAR(120),
            selected_training_day_id INTEGER NOT NULL,
            selected_training_day_name VARCHAR(120) NOT NULL,
            selected_week_position INTEGER NOT NULL,
            selection_kind VARCHAR NOT NULL,
            status VARCHAR NOT NULL,
            started_at DATETIME NOT NULL,
            cancelled_at DATETIME{completed_column},
            PRIMARY KEY (id),
            CONSTRAINT ck_workout_sessions_selection_kind CHECK (selection_kind IN ('scheduled', 'alternate')),
            CONSTRAINT ck_workout_sessions_scheduled_slot_was_rest CHECK (scheduled_slot_was_rest IN (0, 1)),
            CONSTRAINT ck_workout_sessions_status CHECK (status IN ({statuses})),
            CONSTRAINT ck_workout_sessions_status_timestamp CHECK ({status_timestamp_check}),
            CONSTRAINT ck_workout_sessions_scheduled_slot CHECK (
                (scheduled_slot_was_rest = 1 AND scheduled_training_day_id IS NULL
                 AND scheduled_training_day_name IS NULL AND selection_kind = 'alternate')
                OR (scheduled_slot_was_rest = 0 AND scheduled_training_day_id IS NOT NULL
                 AND scheduled_training_day_name IS NOT NULL)
            ),
            CONSTRAINT ck_workout_sessions_scheduled_selection CHECK (
                selection_kind = 'alternate' OR selected_training_day_id = scheduled_training_day_id
            ),
            CONSTRAINT ck_workout_sessions_scheduled_week_position CHECK (
                scheduled_week_position >= 1 AND scheduled_week_position <= 7
            ),
            CONSTRAINT ck_workout_sessions_selected_week_position CHECK (
                selected_week_position >= 1 AND selected_week_position <= 7
            ),
            CONSTRAINT uq_workout_session_id_user_id UNIQUE (id, user_id),
            FOREIGN KEY (source_routine_id) REFERENCES routines (id) ON DELETE SET NULL,
            FOREIGN KEY (source_training_day_id) REFERENCES training_days (id) ON DELETE SET NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)


def _create_events(include_completed: bool) -> None:
    event_types = (
        "'workout_started','exercise_started','set_started',"
        "'set_completed','set_updated','set_marked_incomplete',"
        "'exercise_completed','workout_cancelled','workout_completed',"
        "'set_skipped','set_skip_reverted',"
        "'exercise_skipped','exercise_skip_reverted'"
        if include_completed
        else "'workout_started','exercise_started','set_started',"
        "'set_completed','set_updated','set_marked_incomplete',"
        "'exercise_completed','workout_cancelled',"
        "'set_skipped','set_skip_reverted',"
        "'exercise_skipped','exercise_skip_reverted'"
    )
    op.execute(f"""
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
            CONSTRAINT ck_workout_events_event_type CHECK (event_type IN ({event_types})),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id) ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id)
                REFERENCES workout_planned_sets (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_exception_id) REFERENCES workout_exceptions (id) ON DELETE SET NULL
        )
    """)


def _rebuild_sessions(include_completed: bool) -> None:
    _create_sessions(include_completed)
    if include_completed:
        op.execute("""
            INSERT INTO workout_sessions_new
            SELECT id, user_id, source_routine_id, source_training_day_id, routine_name,
                   local_date, scheduled_week_position, scheduled_slot_was_rest,
                   scheduled_training_day_id, scheduled_training_day_name,
                   selected_training_day_id, selected_training_day_name,
                   selected_week_position, selection_kind, status, started_at,
                   cancelled_at, NULL
            FROM workout_sessions
        """)
    else:
        op.execute("""
            INSERT INTO workout_sessions_new
            SELECT id, user_id, source_routine_id, source_training_day_id, routine_name,
                   local_date, scheduled_week_position, scheduled_slot_was_rest,
                   scheduled_training_day_id, scheduled_training_day_name,
                   selected_training_day_id, selected_training_day_name,
                   selected_week_position, selection_kind, status, started_at,
                   cancelled_at
            FROM workout_sessions
        """)
    op.execute("DROP TABLE workout_sessions")
    op.execute("ALTER TABLE workout_sessions_new RENAME TO workout_sessions")


def _rebuild_events(include_completed: bool) -> None:
    _create_events(include_completed)
    op.execute("""
        INSERT INTO workout_events_new
        SELECT id, workout_session_id, sequence, event_type, workout_exercise_id,
               workout_planned_set_id, workout_exception_id, occurred_at
        FROM workout_events
    """)
    op.execute("DROP TABLE workout_events")
    op.execute("ALTER TABLE workout_events_new RENAME TO workout_events")


def upgrade() -> None:
    _rebuild_events(include_completed=True)
    _rebuild_sessions(include_completed=True)


def downgrade() -> None:
    connection = op.get_bind()
    completed_count = connection.exec_driver_sql(
        "SELECT COUNT(*) FROM workout_sessions WHERE status = 'completed'"
    ).scalar_one()
    completed_event_count = connection.exec_driver_sql(
        "SELECT COUNT(*) FROM workout_events WHERE event_type = 'workout_completed'"
    ).scalar_one()
    if completed_count or completed_event_count:
        raise RuntimeError("Cannot downgrade while completed workouts or completion events exist")
    _rebuild_events(include_completed=False)
    _rebuild_sessions(include_completed=False)
