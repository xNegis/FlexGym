"""Schedule domain operations: inspection, move, and swap."""

from __future__ import annotations

import datetime

from sqlalchemy.orm import Session, selectinload

from app.models import RoutineScheduleAssignment, TrainingDay
from app.services.routine_service import _require_routine

WEEKDAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def _weekday_name(week_position: int) -> str:
    return WEEKDAY_NAMES[week_position - 1]


def _training_day_slot(day: TrainingDay) -> dict[str, object]:
    return {
        "id": day.id,
        "name": day.name,
        "week_position": day.schedule_assignment.week_position if day.schedule_assignment else 0,
        "exercise_count": len(day.exercise_configurations) if day.exercise_configurations else 0,
        "created_at": day.created_at.isoformat(),
        "updated_at": day.updated_at.isoformat(),
    }


def get_schedule(session: Session, routine_id: int, user_id: int) -> list[dict[str, object]]:
    _require_routine(session, routine_id, user_id)

    assignments: dict[int, RoutineScheduleAssignment] = {
        a.week_position: a
        for a in session.query(RoutineScheduleAssignment)
        .options(
            selectinload(RoutineScheduleAssignment.training_day).selectinload(
                TrainingDay.exercise_configurations
            )
        )
        .filter(RoutineScheduleAssignment.routine_id == routine_id)
        .all()
    }

    slots: list[dict[str, object]] = []
    for pos in range(1, 8):
        assignment = assignments.get(pos)
        if assignment is not None and assignment.training_day is not None:
            slots.append(
                {
                    "position": pos,
                    "weekday": _weekday_name(pos),
                    "type": "training",
                    "training_day": _training_day_slot(assignment.training_day),
                }
            )
        else:
            slots.append(
                {
                    "position": pos,
                    "weekday": _weekday_name(pos),
                    "type": "rest",
                }
            )

    return slots


def move_training_day(
    session: Session,
    routine_id: int,
    user_id: int,
    training_day_id: int,
    week_position: int,
) -> list[dict[str, object]]:
    routine = _require_routine(session, routine_id, user_id)

    source_assignment = (
        session.query(RoutineScheduleAssignment)
        .filter(
            RoutineScheduleAssignment.training_day_id == training_day_id,
            RoutineScheduleAssignment.routine_id == routine_id,
        )
        .first()
    )
    if source_assignment is None:
        raise ValueError("Training day not found")

    if source_assignment.week_position == week_position:
        return get_schedule(session, routine_id, user_id)

    target_assignment = (
        session.query(RoutineScheduleAssignment)
        .filter(
            RoutineScheduleAssignment.routine_id == routine_id,
            RoutineScheduleAssignment.week_position == week_position,
        )
        .first()
    )

    if target_assignment is not None:
        old_source_pos = source_assignment.week_position
        old_target_pos = target_assignment.week_position
        source_day = source_assignment.training_day
        target_day = target_assignment.training_day

        session.delete(source_assignment)
        session.delete(target_assignment)
        session.flush()

        session.add(
            RoutineScheduleAssignment(
                routine_id=routine_id,
                training_day_id=source_day.id,
                week_position=old_target_pos,
            )
        )
        session.add(
            RoutineScheduleAssignment(
                routine_id=routine_id,
                training_day_id=target_day.id,
                week_position=old_source_pos,
            )
        )
        now = datetime.datetime.utcnow()
        source_day.updated_at = now
        target_day.updated_at = now
    else:
        source_assignment.week_position = week_position
        source_day = source_assignment.training_day
        source_day.updated_at = datetime.datetime.utcnow()
        session.add(source_day)

    routine.updated_at = datetime.datetime.utcnow()
    session.add(routine)
    session.commit()

    return get_schedule(session, routine_id, user_id)
