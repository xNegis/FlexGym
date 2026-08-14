"""Workout domain operations: start context, start, execution, cancel, history."""

from __future__ import annotations

import base64
import datetime
import hashlib
import hmac
import json
import re
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import get_config
from app.models import (
    ActiveRoutine,
    ActiveWorkout,
    ExerciseConfiguration,
    PerformedSet,
    Routine,
    RoutineScheduleAssignment,
    TrainingDay,
    WorkoutEvent,
    WorkoutException,
    WorkoutExercise,
    WorkoutPlannedSet,
    WorkoutSession,
)

WEEKDAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


class StartError(Exception):
    pass


class ExecutionError(Exception):
    pass


class HistoryError(Exception):
    pass


# ────────────────── helpers ──────────────────


def _iso_weekday(local_date: datetime.date) -> int:
    return local_date.isoweekday()


def _weekday_name(week_position: int) -> str:
    return WEEKDAY_NAMES[week_position - 1]


def _compact_exercise_preview(
    configs: list[ExerciseConfiguration],
) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for config in configs:
        set_count = len(config.configured_sets)
        result.append(
            {
                "position": config.position,
                "name": config.exercise.name,
                "set_count": set_count,
            }
        )
    return result


def _session_preview(day: TrainingDay) -> dict[str, object]:
    configs = day.exercise_configurations
    exercise_count = len(configs)
    set_count = sum(len(c.configured_sets) for c in configs)
    return {
        "id": day.id,
        "name": day.name,
        "week_position": day.schedule_assignment.week_position if day.schedule_assignment else 0,
        "exercise_count": exercise_count,
        "set_count": set_count,
        "can_start": exercise_count > 0,
        "exercises": _compact_exercise_preview(configs) if exercise_count > 0 else [],
    }


def _all_session_previews(routine_id: int, session: Session) -> list[dict[str, object]]:
    days = (
        session.query(TrainingDay)
        .options(
            selectinload(TrainingDay.exercise_configurations).selectinload(
                ExerciseConfiguration.configured_sets
            ),
            selectinload(TrainingDay.exercise_configurations).selectinload(
                ExerciseConfiguration.exercise
            ),
            selectinload(TrainingDay.schedule_assignment),
        )
        .filter(TrainingDay.routine_id == routine_id)
        .all()
    )
    days.sort(key=lambda d: d.schedule_assignment.week_position if d.schedule_assignment else 99)
    return [_session_preview(day) for day in days]


def _active_workout_summary(workout: WorkoutSession) -> dict[str, object]:
    progress = _derive_progress(workout)
    return {
        "id": workout.id,
        "routine_name": workout.routine_name,
        "selected_training_day_name": workout.selected_training_day_name,
        "local_date": workout.local_date.isoformat(),
        "started_at": workout.started_at.isoformat(),
        "status": workout.status,
        "selection_kind": workout.selection_kind,
        "resume_url": _derive_resume(progress, workout.id),
    }


# ────────────────── start context ──────────────────


def resolve_start_context(
    session: Session, user_id: int, local_date: datetime.date
) -> dict[str, object]:
    active_workout = (
        session.query(ActiveWorkout)
        .options(selectinload(ActiveWorkout.workout))
        .filter(ActiveWorkout.user_id == user_id)
        .first()
    )

    if active_workout is not None:
        workout = _load_workout_full(session, active_workout.workout.id)
        return {
            "state": "active_workout",
            "workout": _active_workout_summary(workout),
        }

    active_routine = (
        session.query(ActiveRoutine)
        .options(
            selectinload(ActiveRoutine.routine).selectinload(Routine.training_days),
        )
        .filter(ActiveRoutine.user_id == user_id)
        .first()
    )

    if active_routine is None:
        return {"state": "no_active_routine"}

    routine = active_routine.routine
    week_position = _iso_weekday(local_date)
    schedule_assignment = (
        session.query(RoutineScheduleAssignment)
        .options(
            selectinload(RoutineScheduleAssignment.training_day)
            .selectinload(TrainingDay.exercise_configurations)
            .selectinload(ExerciseConfiguration.configured_sets),
            selectinload(RoutineScheduleAssignment.training_day)
            .selectinload(TrainingDay.exercise_configurations)
            .selectinload(ExerciseConfiguration.exercise),
        )
        .filter(
            RoutineScheduleAssignment.routine_id == routine.id,
            RoutineScheduleAssignment.week_position == week_position,
        )
        .first()
    )

    session_previews = _all_session_previews(routine.id, session)
    routine_context = {"routine_id": routine.id, "routine_name": routine.name}

    if schedule_assignment is None or schedule_assignment.training_day is None:
        return {
            "state": "rest_day",
            "routine": routine_context,
            "week_position": week_position,
            "weekday": _weekday_name(week_position),
            "session_previews": session_previews,
        }

    training_day = schedule_assignment.training_day
    preview = _session_preview(training_day)

    return {
        "state": "scheduled_session",
        "routine": routine_context,
        "session": preview,
        "session_previews": session_previews,
    }


# ────────────────── workout start ──────────────────


def _snapshot_workout(
    session: Session,
    user_id: int,
    training_day: TrainingDay,
    routine: ActiveRoutine,
    local_date: datetime.date,
    selection_kind: str,
    scheduled_was_rest: bool,
    scheduled_training_day_id: int | None,
    scheduled_training_day_name: str | None,
    week_position: int,
) -> WorkoutSession:
    now = datetime.datetime.utcnow()
    routine_model = routine.routine
    selected_assignment = training_day.schedule_assignment
    selected_week_pos = selected_assignment.week_position if selected_assignment else 0

    workout = WorkoutSession(
        user_id=user_id,
        source_routine_id=routine_model.id,
        source_training_day_id=training_day.id,
        routine_name=routine_model.name,
        local_date=local_date,
        scheduled_week_position=week_position,
        scheduled_slot_was_rest=scheduled_was_rest,
        scheduled_training_day_id=scheduled_training_day_id,
        scheduled_training_day_name=scheduled_training_day_name,
        selected_training_day_id=training_day.id,
        selected_training_day_name=training_day.name,
        selected_week_position=selected_week_pos,
        selection_kind=selection_kind,
        status="in_progress",
        started_at=now,
    )
    session.add(workout)
    session.flush()

    for config in training_day.exercise_configurations:
        exercise = config.exercise
        workout_exercise = WorkoutExercise(
            workout_session_id=workout.id,
            position=config.position,
            source_exercise_id=exercise.id,
            exercise_slug=exercise.slug,
            exercise_name=exercise.name,
            target_type=config.target_type,
            rest_after_exercise_seconds=config.rest_after_exercise_seconds,
            notes=config.notes,
            instructions=exercise.instructions,
        )
        session.add(workout_exercise)
        session.flush()

        for planned_set in config.configured_sets:
            workout_planned_set = WorkoutPlannedSet(
                workout_exercise_id=workout_exercise.id,
                position=planned_set.position,
                target_value=planned_set.target_value,
                target_weight_kg=planned_set.target_weight_kg,
                target_rir=planned_set.target_rir,
                eccentric_seconds=planned_set.eccentric_seconds,
                stretched_pause_seconds=planned_set.stretched_pause_seconds,
                concentric_seconds=planned_set.concentric_seconds,
                peak_contraction_seconds=planned_set.peak_contraction_seconds,
                rest_after_set_seconds=planned_set.rest_after_set_seconds,
                notes=planned_set.notes,
            )
            session.add(workout_planned_set)

    active_workout = ActiveWorkout(
        user_id=user_id,
        workout_session_id=workout.id,
    )
    session.add(active_workout)

    _append_event(session, workout.id, 1, "workout_started", now)

    return workout


