"""add_performed_sets_and_workout_events

Revision ID: 693e3945d24a
Revises: 5f6392b90798
Create Date: 2026-08-12 12:03:20.492261

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '693e3945d24a'
down_revision: Union[str, Sequence[str], None] = '5f6392b90798'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('workout_exercises', sa.Column('instructions', sa.String(length=500), nullable=True))

    op.create_table('performed_sets',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('workout_planned_set_id', sa.Integer(), nullable=False),
    sa.Column('performed_value', sa.Numeric(precision=8, scale=2), nullable=False),
    sa.Column('performed_weight_kg', sa.Numeric(precision=8, scale=2), nullable=True),
    sa.Column('performed_rir', sa.Integer(), nullable=True),
    sa.Column('entry_mode', sa.String(), nullable=False),
    sa.Column('completed_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("entry_mode IN ('as_planned', 'adjusted')", name='ck_performed_sets_entry_mode'),
    sa.ForeignKeyConstraint(['workout_planned_set_id'], ['workout_planned_sets.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('workout_planned_set_id')
    )
    op.create_table('workout_events',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('workout_session_id', sa.Integer(), nullable=False),
    sa.Column('sequence', sa.Integer(), nullable=False),
    sa.Column('event_type', sa.String(), nullable=False),
    sa.Column('workout_exercise_id', sa.Integer(), nullable=True),
    sa.Column('workout_planned_set_id', sa.Integer(), nullable=True),
    sa.Column('occurred_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("event_type IN ('workout_started','exercise_started','set_completed','set_updated','set_marked_incomplete','exercise_completed','workout_cancelled')", name='ck_workout_events_event_type'),
    sa.CheckConstraint('sequence >= 1', name='ck_workout_events_sequence'),
    sa.ForeignKeyConstraint(['workout_exercise_id'], ['workout_exercises.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['workout_planned_set_id'], ['workout_planned_sets.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['workout_session_id'], ['workout_sessions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('workout_session_id', 'sequence', name='uq_workout_events_session_sequence')
    )

    _backfill_instructions()
    _backfill_events()


def _backfill_instructions() -> None:
    connection = op.get_bind()
    result = connection.execute(
        text(
            "SELECT we.id, we.source_exercise_id, ex.instructions "
            "FROM workout_exercises we "
            "LEFT JOIN exercises ex ON we.source_exercise_id = ex.id "
            "WHERE we.instructions IS NULL"
        )
    ).fetchall()

    for row in result:
        exercise_id, source_id, instructions = row
        if instructions is not None:
            connection.execute(
                text("UPDATE workout_exercises SET instructions = :instr WHERE id = :id"),
                {"instr": instructions, "id": exercise_id},
            )


def _backfill_events() -> None:
    connection = op.get_bind()

    workouts = connection.execute(
        text("SELECT id, started_at, cancelled_at, status FROM workout_sessions")
    ).fetchall()

    for workout in workouts:
        ws_id, started_at, cancelled_at, status = workout
        seq = 1

        connection.execute(
            text(
                "INSERT INTO workout_events (workout_session_id, sequence, event_type, occurred_at) "
                "VALUES (:ws_id, :seq, 'workout_started', :ts)"
            ),
            {"ws_id": ws_id, "seq": seq, "ts": started_at},
        )

        if status == "cancelled" and cancelled_at is not None:
            seq += 1
            connection.execute(
                text(
                    "INSERT INTO workout_events (workout_session_id, sequence, event_type, occurred_at) "
                    "VALUES (:ws_id, :seq, 'workout_cancelled', :ts)"
                ),
                {"ws_id": ws_id, "seq": seq, "ts": cancelled_at},
            )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('workout_events')
    op.drop_table('performed_sets')
    op.drop_column('workout_exercises', 'instructions')
