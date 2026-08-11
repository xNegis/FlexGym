"""Active routine domain operations: activation, deactivation, and lookup."""

from __future__ import annotations

import datetime

from sqlalchemy.orm import Session

from app.models import ActiveRoutine


class ActivationError(Exception):
    pass


def get_active_routine(session: Session, user_id: int) -> ActiveRoutine | None:
    return session.query(ActiveRoutine).filter(ActiveRoutine.user_id == user_id).first()


def is_routine_active(session: Session, routine_id: int, user_id: int) -> bool:
    existing = (
        session.query(ActiveRoutine)
        .filter(ActiveRoutine.user_id == user_id, ActiveRoutine.routine_id == routine_id)
        .first()
    )
    return existing is not None


def activate_routine(
    session: Session, user_id: int, routine_id: int, now: datetime.datetime | None = None
) -> ActiveRoutine:
    from app.models import Routine, RoutineScheduleAssignment, TrainingDay

    routine = (
        session.query(Routine).filter(Routine.id == routine_id, Routine.user_id == user_id).first()
    )
    if routine is None:
        raise ActivationError("Routine not found")

    day_count = session.query(TrainingDay).filter(TrainingDay.routine_id == routine_id).count()
    if day_count == 0:
        raise ActivationError("Routine must contain at least one training day before activation")

    assignment_count = (
        session.query(RoutineScheduleAssignment)
        .filter(RoutineScheduleAssignment.routine_id == routine_id)
        .count()
    )
    if assignment_count != day_count:
        raise ActivationError("Routine schedule is incomplete")

    existing = session.query(ActiveRoutine).filter(ActiveRoutine.user_id == user_id).first()

    if existing is not None and existing.routine_id == routine_id:
        return existing

    timestamp = now if now is not None else datetime.datetime.utcnow()

    if existing is not None:
        existing.routine_id = routine_id
        existing.activated_at = timestamp
    else:
        existing = ActiveRoutine(
            user_id=user_id,
            routine_id=routine_id,
            activated_at=timestamp,
        )
        session.add(existing)

    session.commit()
    session.refresh(existing)
    return existing


def deactivate_routine(session: Session, user_id: int) -> None:
    existing = session.query(ActiveRoutine).filter(ActiveRoutine.user_id == user_id).first()
    if existing is None:
        return
    session.delete(existing)
    session.commit()


def clear_active_if_matches_routine(session: Session, routine_id: int) -> None:
    existing = session.query(ActiveRoutine).filter(ActiveRoutine.routine_id == routine_id).first()
    if existing is not None:
        session.delete(existing)