def start_workout(
    session: Session,
    user_id: int,
    training_day_id: int,
    local_date: datetime.date,
) -> WorkoutSession:
    existing = session.query(ActiveWorkout).filter(ActiveWorkout.user_id == user_id).first()
    if existing is not None:
        raise StartError("active_workout_exists")

    active_routine = (
        session.query(ActiveRoutine)
        .options(selectinload(ActiveRoutine.routine))
        .filter(ActiveRoutine.user_id == user_id)
        .first()
    )
    if active_routine is None:
        raise StartError("no_active_routine")

    routine_id = active_routine.routine.id

    training_day = (
        session.query(TrainingDay)
        .options(
            selectinload(TrainingDay.exercise_configurations).selectinload(
                ExerciseConfiguration.configured_sets
            ),
            selectinload(TrainingDay.exercise_configurations).selectinload(
                ExerciseConfiguration.exercise
            ),
            selectinload(TrainingDay.schedule_assignment),
        )
        .filter(
            TrainingDay.id == training_day_id,
            TrainingDay.routine_id == routine_id,
        )
        .first()
    )

    if training_day is None:
        raise StartError("training_day_not_found")

    if len(training_day.exercise_configurations) == 0:
        raise StartError("training_day_empty")

    week_position = _iso_weekday(local_date)

    schedule_assignment = (
        session.query(RoutineScheduleAssignment)
        .filter(
            RoutineScheduleAssignment.routine_id == routine_id,
            RoutineScheduleAssignment.week_position == week_position,
        )
        .first()
    )

    scheduled_was_rest = schedule_assignment is None
    scheduled_day_id: int | None = None
    scheduled_day_name: str | None = None

    if schedule_assignment is not None and schedule_assignment.training_day is not None:
        scheduled_day_id = schedule_assignment.training_day.id
        scheduled_day_name = schedule_assignment.training_day.name

    if training_day_id == scheduled_day_id:
        selection_kind = "scheduled"
    else:
        selection_kind = "alternate"

    workout = _snapshot_workout(
        session=session,
        user_id=user_id,
        training_day=training_day,
        routine=active_routine,
        local_date=local_date,
        selection_kind=selection_kind,
        scheduled_was_rest=scheduled_was_rest,
        scheduled_training_day_id=scheduled_day_id,
        scheduled_training_day_name=scheduled_day_name,
        week_position=week_position,
    )

    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        concurrent = session.query(ActiveWorkout).filter(ActiveWorkout.user_id == user_id).first()
        if concurrent is not None:
            raise StartError("active_workout_exists") from exc
        raise
    session.refresh(workout)
    return _load_workout_full(session, workout.id)


# ────────────────── query helpers ──────────────────


def _load_workout_full(session: Session, workout_id: int) -> WorkoutSession:
    return (
        session.query(WorkoutSession)
        .options(
            selectinload(WorkoutSession.exercises)
            .selectinload(WorkoutExercise.planned_sets)
            .selectinload(WorkoutPlannedSet.performed_set),
            selectinload(WorkoutSession.events),
            selectinload(WorkoutSession.exceptions),
        )
        .filter(WorkoutSession.id == workout_id)
        .one()
    )


def get_active_workout(session: Session, user_id: int) -> WorkoutSession | None:
    active = (
        session.query(ActiveWorkout)
        .options(
            selectinload(ActiveWorkout.workout)
            .selectinload(WorkoutSession.exercises)
            .selectinload(WorkoutExercise.planned_sets)
            .selectinload(WorkoutPlannedSet.performed_set),
            selectinload(ActiveWorkout.workout).selectinload(WorkoutSession.events),
            selectinload(ActiveWorkout.workout).selectinload(WorkoutSession.exceptions),
        )
        .filter(ActiveWorkout.user_id == user_id)
        .first()
    )
    return active.workout if active else None


def get_workout(session: Session, user_id: int, workout_id: int) -> WorkoutSession | None:
    return (
        session.query(WorkoutSession)
        .options(
            selectinload(WorkoutSession.exercises)
            .selectinload(WorkoutExercise.planned_sets)
            .selectinload(WorkoutPlannedSet.performed_set),
            selectinload(WorkoutSession.events),
            selectinload(WorkoutSession.exceptions),
        )
        .filter(
            WorkoutSession.id == workout_id,
            WorkoutSession.user_id == user_id,
        )
        .first()
    )


# ────────────────── event helpers ──────────────────


def _get_next_event_sequence(session: Session, workout_id: int) -> int:
    max_seq = (
        session.query(WorkoutEvent.sequence)
        .filter(WorkoutEvent.workout_session_id == workout_id)
        .order_by(WorkoutEvent.sequence.desc())
        .first()
    )
    return (max_seq[0] + 1) if max_seq else 1


def _append_event(
    session: Session,
    workout_id: int,
    sequence: int,
    event_type: str,
    occurred_at: datetime.datetime,
    workout_exercise_id: int | None = None,
    workout_planned_set_id: int | None = None,
    workout_exception_id: int | None = None,
) -> WorkoutEvent:
    event = WorkoutEvent(
        workout_session_id=workout_id,
        sequence=sequence,
        event_type=event_type,
        workout_exercise_id=workout_exercise_id,
        workout_planned_set_id=workout_planned_set_id,
        workout_exception_id=workout_exception_id,
        occurred_at=occurred_at,
    )
    session.add(event)
    return event


# ────────────────── exception helpers ──────────────────

SUPPORTED_REASON_CODES = frozenset(
    {
        "not_enough_time",
        "too_fatigued",
        "equipment_unavailable",
        "unable_to_perform",
        "pain_or_discomfort",
        "other",
    }
)


def _is_set_performed(ps: WorkoutPlannedSet) -> bool:
    return ps.performed_set is not None


def _is_set_skipped(ps: WorkoutPlannedSet, exceptions: list[WorkoutException]) -> bool:
    for exc in exceptions:
        if exc.scope == "set" and exc.workout_planned_set_id == ps.id:
            return True
        if exc.scope == "exercise" and exc.workout_exercise_id == ps.workout_exercise_id:
            return True
    return False


def _is_set_resolved(ps: WorkoutPlannedSet, exceptions: list[WorkoutException]) -> bool:
    return _is_set_performed(ps) or _is_set_skipped(ps, exceptions)


