"""Workout domain operations: start context, start, execution, cancel."""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import (
    ActiveRoutine,
    ActiveWorkout,
    ExerciseConfiguration,
    PerformedSet,
    Routine,
    RoutineScheduleAssignment,
    TrainingDay,
    WorkoutEvent,
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
) -> WorkoutEvent:
    event = WorkoutEvent(
        workout_session_id=workout_id,
        sequence=sequence,
        event_type=event_type,
        workout_exercise_id=workout_exercise_id,
        workout_planned_set_id=workout_planned_set_id,
        occurred_at=occurred_at,
    )
    session.add(event)
    return event


# ────────────────── progress derivation ──────────────────


def _derive_progress(workout: WorkoutSession) -> dict[str, Any]:
    total_sets = 0
    completed_sets = 0
    all_recorded = True
    current_exercise_pos: int | None = None
    current_set_pos: int | None = None
    current_set_phase: str | None = None
    current_set_started_at: str | None = None
    transition_to_pos: int | None = None
    found_current = False
    last_complete_exercise_pos: int | None = None

    for we in workout.exercises:
        exercise_completed = 0
        all_sets_recorded = True

        for ps in we.planned_sets:
            total_sets += 1
            if ps.performed_set is not None:
                completed_sets += 1
                exercise_completed += 1
            else:
                all_sets_recorded = False
                all_recorded = False
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

        if all_sets_recorded and exercise_completed > 0:
            last_complete_exercise_pos = we.position

    if not found_current and last_complete_exercise_pos is not None and not all_recorded:
        next_exercise = None
        for we in workout.exercises:
            if we.position > last_complete_exercise_pos:
                next_exercise = we
                break
        if next_exercise is not None:
            transition_to_pos = next_exercise.position

    total_count = total_sets
    completed_count = completed_sets

    return {
        "total_set_count": total_count,
        "completed_set_count": completed_count,
        "all_sets_recorded": all_recorded,
        "current_exercise_position": current_exercise_pos,
        "current_set_position": current_set_pos,
        "current_set_phase": current_set_phase,
        "current_set_started_at": current_set_started_at,
        "transition_to_exercise_position": transition_to_pos,
    }


def _derive_set_phase(
    ps: WorkoutPlannedSet, events: list[WorkoutEvent]
) -> str:
    set_events = [e for e in events if e.workout_planned_set_id == ps.id]

    latest_start: WorkoutEvent | None = None
    latest_close: WorkoutEvent | None = None

    for e in set_events:
        if e.event_type == "set_started":
            latest_start = e
        elif e.event_type in ("set_completed", "set_marked_incomplete"):
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
    set_events = sorted(
        [e for e in events if e.workout_planned_set_id == ps.id],
        key=lambda e: e.occurred_at,
    )

    if completed_at is None:
        latest_start: WorkoutEvent | None = None
        for e in set_events:
            if e.event_type == "set_started":
                latest_start = e
            elif e.event_type in ("set_completed", "set_marked_incomplete"):
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
        elif e.event_type == "set_marked_incomplete":
            best_start = None

    if best_start is not None:
        return best_start.occurred_at.isoformat()
    return None


def _exercise_is_started(we: WorkoutExercise, events: list[WorkoutEvent]) -> bool:
    return any(
        e.event_type == "exercise_started" and e.workout_exercise_id == we.id for e in events
    )


def _derive_resume(progress: dict[str, Any], workout_id: int) -> str | None:
    if progress["all_sets_recorded"]:
        return f"/workouts/{workout_id}"
    if progress["transition_to_exercise_position"] is not None:
        previous_position = progress["transition_to_exercise_position"] - 1
        return f"/workouts/{workout_id}/exercises/{previous_position}"
    if progress["current_exercise_position"] is not None:
        return f"/workouts/{workout_id}/exercises/{progress['current_exercise_position']}"
    return f"/workouts/{workout_id}"


# ────────────────── response building ──────────────────


def _build_planned_set_response(
    ps: WorkoutPlannedSet, events: list[WorkoutEvent]
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
            duration = (perf.completed_at - datetime.datetime.fromisoformat(latest_start)).total_seconds()
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

    return {
        "position": ps.position,
        "target_value": float(ps.target_value),
        "target_weight_kg": float(ps.target_weight_kg) if ps.target_weight_kg is not None else None,
        "target_rir": ps.target_rir,
        "tempo": tempo,
        "rest_after_set_seconds": ps.rest_after_set_seconds,
        "notes": ps.notes,
        "performance": performance,
    }


def _build_workout_response(workout: WorkoutSession) -> dict[str, object]:
    progress = _derive_progress(workout)
    server_now = datetime.datetime.utcnow()
    events = list(workout.events) if workout.events else []

    exercises: list[dict[str, object]] = []
    for we in workout.exercises:
        planned_sets = [_build_planned_set_response(ps, events) for ps in we.planned_sets]
        completed = sum(1 for ps in we.planned_sets if ps.performed_set is not None)
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
        completed_evts = sorted(
            [
                e
                for e in events
                if e.event_type == "exercise_completed" and e.workout_exercise_id == we.id
            ],
            key=lambda e: e.occurred_at,
        )
        if completed_evts:
            completed_at = completed_evts[-1].occurred_at.isoformat()

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
                "total_set_count": total,
                "is_complete": completed == total,
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

        timeline.append(
            {
                "sequence": e.sequence,
                "event_type": e.event_type,
                "exercise_position": exercise_position,
                "set_position": set_position,
                "occurred_at": e.occurred_at.isoformat(),
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
        "server_now": server_now.isoformat(),
        "completed_set_count": progress["completed_set_count"],
        "total_set_count": progress["total_set_count"],
        "all_sets_recorded": progress["all_sets_recorded"],
        "current_exercise_position": progress["current_exercise_position"],
        "current_set_position": progress["current_set_position"],
        "current_set_phase": progress["current_set_phase"],
        "current_set_started_at": progress["current_set_started_at"],
        "transition_to_exercise_position": progress["transition_to_exercise_position"],
        "resume_url": resume_url,
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

    prev_exercises = [e for e in workout.exercises if e.position < exercise_position]
    for prev in prev_exercises:
        if not _exercise_is_complete(prev):
            raise ExecutionError("Exercise cannot be started yet")

    earliest_incomplete = _earliest_incomplete_planned_set(we)
    if earliest_incomplete is None:
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
        workout_planned_set_id=earliest_incomplete.id,
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

    earliest = _earliest_incomplete_planned_set(we)
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


def _earliest_incomplete_planned_set(we: WorkoutExercise) -> WorkoutPlannedSet | None:
    for ps in we.planned_sets:
        if ps.performed_set is None:
            return ps
    return None


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

    _validate_current_set(we, set_position)

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


def _validate_current_set(we: WorkoutExercise, set_position: int) -> None:
    earliest_incomplete = None
    for ps in we.planned_sets:
        if ps.performed_set is None:
            earliest_incomplete = ps.position
            break
    if earliest_incomplete is None or set_position != earliest_incomplete:
        raise ExecutionError("Workout set is not current")


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
