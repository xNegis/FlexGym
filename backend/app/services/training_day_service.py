"""Training day domain operations: listing, creation, renaming, and deletion."""

from __future__ import annotations

import datetime

from sqlalchemy.orm import Session, selectinload

from app.models import Routine, RoutineScheduleAssignment, TrainingDay
from app.services.routine_service import _require_routine

MAX_TRAINING_DAYS = 7


class TrainingDayNotFoundError(Exception):
    pass


class TrainingDayLimitError(Exception):
    pass


def _require_training_day(session: Session, routine_id: int, day_id: int) -> TrainingDay:
    day = (
        session.query(TrainingDay)
        .filter(TrainingDay.id == day_id, TrainingDay.routine_id == routine_id)
        .first()
    )
    if day is None:
        raise TrainingDayNotFoundError("Training day not found")
    return day


def _refresh_routine_timestamp(session: Session, routine: Routine) -> None:
    routine.updated_at = datetime.datetime.utcnow()
    session.add(routine)


def _first_free_week_position(session: Session, routine_id: int) -> int | None:
    assigned = {
        row[0]
        for row in session.query(RoutineScheduleAssignment.week_position)
        .filter(RoutineScheduleAssignment.routine_id == routine_id)
        .all()
    }
    for pos in range(1, 8):
        if pos not in assigned:
            return pos
    return None


def list_training_days(session: Session, routine_id: int, user_id: int) -> list[TrainingDay]:
    _require_routine(session, routine_id, user_id)
    return (
        session.query(TrainingDay)
        .options(
            selectinload(TrainingDay.exercise_configurations),
            selectinload(TrainingDay.schedule_assignment),
        )
        .filter(TrainingDay.routine_id == routine_id)
        .join(
            RoutineScheduleAssignment,
            TrainingDay.id == RoutineScheduleAssignment.training_day_id,
        )
        .order_by(RoutineScheduleAssignment.week_position.asc(), TrainingDay.id.asc())
        .all()
    )


def create_training_day(session: Session, routine_id: int, user_id: int, name: str) -> TrainingDay:
    routine = _require_routine(session, routine_id, user_id)

    count = session.query(TrainingDay).filter(TrainingDay.routine_id == routine_id).count()
    if count >= MAX_TRAINING_DAYS:
        raise TrainingDayLimitError("Routine already has 7 training days")

    week_position = _first_free_week_position(session, routine_id)
    if week_position is None:
        raise TrainingDayLimitError("Routine already has 7 training days")

    day = TrainingDay(routine_id=routine_id, name=name.strip())
    session.add(day)
    session.flush()

    assignment = RoutineScheduleAssignment(
        routine_id=routine_id,
        training_day_id=day.id,
        week_position=week_position,
    )
    session.add(assignment)
    _refresh_routine_timestamp(session, routine)
    session.commit()
    session.refresh(day)
    return day


def rename_training_day(
    session: Session, routine_id: int, user_id: int, day_id: int, name: str
) -> TrainingDay:
    _require_routine(session, routine_id, user_id)
    day = _require_training_day(session, routine_id, day_id)
    routine = day.routine
    day.name = name.strip()
    _refresh_routine_timestamp(session, routine)
    session.commit()
    session.refresh(day)
    return day


def delete_training_day(session: Session, routine_id: int, user_id: int, day_id: int) -> None:
    from app.services.active_routine_service import clear_active_if_matches_routine

    _require_routine(session, routine_id, user_id)
    day = _require_training_day(session, routine_id, day_id)
    routine = day.routine

    remaining = (
        session.query(TrainingDay)
        .filter(TrainingDay.routine_id == routine_id, TrainingDay.id != day_id)
        .count()
    )
    if remaining == 0:
        clear_active_if_matches_routine(session, routine_id)

    session.delete(day)
    _refresh_routine_timestamp(session, routine)
    session.commit()