def _get_active_exceptions(workout: WorkoutSession) -> list[WorkoutException]:
    """Return active exceptions (those not yet reversed)."""
    events = list(workout.events)
    exception_events: dict[int, list[WorkoutEvent]] = {}
    for e in events:
        if e.workout_exception_id is None:
            continue
        exception_events.setdefault(e.workout_exception_id, []).append(e)

    active_exceptions: list[WorkoutException] = []
    for exc_row in workout.exceptions:
        exc_events = exception_events.get(exc_row.id, [])
        has_skip = any(ev.event_type in ("set_skipped", "exercise_skipped") for ev in exc_events)
        has_revert = any(
            ev.event_type in ("set_skip_reverted", "exercise_skip_reverted") for ev in exc_events
        )
        if has_skip and not has_revert:
            active_exceptions.append(exc_row)

    return active_exceptions


def _get_exception_for_set(
    ps: WorkoutPlannedSet,
    active_exceptions: list[WorkoutException],
) -> WorkoutException | None:
    for exc in active_exceptions:
        if exc.scope == "set" and exc.workout_planned_set_id == ps.id:
            return exc
        if exc.scope == "exercise" and exc.workout_exercise_id == ps.workout_exercise_id:
            return exc
    return None


def _normalize_note(note: str | None, reason_code: str | None) -> str | None:
    if note is not None:
        trimmed = note.strip()
        if not trimmed:
            return None
        if len(trimmed) > 500:
            raise ExecutionError("Note exceeds 500 characters")
        return trimmed
    return None


def _validate_exception_reason(reason_code: str | None, note: str | None) -> None:
    if reason_code is not None and reason_code not in SUPPORTED_REASON_CODES:
        raise ExecutionError("Unsupported reason code")
    if reason_code == "other":
        if note is None or not note.strip():
            raise ExecutionError("A note is required when reason is 'other'")


# ────────────────── set skip ──────────────────


def skip_set(
    session: Session,
    user_id: int,
    workout_id: int,
    exercise_position: int,
    set_position: int,
    reason_code: str | None = None,
    note: str | None = None,
) -> WorkoutSession:
    workout = _get_active_workout_for_execution(session, user_id, workout_id)

    we = _get_exercise_by_position(workout, exercise_position)
    if we is None:
        raise ExecutionError("Workout set not found")

    ps = _get_planned_set_by_position(we, set_position)
    if ps is None:
        raise ExecutionError("Workout set not found")

    _validate_exception_reason(reason_code, note)
    note = _normalize_note(note, reason_code)

    active_exceptions = _get_active_exceptions(workout)

    if not _exercise_is_started(we, workout.events):
        raise ExecutionError("Exercise has not been started")

    if ps.performed_set is not None:
        raise ExecutionError("Workout set is already complete")

    if _is_set_skipped(ps, active_exceptions):
        raise ExecutionError("Workout set is already skipped")

    earliest = _earliest_unresolved_planned_set(we, active_exceptions)
    if earliest is None or ps.id != earliest.id:
        raise ExecutionError("Workout set is not current")

    now = datetime.datetime.utcnow()

    exc = WorkoutException(
        workout_session_id=workout.id,
        workout_exercise_id=we.id,
        workout_planned_set_id=ps.id,
        scope="set",
        reason_code=reason_code,
        note=note,
        occurred_at=now,
    )
    session.add(exc)
    session.flush()

    seq = _get_next_event_sequence(session, workout_id)
    _append_event(
        session,
        workout_id,
        seq,
        "set_skipped",
        now,
        workout_exercise_id=we.id,
        workout_planned_set_id=ps.id,
        workout_exception_id=exc.id,
    )

    session.commit()
    return _load_workout_full(session, workout_id)


# ────────────────── set skip reversal ──────────────────


def revert_skip_set(
    session: Session,
    user_id: int,
    workout_id: int,
    exercise_position: int,
    set_position: int,
) -> WorkoutSession:
    workout = _get_active_workout_for_execution(session, user_id, workout_id)

    we = _get_exercise_by_position(workout, exercise_position)
    if we is None:
        raise ExecutionError("Workout set not found")

    ps = _get_planned_set_by_position(we, set_position)
    if ps is None:
        raise ExecutionError("Workout set not found")

    active_exceptions = _get_active_exceptions(workout)

    set_exc = None
    for exc in active_exceptions:
        if exc.scope == "set" and exc.workout_planned_set_id == ps.id:
            set_exc = exc
            break

    if set_exc is None:
        raise ExecutionError("Workout set is not skipped")

    now = datetime.datetime.utcnow()
    seq = _get_next_event_sequence(session, workout_id)
    _append_event(
        session,
        workout_id,
        seq,
        "set_skip_reverted",
        now,
        workout_exercise_id=we.id,
        workout_planned_set_id=ps.id,
        workout_exception_id=set_exc.id,
    )

    session.commit()
    return _load_workout_full(session, workout_id)


# ────────────────── exercise skip ──────────────────


def skip_exercise(
    session: Session,
    user_id: int,
    workout_id: int,
    exercise_position: int,
    reason_code: str | None = None,
    note: str | None = None,
) -> WorkoutSession:
    workout = _get_active_workout_for_execution(session, user_id, workout_id)

    we = _get_exercise_by_position(workout, exercise_position)
    if we is None:
        raise ExecutionError("Workout exercise not found")

    _validate_exception_reason(reason_code, note)
    note = _normalize_note(note, reason_code)

    active_exceptions = _get_active_exceptions(workout)

    for prev_we in workout.exercises:
        if prev_we.position < exercise_position:
            if not _exercise_is_fully_resolved(prev_we, active_exceptions):
                raise ExecutionError("Exercise cannot be skipped yet")

    for exc in active_exceptions:
        if exc.scope == "exercise" and exc.workout_exercise_id == we.id:
            raise ExecutionError("Exercise is already skipped")

    if _exercise_is_fully_resolved(we, active_exceptions):
        raise ExecutionError("Exercise is already resolved")

    now = datetime.datetime.utcnow()

    exc = WorkoutException(
        workout_session_id=workout.id,
        workout_exercise_id=we.id,
        workout_planned_set_id=None,
        scope="exercise",
        reason_code=reason_code,
        note=note,
        occurred_at=now,
    )
    session.add(exc)
    session.flush()

    seq = _get_next_event_sequence(session, workout_id)
    _append_event(
        session,
        workout_id,
        seq,
        "exercise_skipped",
        now,
        workout_exercise_id=we.id,
        workout_planned_set_id=None,
        workout_exception_id=exc.id,
    )

    session.commit()
    return _load_workout_full(session, workout_id)


# ────────────────── exercise skip reversal ──────────────────


