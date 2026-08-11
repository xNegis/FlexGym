"""Training day domain operations: listing, creation, renaming, reordering, and deletion."""

from __future__ import annotations

import datetime

from sqlalchemy.orm import Session

from app.models import Routine, TrainingDay
from app.services.routine_service import _require_routine

MAX_TRAINING_DAYS = 7


class TrainingDayNotFoundError(Exception):
    pass


class TrainingDayLimitError(Exception):
    pass


class TrainingDayOrderError(Exception):
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


def list_training_days(session: Session, routine_id: int, user_id: int) -> list[TrainingDay]:
    _require_routine(session, routine_id, user_id)
    return (
        session.query(TrainingDay)
        .filter(TrainingDay.routine_id == routine_id)
        .order_by(TrainingDay.position.asc(), TrainingDay.id.asc())
        .all()
    )


def create_training_day(session: Session, routine_id: int, user_id: int, name: str) -> TrainingDay:
    routine = _require_routine(session, routine_id, user_id)

    count = session.query(TrainingDay).filter(TrainingDay.routine_id == routine_id).count()
    if count >= MAX_TRAINING_DAYS:
        raise TrainingDayLimitError("Routine already has 7 training days")

    next_position = count + 1
    day = TrainingDay(routine_id=routine_id, name=name.strip(), position=next_position)
    session.add(day)
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


def reorder_training_days(
    session: Session, routine_id: int, user_id: int, day_ids: list[int]
) -> list[TrainingDay]:
    routine = _require_routine(session, routine_id, user_id)

    existing = (
        session.query(TrainingDay)
        .filter(TrainingDay.routine_id == routine_id)
        .order_by(TrainingDay.position.asc())
        .all()
    )

    existing_ids = {day.id for day in existing}
    if len(day_ids) != len(existing_ids) or set(day_ids) != existing_ids:
        raise TrainingDayOrderError("Day order must contain every training day exactly once")

    id_to_day = {d.id: d for d in existing}

    for i, day_id in enumerate(day_ids):
        id_to_day[day_id].position = -(i + 1)

    session.flush()

    for i, day_id in enumerate(day_ids):
        id_to_day[day_id].position = i + 1

    _refresh_routine_timestamp(session, routine)
    session.commit()

    return (
        session.query(TrainingDay)
        .filter(TrainingDay.routine_id == routine_id)
        .order_by(TrainingDay.position.asc(), TrainingDay.id.asc())
        .all()
    )


def delete_training_day(session: Session, routine_id: int, user_id: int, day_id: int) -> None:
    _require_routine(session, routine_id, user_id)
    day = _require_training_day(session, routine_id, day_id)
    routine = day.routine
    deleted_position = day.position

    session.delete(day)
    session.flush()

    remaining = (
        session.query(TrainingDay)
        .filter(
            TrainingDay.routine_id == routine_id,
            TrainingDay.position > deleted_position,
        )
        .order_by(TrainingDay.position.asc())
        .all()
    )
    for i, d in enumerate(remaining):
        d.position = deleted_position + i

    _refresh_routine_timestamp(session, routine)
    session.commit()
