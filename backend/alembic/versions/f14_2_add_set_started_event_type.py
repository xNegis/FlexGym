"""add_set_started_event_type

Revision ID: f14_2_set_started
Revises: 693e3945d24a
Create Date: 2026-08-12 14:00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f14_2_set_started'
down_revision: Union[str, Sequence[str], None] = '693e3945d24a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE workout_events_new (
            id INTEGER NOT NULL,
            workout_session_id INTEGER NOT NULL,
            sequence INTEGER NOT NULL,
            event_type VARCHAR NOT NULL,
            workout_exercise_id INTEGER,
            workout_planned_set_id INTEGER,
            occurred_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            CONSTRAINT uq_workout_events_session_sequence UNIQUE (workout_session_id, sequence),
            CONSTRAINT ck_workout_events_sequence CHECK (sequence >= 1),
            CONSTRAINT ck_workout_events_event_type CHECK (
                event_type IN (
                    'workout_started','exercise_started','set_started',
                    'set_completed','set_updated','set_marked_incomplete',
                    'exercise_completed','workout_cancelled'
                )
            ),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id) ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id) REFERENCES workout_planned_sets (id) ON DELETE SET NULL
        )
    """)
    op.execute("""
        INSERT INTO workout_events_new
        SELECT id, workout_session_id, sequence, event_type,
               workout_exercise_id, workout_planned_set_id, occurred_at
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
            CONSTRAINT uq_workout_events_session_sequence UNIQUE (workout_session_id, sequence),
            CONSTRAINT ck_workout_events_sequence CHECK (sequence >= 1),
            CONSTRAINT ck_workout_events_event_type CHECK (
                event_type IN (
                    'workout_started','exercise_started','set_completed',
                    'set_updated','set_marked_incomplete','exercise_completed',
                    'workout_cancelled'
                )
            ),
            FOREIGN KEY (workout_session_id) REFERENCES workout_sessions (id) ON DELETE CASCADE,
            FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id) ON DELETE SET NULL,
            FOREIGN KEY (workout_planned_set_id) REFERENCES workout_planned_sets (id) ON DELETE SET NULL
        )
    """)
    op.execute("""
        INSERT INTO workout_events_old
        SELECT id, workout_session_id, sequence, event_type,
               workout_exercise_id, workout_planned_set_id, occurred_at
        FROM workout_events
        WHERE event_type != 'set_started'
    """)
    op.execute("DROP TABLE workout_events")
    op.execute("ALTER TABLE workout_events_old RENAME TO workout_events")