def revert_skip_exercise(
    session: Session,
    user_id: int,
    workout_id: int,
    exercise_position: int,
) -> WorkoutSession:
    workout = _get_active_workout_for_execution(session, user_id, workout_id)

    we = _get_exercise_by_position(workout, exercise_position)
    if we is None:
        raise ExecutionError("Workout exercise not found")

    active_exceptions = _get_active_exceptions(workout)

    exercise_exc = None
    for exc in active_exceptions:
        if exc.scope == "exercise" and exc.workout_exercise_id == we.id:
            exercise_exc = exc
            break

    if exercise_exc is None:
        raise ExecutionError("Exercise is not skipped")

    now = datetime.datetime.utcnow()
    seq = _get_next_event_sequence(session, workout_id)
    _append_event(
        session,
        workout_id,
        seq,
        "exercise_skip_reverted",
        now,
        workout_exercise_id=we.id,
        workout_planned_set_id=None,
        workout_exception_id=exercise_exc.id,
    )

    session.commit()
    return _load_workout_full(session, workout_id)


def _derive_progress(workout: WorkoutSession) -> dict[str, Any]:
    active_exceptions = _get_active_exceptions(workout)

    total_sets = 0
    completed_sets = 0
    skipped_sets = 0
    all_recorded = True
    all_resolved = True
    current_exercise_pos: int | None = None
    current_set_pos: int | None = None
    current_set_phase: str | None = None
    current_set_started_at: str | None = None
    transition_to_pos: int | None = None
    found_current = False
    last_resolved_exercise_pos: int | None = None

    for we in workout.exercises:
        exercise_all_resolved = True
        exercise_completed = 0
        exercise_skipped_count = 0

        for ps in we.planned_sets:
            total_sets += 1
            if _is_set_performed(ps):
                completed_sets += 1
                exercise_completed += 1
            elif _is_set_skipped(ps, active_exceptions):
                skipped_sets += 1
                exercise_skipped_count += 1
                all_recorded = False
            else:
                exercise_all_resolved = False
                all_recorded = False
                all_resolved = False
                if not found_current:
                    exercise_started = _exercise_is_started(we, workout.events)
                    if exercise_started:
                        current_exercise_pos = we.position
                        current_set_pos = ps.position
                        current_set_phase = _derive_set_phase(ps, workout.events)
                        if current_set_phase == "set_in_progress":
                            current_set_started_at = _find_effective_set_started_at(
                                ps, workout.events
                            )
                        found_current = True

        if exercise_all_resolved and (exercise_completed > 0 or exercise_skipped_count > 0):
            last_resolved_exercise_pos = we.position

    if not found_current and last_resolved_exercise_pos is not None and not all_resolved:
        next_exercise = None
        for we in workout.exercises:
            if we.position > last_resolved_exercise_pos:
                next_exercise = we
                break
        if next_exercise is not None:
            transition_to_pos = next_exercise.position

    return {
        "total_set_count": total_sets,
        "completed_set_count": completed_sets,
        "skipped_set_count": skipped_sets,
        "all_sets_recorded": all_recorded,
        "all_sets_resolved": all_resolved,
        "current_exercise_position": current_exercise_pos,
        "current_set_position": current_set_pos,
        "current_set_phase": current_set_phase,
        "current_set_started_at": current_set_started_at,
        "transition_to_exercise_position": transition_to_pos,
    }


def _set_lifecycle_events(ps: WorkoutPlannedSet, events: list[WorkoutEvent]) -> list[WorkoutEvent]:
    return [
        event
        for event in events
        if event.workout_planned_set_id == ps.id
        or (
            event.event_type == "exercise_skipped"
            and event.workout_exercise_id == ps.workout_exercise_id
        )
    ]


def _derive_set_phase(ps: WorkoutPlannedSet, events: list[WorkoutEvent]) -> str:
    set_events = _set_lifecycle_events(ps, events)

    latest_start: WorkoutEvent | None = None
    latest_close: WorkoutEvent | None = None

    close_types = frozenset(
        {"set_completed", "set_marked_incomplete", "set_skipped", "exercise_skipped"}
    )

    for e in set_events:
        if e.event_type == "set_started":
            latest_start = e
        elif e.event_type in close_types:
            latest_close = e

    if latest_start is None:
        return "awaiting_set_start"

    if latest_close is None:
        return "set_in_progress"

    if latest_start.sequence > latest_close.sequence:
        return "set_in_progress"

    return "awaiting_set_start"


def _find_effective_set_started_at(
    ps: WorkoutPlannedSet, events: list[WorkoutEvent], completed_at: datetime.datetime | None = None
) -> str | None:
    set_events = sorted(_set_lifecycle_events(ps, events), key=lambda e: e.sequence)

    if completed_at is None:
        latest_start: WorkoutEvent | None = None
        for e in set_events:
            if e.event_type == "set_started":
                latest_start = e
            elif e.event_type in (
                "set_completed",
                "set_marked_incomplete",
                "set_skipped",
                "exercise_skipped",
            ):
                latest_start = None
        if latest_start is not None:
            return latest_start.occurred_at.isoformat()
        return None

    best_start: WorkoutEvent | None = None
    for e in set_events:
        if e.occurred_at > completed_at:
            break
        if e.event_type == "set_started":
            best_start = e
        elif e.event_type in ("set_marked_incomplete", "set_skipped", "exercise_skipped"):
            best_start = None

    if best_start is not None:
        return best_start.occurred_at.isoformat()
    return None


def _exercise_is_started(we: WorkoutExercise, events: list[WorkoutEvent]) -> bool:
    return any(
        e.event_type == "exercise_started" and e.workout_exercise_id == we.id for e in events
    )


def _derive_resume(progress: dict[str, Any], workout_id: int) -> str | None:
    if progress["all_sets_resolved"]:
        return f"/workouts/{workout_id}"
    if progress["transition_to_exercise_position"] is not None:
        previous_position = progress["transition_to_exercise_position"] - 1
        return f"/workouts/{workout_id}/exercises/{previous_position}"
    if progress["current_exercise_position"] is not None:
        return f"/workouts/{workout_id}/exercises/{progress['current_exercise_position']}"
    return f"/workouts/{workout_id}"


# ────────────────── response building ──────────────────


