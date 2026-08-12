"""Workout domain operations: start context, start, resume, cancel."""

from __future__ import annotations

import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import (
    ActiveRoutine,
    ActiveWorkout,
    ExerciseConfiguration,
    Routine,
    RoutineScheduleAssignment,
    TrainingDay,
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
    return {
        "id": workout.id,
        "routine_name": workout.routine_name,
        "selected_training_day_name": workout.selected_training_day_name,
        "local_date": workout.local_date.isoformat(),
        "started_at": workout.started_at.isoformat(),
        "status": workout.status,
        "selection_kind": workout.selection_kind,
    }


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
        return {
            "state": "active_workout",
            "workout": _active_workout_summary(active_workout.workout),
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
        .options(
            selectinload(ActiveRoutine.routine),
        )
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
    return workout


def _build_workout_response(workout: WorkoutSession) -> dict[str, object]:
    exercises: list[dict[str, object]] = []
    for we in workout.exercises:
        planned_sets: list[dict[str, object]] = []
        for ps in we.planned_sets:
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
            planned_sets.append(
                {
                    "position": ps.position,
                    "target_value": float(ps.target_value),
                    "target_weight_kg": float(ps.target_weight_kg)
                    if ps.target_weight_kg is not None
                    else None,
                    "target_rir": ps.target_rir,
                    "tempo": tempo,
                    "rest_after_set_seconds": ps.rest_after_set_seconds,
                    "notes": ps.notes,
                }
            )
        exercises.append(
            {
                "position": we.position,
                "source_exercise_id": we.source_exercise_id,
                "exercise_slug": we.exercise_slug,
                "exercise_name": we.exercise_name,
                "target_type": we.target_type,
                "rest_after_exercise_seconds": we.rest_after_exercise_seconds,
                "notes": we.notes,
                "planned_sets": planned_sets,
            }
        )

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
        "exercises": exercises,
    }


def get_active_workout(session: Session, user_id: int) -> WorkoutSession | None:
    active = (
        session.query(ActiveWorkout)
        .options(
            selectinload(ActiveWorkout.workout)
            .selectinload(WorkoutSession.exercises)
            .selectinload(WorkoutExercise.planned_sets),
        )
        .filter(ActiveWorkout.user_id == user_id)
        .first()
    )
    return active.workout if active else None


def get_workout(session: Session, user_id: int, workout_id: int) -> WorkoutSession | None:
    return (
        session.query(WorkoutSession)
        .options(
            selectinload(WorkoutSession.exercises).selectinload(WorkoutExercise.planned_sets),
        )
        .filter(
            WorkoutSession.id == workout_id,
            WorkoutSession.user_id == user_id,
        )
        .first()
    )


def cancel_workout(session: Session, user_id: int, workout_id: int) -> WorkoutSession:
    workout = get_workout(session, user_id, workout_id)
    if workout is None:
        raise ValueError("Workout not found")

    if workout.status != "in_progress":
        raise ValueError("Workout is not in progress")

    workout.status = "cancelled"
    workout.cancelled_at = datetime.datetime.utcnow()

    active = session.query(ActiveWorkout).filter(ActiveWorkout.user_id == user_id).first()
    if active is not None and active.workout_session_id == workout_id:
        session.delete(active)

    session.commit()
    session.refresh(workout)
    return workout