def _build_planned_set_response(
    ps: WorkoutPlannedSet,
    events: list[WorkoutEvent],
    active_exceptions: list[WorkoutException],
) -> dict[str, object]:
    tempo: dict[str, object] | None = None
    if (
        ps.eccentric_seconds is not None
        or ps.stretched_pause_seconds is not None
        or ps.concentric_seconds is not None
        or ps.peak_contraction_seconds is not None
    ):
        tempo = {
            "eccentric_seconds": ps.eccentric_seconds,
            "stretched_pause_seconds": ps.stretched_pause_seconds,
            "concentric_seconds": ps.concentric_seconds,
            "peak_contraction_seconds": ps.peak_contraction_seconds,
        }

    performance: dict[str, object] | None = None
    if ps.performed_set is not None:
        perf = ps.performed_set
        set_started_at: str | None = None
        observed_duration_seconds: int | None = None

        latest_start = _find_effective_set_started_at(ps, events, perf.completed_at)
        if latest_start is not None:
            set_started_at = latest_start
            start_dt = datetime.datetime.fromisoformat(latest_start)
            duration = (perf.completed_at - start_dt).total_seconds()
            observed_duration_seconds = max(0, int(duration))

        performance = {
            "performed_value": float(perf.performed_value),
            "performed_weight_kg": float(perf.performed_weight_kg)
            if perf.performed_weight_kg is not None
            else None,
            "performed_rir": perf.performed_rir,
            "entry_mode": perf.entry_mode,
            "set_started_at": set_started_at,
            "completed_at": perf.completed_at.isoformat(),
            "observed_duration_seconds": observed_duration_seconds,
            "updated_at": perf.updated_at.isoformat(),
        }

    exception: dict[str, object] | None = None
    exc = _get_exception_for_set(ps, active_exceptions)
    if exc is not None:
        exception = {
            "scope": exc.scope,
            "reason_code": exc.reason_code,
            "note": exc.note,
            "occurred_at": exc.occurred_at.isoformat(),
        }

    return {
        "position": ps.position,
        "target_value": float(ps.target_value),
        "target_weight_kg": float(ps.target_weight_kg) if ps.target_weight_kg is not None else None,
        "target_rir": ps.target_rir,
        "tempo": tempo,
        "rest_after_set_seconds": ps.rest_after_set_seconds,
        "notes": ps.notes,
        "performance": performance,
        "exception": exception,
    }


def _build_workout_response(workout: WorkoutSession) -> dict[str, object]:
    progress = _derive_progress(workout)
    server_now = datetime.datetime.utcnow()
    events = list(workout.events) if workout.events else []
    active_exceptions = _get_active_exceptions(workout)
    is_terminal = workout.status in ("completed", "cancelled")

    terminal_at = workout.completed_at if workout.status == "completed" else workout.cancelled_at
    duration_seconds: int | None = None
    if terminal_at is not None and workout.started_at is not None:
        duration_seconds = max(0, int((terminal_at - workout.started_at).total_seconds()))

    exercises: list[dict[str, object]] = []
    for we in workout.exercises:
        planned_sets = [
            _build_planned_set_response(ps, events, active_exceptions) for ps in we.planned_sets
        ]
        completed = sum(1 for ps in we.planned_sets if _is_set_performed(ps))
        skipped = sum(
            1
            for ps in we.planned_sets
            if not _is_set_performed(ps) and _is_set_skipped(ps, active_exceptions)
        )
        total = len(we.planned_sets)

        started_at: str | None = None
        completed_at: str | None = None
        started_evt = next(
            (
                e
                for e in events
                if e.event_type == "exercise_started" and e.workout_exercise_id == we.id
            ),
            None,
        )
        if started_evt is not None:
            started_at = started_evt.occurred_at.isoformat()

        resolving_types = frozenset(
            {"exercise_completed", "exercise_skipped", "set_completed", "set_skipped"}
        )
        resolving_events = sorted(
            [
                e
                for e in events
                if e.workout_exercise_id == we.id and e.event_type in resolving_types
            ],
            key=lambda e: e.occurred_at,
        )
        if resolving_events:
            completed_at = resolving_events[-1].occurred_at.isoformat()

        is_complete = completed == total

        is_resolved = True
        for ps in we.planned_sets:
            if not _is_set_resolved(ps, active_exceptions):
                is_resolved = False
                break

        execution_status: str
        exercise_exc = None
        for exc in active_exceptions:
            if exc.scope == "exercise" and exc.workout_exercise_id == we.id:
                exercise_exc = exc
                break

        any_started = _exercise_is_started(we, events)
        if is_resolved:
            if skipped == total:
                execution_status = "skipped"
            elif completed == total:
                execution_status = "completed"
            else:
                execution_status = "partial"
        elif any_started:
            execution_status = "in_progress"
        else:
            execution_status = "pending"

        exercise_exception: dict[str, object] | None = None
        if exercise_exc is not None:
            exercise_exception = {
                "scope": exercise_exc.scope,
                "reason_code": exercise_exc.reason_code,
                "note": exercise_exc.note,
                "occurred_at": exercise_exc.occurred_at.isoformat(),
            }

        exercises.append(
            {
                "position": we.position,
                "source_exercise_id": we.source_exercise_id,
                "exercise_slug": we.exercise_slug,
                "exercise_name": we.exercise_name,
                "target_type": we.target_type,
                "rest_after_exercise_seconds": we.rest_after_exercise_seconds,
                "notes": we.notes,
                "instructions": we.instructions,
                "started_at": started_at,
                "latest_completed_at": completed_at,
                "completed_set_count": completed,
                "skipped_set_count": skipped,
                "total_set_count": total,
                "is_complete": is_complete,
                "is_resolved": is_resolved,
                "execution_status": execution_status,
                "exception": exercise_exception,
                "planned_sets": planned_sets,
            }
        )

    timeline: list[dict[str, object]] = []
    for e in events:
        exercise_position = None
        set_position = None
        if e.workout_exercise_id is not None:
            for we in workout.exercises:
                if we.id == e.workout_exercise_id:
                    exercise_position = we.position
                    break
        if e.workout_planned_set_id is not None:
            for we in workout.exercises:
                for ps in we.planned_sets:
                    if ps.id == e.workout_planned_set_id:
                        set_position = ps.position
                        break

        event_exception: dict[str, object] | None = None
        if e.workout_exception_id is not None and e.exception is not None:
            event_exception = {
                "scope": e.exception.scope,
                "reason_code": e.exception.reason_code,
                "note": e.exception.note,
            }

        timeline.append(
            {
                "sequence": e.sequence,
                "event_type": e.event_type,
                "exercise_position": exercise_position,
                "set_position": set_position,
                "occurred_at": e.occurred_at.isoformat(),
                "exception": event_exception,
            }
        )

    resume_url = _derive_resume(progress, workout.id)

    return {
        "id": workout.id,
        "routine_name": workout.routine_name,
        "local_date": workout.local_date.isoformat(),
        "scheduled_week_position": workout.scheduled_week_position,
        "scheduled_slot_was_rest": bool(workout.scheduled_slot_was_rest),
        "scheduled_training_day_id": workout.scheduled_training_day_id,
        "scheduled_training_day_name": workout.scheduled_training_day_name,
        "selected_training_day_id": workout.selected_training_day_id,
        "selected_training_day_name": workout.selected_training_day_name,
        "selected_week_position": workout.selected_week_position,
        "selection_kind": workout.selection_kind,
        "status": workout.status,
        "started_at": workout.started_at.isoformat(),
        "cancelled_at": workout.cancelled_at.isoformat() if workout.cancelled_at else None,
        "completed_at": workout.completed_at.isoformat() if workout.completed_at else None,
        "duration_seconds": duration_seconds,
        "server_now": server_now.isoformat(),
        "completed_set_count": progress["completed_set_count"],
        "skipped_set_count": progress["skipped_set_count"],
        "total_set_count": progress["total_set_count"],
        "all_sets_recorded": progress["all_sets_recorded"],
        "all_sets_resolved": progress["all_sets_resolved"],
        "current_exercise_position": (
            None if is_terminal else progress["current_exercise_position"]
        ),
        "current_set_position": None if is_terminal else progress["current_set_position"],
        "current_set_phase": None if is_terminal else progress["current_set_phase"],
        "current_set_started_at": None if is_terminal else progress["current_set_started_at"],
        "transition_to_exercise_position": (
            None if is_terminal else progress["transition_to_exercise_position"]
        ),
        "resume_url": None if is_terminal else resume_url,
        "exercises": exercises,
        "events": timeline,
    }


# ────────────────── cancellation ──────────────────


def cancel_workout(session: Session, user_id: int, workout_id: int) -> WorkoutSession:
    workout = get_workout(session, user_id, workout_id)
    if workout is None:
        raise ValueError("Workout not found")

    if workout.status != "in_progress":
        raise ValueError("Workout is not in progress")

    now = datetime.datetime.utcnow()
    workout.status = "cancelled"
    workout.cancelled_at = now

    seq = _get_next_event_sequence(session, workout_id)
    _append_event(session, workout_id, seq, "workout_cancelled", now)

    active = session.query(ActiveWorkout).filter(ActiveWorkout.user_id == user_id).first()
    if active is not None and active.workout_session_id == workout_id:
        session.delete(active)

    session.commit()
    session.refresh(workout)
    return _load_workout_full(session, workout_id)


# ────────────────── completion ──────────────────


def complete_workout(session: Session, user_id: int, workout_id: int) -> WorkoutSession:
    workout = _get_active_workout_for_execution(session, user_id, workout_id)

    progress = _derive_progress(workout)
    if not progress["all_sets_resolved"]:
        raise ExecutionError("Workout has unresolved sets")

    now = datetime.datetime.utcnow()
    workout.status = "completed"
    workout.completed_at = now

    seq = _get_next_event_sequence(session, workout_id)
    _append_event(session, workout_id, seq, "workout_completed", now)

    active = session.query(ActiveWorkout).filter(ActiveWorkout.user_id == user_id).first()
    if active is not None and active.workout_session_id == workout_id:
        session.delete(active)

    session.commit()
    session.refresh(workout)
    return _load_workout_full(session, workout_id)


# ────────────────── exercise start ──────────────────


def start_exercise(
    session: Session, user_id: int, workout_id: int, exercise_position: int
) -> WorkoutSession:
    workout = _get_active_workout_for_execution(session, user_id, workout_id)

    we = _get_exercise_by_position(workout, exercise_position)
    if we is None:
        raise ExecutionError("Workout exercise not found")

    if _exercise_is_started(we, workout.events):
        raise ExecutionError("Exercise is already started")

    active_exceptions = _get_active_exceptions(workout)

    prev_exercises = [e for e in workout.exercises if e.position < exercise_position]
    for prev in prev_exercises:
        if not _exercise_is_fully_resolved(prev, active_exceptions):
            raise ExecutionError("Exercise cannot be started yet")

    earliest_unresolved = _earliest_unresolved_planned_set(we, active_exceptions)
    if earliest_unresolved is None:
        raise ExecutionError("Exercise has no incomplete sets")

    now = datetime.datetime.utcnow()
    seq = _get_next_event_sequence(session, workout_id)
    _append_event(session, workout_id, seq, "exercise_started", now, workout_exercise_id=we.id)
    _append_event(
        session,
        workout_id,
        seq + 1,
        "set_started",
        now,
        workout_exercise_id=we.id,
        workout_planned_set_id=earliest_unresolved.id,
    )
    session.commit()
    return _load_workout_full(session, workout_id)


# ────────────────── set start ──────────────────


def start_set(
    session: Session,
    user_id: int,
    workout_id: int,
    exercise_position: int,
    set_position: int,
) -> WorkoutSession:
    workout = _get_active_workout_for_execution(session, user_id, workout_id)

    we = _get_exercise_by_position(workout, exercise_position)
    if we is None:
        raise ExecutionError("Workout set not found")

    ps = _get_planned_set_by_position(we, set_position)
    if ps is None:
        raise ExecutionError("Workout set not found")

    if not _exercise_is_started(we, workout.events):
        raise ExecutionError("Exercise has not been started")

    if ps.performed_set is not None:
        raise ExecutionError("Workout set is already complete")

    active_exceptions = _get_active_exceptions(workout)
    if _is_set_skipped(ps, active_exceptions):
        raise ExecutionError("Workout set is already skipped")

    earliest = _earliest_unresolved_planned_set(we, active_exceptions)
    if earliest is None or ps.id != earliest.id:
        raise ExecutionError("Workout set is not current")

    phase = _derive_set_phase(ps, workout.events)
    if phase != "awaiting_set_start":
        raise ExecutionError("Workout set is already started")

    now = datetime.datetime.utcnow()
    seq = _get_next_event_sequence(session, workout_id)
    _append_event(
        session,
        workout_id,
        seq,
        "set_started",
        now,
        workout_exercise_id=we.id,
        workout_planned_set_id=ps.id,
    )
    session.commit()
    return _load_workout_full(session, workout_id)


def _earliest_unresolved_planned_set(
    we: WorkoutExercise,
    active_exceptions: list[WorkoutException],
) -> WorkoutPlannedSet | None:
    for ps in we.planned_sets:
        if not _is_set_resolved(ps, active_exceptions):
            return ps
    return None


def _exercise_is_fully_resolved(
    we: WorkoutExercise,
    active_exceptions: list[WorkoutException],
) -> bool:
    for ps in we.planned_sets:
        if not _is_set_resolved(ps, active_exceptions):
            return False
    return True


# ────────────────── set completion ──────────────────


def complete_set(
    session: Session,
    user_id: int,
    workout_id: int,
    exercise_position: int,
    set_position: int,
    entry_mode: str,
    performed_value: float | None = None,
    performed_weight_kg: float | None = None,
    performed_rir: int | None = None,
) -> WorkoutSession:
    workout = _get_active_workout_for_execution(session, user_id, workout_id)

    we = _get_exercise_by_position(workout, exercise_position)
    if we is None:
        raise ExecutionError("Workout set not found")

    ps = _get_planned_set_by_position(we, set_position)
    if ps is None:
        raise ExecutionError("Workout set not found")

    if not _exercise_is_started(we, workout.events):
        raise ExecutionError("Exercise has not been started")

    active_exceptions = _get_active_exceptions(workout)

    if _is_set_skipped(ps, active_exceptions):
        raise ExecutionError("Workout set is already skipped")

    now = datetime.datetime.utcnow()

    if entry_mode == "as_planned":
        perf_value = float(ps.target_value)
        perf_weight = float(ps.target_weight_kg) if ps.target_weight_kg is not None else None
        perf_rir = ps.target_rir
    else:
        if performed_value is None:
            raise ExecutionError("performed_value is required for adjusted entry")
        _validate_performed_value(we.target_type, performed_value)
        _validate_performed_weight(performed_weight_kg)
        _validate_performed_rir(performed_rir)
        perf_value = performed_value
        perf_weight = performed_weight_kg
        perf_rir = performed_rir

    if ps.performed_set is not None:
        performed = ps.performed_set
        performed.performed_value = perf_value
        performed.performed_weight_kg = perf_weight
        performed.performed_rir = perf_rir
        performed.entry_mode = entry_mode
        performed.updated_at = now

        seq = _get_next_event_sequence(session, workout_id)
        _append_event(
            session,
            workout_id,
            seq,
            "set_updated",
            now,
            workout_exercise_id=we.id,
            workout_planned_set_id=ps.id,
        )
        session.commit()
        return _load_workout_full(session, workout_id)

    earliest = _earliest_unresolved_planned_set(we, active_exceptions)
    if earliest is None or ps.id != earliest.id:
        raise ExecutionError("Workout set is not current")

    phase = _derive_set_phase(ps, workout.events)
    if phase != "set_in_progress":
        raise ExecutionError("Workout set has not been started")

    performed = PerformedSet(
        workout_planned_set_id=ps.id,
        performed_value=Decimal(str(perf_value)),
        performed_weight_kg=Decimal(str(perf_weight)) if perf_weight is not None else None,
        performed_rir=perf_rir,
        entry_mode=entry_mode,
        completed_at=now,
        updated_at=now,
    )
    session.add(performed)

    ps.performed_set = performed

    seq = _get_next_event_sequence(session, workout_id)
    _append_event(
        session,
        workout_id,
        seq,
        "set_completed",
        now,
        workout_exercise_id=we.id,
        workout_planned_set_id=ps.id,
    )

    if _exercise_is_complete(we):
        seq2 = seq + 1
        _append_event(
            session,
            workout_id,
            seq2,
            "exercise_completed",
            now,
            workout_exercise_id=we.id,
        )

    session.commit()
    return _load_workout_full(session, workout_id)


# ────────────────── mark incomplete ──────────────────


def mark_set_incomplete(
    session: Session,
    user_id: int,
    workout_id: int,
    exercise_position: int,
    set_position: int,
) -> WorkoutSession:
    workout = _get_active_workout_for_execution(session, user_id, workout_id)

    we = _get_exercise_by_position(workout, exercise_position)
    if we is None:
        raise ExecutionError("Workout set not found")

    ps = _get_planned_set_by_position(we, set_position)
    if ps is None:
        raise ExecutionError("Workout set not found")

    if ps.performed_set is None:
        raise ExecutionError("Workout set is already incomplete")

    now = datetime.datetime.utcnow()
    session.delete(ps.performed_set)

    seq = _get_next_event_sequence(session, workout_id)
    _append_event(
        session,
        workout_id,
        seq,
        "set_marked_incomplete",
        now,
        workout_exercise_id=we.id,
        workout_planned_set_id=ps.id,
    )

    session.commit()
    return _load_workout_full(session, workout_id)


# ────────────────── validation helpers ──────────────────


def _get_active_workout_for_execution(
    session: Session, user_id: int, workout_id: int
) -> WorkoutSession:
    workout = get_workout(session, user_id, workout_id)
    if workout is None:
        raise ExecutionError("Workout not found")
    if workout.status != "in_progress":
        raise ExecutionError("Workout is not active")
    active = session.query(ActiveWorkout).filter(ActiveWorkout.user_id == user_id).first()
    if active is None or active.workout_session_id != workout_id:
        raise ExecutionError("Workout is not active")
    return workout


def _get_exercise_by_position(workout: WorkoutSession, position: int) -> WorkoutExercise | None:
    for we in workout.exercises:
        if we.position == position:
            return we
    return None


def _get_planned_set_by_position(we: WorkoutExercise, position: int) -> WorkoutPlannedSet | None:
    for ps in we.planned_sets:
        if ps.position == position:
            return ps
    return None


def _exercise_is_complete(we: WorkoutExercise) -> bool:
    return all(ps.performed_set is not None for ps in we.planned_sets)


def _validate_performed_value(target_type: str, value: float) -> None:
    if target_type == "repetitions":
        if not isinstance(value, (int, float)) or value != int(value) or value < 1 or value > 1000:
            raise ExecutionError("Invalid performed repetitions")
    elif target_type == "duration_seconds":
        if not isinstance(value, (int, float)) or value != int(value) or value < 1 or value > 86400:
            raise ExecutionError("Invalid performed duration")
    elif target_type == "distance_meters":
        if value <= 0 or value > 100000:
            raise ExecutionError("Invalid performed distance")
        if round(value * 100) != value * 100:
            raise ExecutionError("Distance must have at most 2 decimal places")


def _validate_performed_weight(value: float | None) -> None:
    if value is not None:
        if value < 0 or value > 5000:
            raise ExecutionError("Invalid performed weight")
        if round(value * 100) != value * 100:
            raise ExecutionError("Weight must have at most 2 decimal places")


def _validate_performed_rir(value: int | None) -> None:
    if value is not None:
        if not isinstance(value, (int, float)) or value != int(value) or value < 0 or value > 10:
            raise ExecutionError("Invalid performed RIR")


# ────────────────── history (F18) ──────────────────

_HISTORY_CURSOR_VERSION = 1
_HISTORY_CURSOR_MAX_LENGTH = 512
_HISTORY_CURSOR_RE = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")

TERMINAL_STATUSES = ("completed", "cancelled")


def _encode_history_cursor(
    user_id: int, status: str | None, terminal_at: datetime.datetime, workout_id: int
) -> str:
    payload = {
        "v": _HISTORY_CURSOR_VERSION,
        "u": user_id,
        "s": status,
        "t": terminal_at.isoformat(),
        "i": workout_id,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(get_config().jwt_secret.encode("utf-8"), raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw + signature).decode("ascii").rstrip("=")


def _decode_history_cursor(
    token: str, user_id: int, status: str | None
) -> tuple[datetime.datetime, int]:
    if not token or len(token) > _HISTORY_CURSOR_MAX_LENGTH:
        raise HistoryError("Invalid cursor")
    if not _HISTORY_CURSOR_RE.fullmatch(token):
        raise HistoryError("Invalid cursor")
    padded = token + "=" * (-len(token) % 4)
    try:
        signed = base64.urlsafe_b64decode(padded.encode("ascii"))
    except (ValueError, UnicodeDecodeError):
        raise HistoryError("Invalid cursor") from None
    if len(signed) <= hashlib.sha256().digest_size:
        raise HistoryError("Invalid cursor")
    raw = signed[: -hashlib.sha256().digest_size]
    signature = signed[-hashlib.sha256().digest_size :]
    expected_signature = hmac.new(
        get_config().jwt_secret.encode("utf-8"), raw, hashlib.sha256
    ).digest()
    if not hmac.compare_digest(signature, expected_signature):
        raise HistoryError("Invalid cursor")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise HistoryError("Invalid cursor") from None
    if not isinstance(payload, dict) or set(payload.keys()) != {"v", "u", "s", "t", "i"}:
        raise HistoryError("Invalid cursor")
    if payload.get("v") != _HISTORY_CURSOR_VERSION:
        raise HistoryError("Invalid cursor")
    if payload.get("s") != status:
        raise HistoryError("Invalid cursor")
    cursor_user_id = payload.get("u")
    if (
        isinstance(cursor_user_id, bool)
        or not isinstance(cursor_user_id, int)
        or cursor_user_id != user_id
    ):
        raise HistoryError("Invalid cursor")
    workout_id = payload.get("i")
    if isinstance(workout_id, bool) or not isinstance(workout_id, int) or workout_id <= 0:
        raise HistoryError("Invalid cursor")
    terminal_token = payload.get("t")
    if not isinstance(terminal_token, str) or not terminal_token:
        raise HistoryError("Invalid cursor")
    try:
        terminal_at = datetime.datetime.fromisoformat(terminal_token)
    except ValueError:
        raise HistoryError("Invalid cursor") from None
    return terminal_at, workout_id


def _history_terminal(workout: WorkoutSession) -> datetime.datetime | None:
    return workout.completed_at if workout.status == "completed" else workout.cancelled_at


def _active_exception_ids(session: Session, workout_ids: list[int]) -> list[int]:
    skip_types = ("set_skipped", "exercise_skipped")
    revert_types = ("set_skip_reverted", "exercise_skip_reverted")
    rows = (
        session.query(WorkoutEvent.workout_exception_id)
        .filter(
            WorkoutEvent.workout_session_id.in_(workout_ids),
            WorkoutEvent.workout_exception_id.isnot(None),
        )
        .group_by(WorkoutEvent.workout_exception_id)
        .having(
            func.max(case((WorkoutEvent.event_type.in_(skip_types), 1), else_=0)) == 1,
            func.max(case((WorkoutEvent.event_type.in_(revert_types), 1), else_=0)) == 0,
        )
        .all()
    )
    return [row[0] for row in rows]


def _history_counts(session: Session, workout_ids: list[int]) -> dict[int, dict[str, int]]:
    result: dict[int, dict[str, int]] = {
        wid: {"total": 0, "performed": 0, "skipped": 0} for wid in workout_ids
    }
    if not workout_ids:
        return result

    total_performed = (
        session.query(
            WorkoutExercise.workout_session_id.label("wid"),
            func.count(WorkoutPlannedSet.id).label("total"),
            func.count(PerformedSet.id).label("performed"),
        )
        .join(WorkoutPlannedSet, WorkoutPlannedSet.workout_exercise_id == WorkoutExercise.id)
        .outerjoin(PerformedSet, PerformedSet.workout_planned_set_id == WorkoutPlannedSet.id)
        .filter(WorkoutExercise.workout_session_id.in_(workout_ids))
        .group_by(WorkoutExercise.workout_session_id)
        .all()
    )
    for wid, total, performed in total_performed:
        result[wid]["total"] = total
        result[wid]["performed"] = performed

    active_ids = _active_exception_ids(session, workout_ids)
    if active_ids:
        performed_exists = exists(
            select(PerformedSet.id).where(
                PerformedSet.workout_planned_set_id == WorkoutPlannedSet.id,
            )
        )
        set_exists = exists(
            select(WorkoutException.id).where(
                WorkoutException.scope == "set",
                WorkoutException.workout_planned_set_id == WorkoutPlannedSet.id,
                WorkoutException.id.in_(active_ids),
            )
        )
        exercise_exists = exists(
            select(WorkoutException.id).where(
                WorkoutException.scope == "exercise",
                WorkoutException.workout_exercise_id == WorkoutExercise.id,
                WorkoutException.id.in_(active_ids),
            )
        )
        skipped_rows = (
            session.query(
                WorkoutExercise.workout_session_id.label("wid"),
                func.count(func.distinct(WorkoutPlannedSet.id)).label("skipped"),
            )
            .join(WorkoutPlannedSet, WorkoutPlannedSet.workout_exercise_id == WorkoutExercise.id)
            .filter(
                WorkoutExercise.workout_session_id.in_(workout_ids),
                or_(set_exists, exercise_exists),
                ~performed_exists,
            )
            .group_by(WorkoutExercise.workout_session_id)
            .all()
        )
        for wid, skipped in skipped_rows:
            result[wid]["skipped"] = skipped

    return result


def _build_history_item(workout: WorkoutSession, counts: dict[str, int]) -> dict[str, object]:
    terminal_at = _history_terminal(workout)
    duration_seconds = 0
    if terminal_at is not None and workout.started_at is not None:
        duration_seconds = max(0, int((terminal_at - workout.started_at).total_seconds()))

    total = counts.get("total", 0)
    performed = counts.get("performed", 0)
    skipped = counts.get("skipped", 0)
    unresolved = max(0, total - performed - skipped)

    return {
        "id": workout.id,
        "routine_name": workout.routine_name,
        "selected_training_day_name": workout.selected_training_day_name,
        "local_date": workout.local_date.isoformat(),
        "status": workout.status,
        "selection_kind": workout.selection_kind,
        "started_at": workout.started_at.isoformat(),
        "terminal_at": terminal_at.isoformat() if terminal_at is not None else None,
        "duration_seconds": duration_seconds,
        "completed_set_count": performed,
        "skipped_set_count": skipped,
        "unresolved_set_count": unresolved,
        "total_set_count": total,
    }


def list_workout_history(
    session: Session,
    user_id: int,
    status_filter: str | None,
    cursor: str | None,
    limit: int,
) -> dict[str, object]:
    terminal = func.coalesce(WorkoutSession.completed_at, WorkoutSession.cancelled_at)
    query = session.query(WorkoutSession).filter(WorkoutSession.user_id == user_id)
    if status_filter is not None:
        query = query.filter(WorkoutSession.status == status_filter)
    else:
        query = query.filter(WorkoutSession.status.in_(TERMINAL_STATUSES))

    if cursor is not None:
        cursor_terminal, cursor_id = _decode_history_cursor(cursor, user_id, status_filter)
        query = query.filter(
            or_(
                terminal < cursor_terminal,
                and_(terminal == cursor_terminal, WorkoutSession.id < cursor_id),
            )
        )

    rows = query.order_by(terminal.desc(), WorkoutSession.id.desc()).limit(limit + 1).all()

    has_more = len(rows) > limit
    page_rows = rows[:limit]

    counts = _history_counts(session, [row.id for row in page_rows])
    items = [_build_history_item(workout, counts.get(workout.id, {})) for workout in page_rows]

    next_cursor: str | None = None
    if has_more:
        last = page_rows[-1]
        last_terminal = _history_terminal(last)
        if last_terminal is not None:
            next_cursor = _encode_history_cursor(user_id, status_filter, last_terminal, last.id)

    return {"items": items, "next_cursor": next_cursor}
