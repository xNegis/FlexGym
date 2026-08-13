"""Exercise configuration domain operations: list, create, update, reorder, and delete."""

from __future__ import annotations

import datetime
import math
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    ConfiguredSet,
    Exercise,
    ExerciseConfiguration,
    TrainingDay,
)
from app.services.routine_service import _require_routine

TARGET_TYPES = {"repetitions", "duration_seconds", "distance_meters"}
MAX_EXERCISES_PER_DAY = 20
MAX_SETS_PER_EXERCISE = 20


class ExerciseConfigurationNotFoundError(Exception):
    pass


class ExerciseNotFoundError(Exception):
    pass


class DuplicateExerciseError(Exception):
    pass


class ExerciseConfigurationLimitError(Exception):
    pass


class ExerciseConfigurationOrderError(Exception):
    pass


def _require_training_day(session: Session, routine_id: int, day_id: int) -> TrainingDay:
    day = (
        session.query(TrainingDay)
        .filter(TrainingDay.id == day_id, TrainingDay.routine_id == routine_id)
        .first()
    )
    if day is None:
        raise ExerciseConfigurationNotFoundError("Training day not found")
    return day


def _require_config(
    session: Session, training_day_id: int, config_id: int
) -> ExerciseConfiguration:
    config = (
        session.query(ExerciseConfiguration)
        .filter(
            ExerciseConfiguration.id == config_id,
            ExerciseConfiguration.training_day_id == training_day_id,
        )
        .first()
    )
    if config is None:
        raise ExerciseConfigurationNotFoundError("Configured exercise not found")
    return config


def _refresh_parent_timestamps(session: Session, training_day: TrainingDay) -> None:
    training_day.updated_at = datetime.datetime.utcnow()
    session.add(training_day)
    routine = training_day.routine
    routine.updated_at = datetime.datetime.utcnow()
    session.add(routine)


def _compact_exercise_positions(session: Session, training_day_id: int) -> None:
    remaining = (
        session.query(ExerciseConfiguration)
        .filter(ExerciseConfiguration.training_day_id == training_day_id)
        .order_by(ExerciseConfiguration.position.asc())
        .all()
    )
    for i, config in enumerate(remaining):
        config.position = i + 1


def _validate_target_value(target_type: str, value: float) -> None:
    if not math.isfinite(value):
        raise ValueError("Target values must be finite numbers")
    if target_type == "repetitions":
        if value != int(value):
            raise ValueError("Repetition targets must be whole numbers")
        if not 1 <= value <= 1000:
            raise ValueError("Repetition targets must be 1-1000")
    elif target_type == "duration_seconds":
        if value != int(value):
            raise ValueError("Duration targets must be whole seconds")
        if not 1 <= value <= 86400:
            raise ValueError("Duration targets must be 1-86400")
    elif target_type == "distance_meters":
        decimal_value = Decimal(str(value))
        if decimal_value != decimal_value.quantize(Decimal("0.01")):
            raise ValueError("Distance targets must have at most two decimal places")
        if not 0 < value <= 100000:
            raise ValueError("Distance targets must be 0.01-100000")


def _validate_tempo(
    eccentric: int | None,
    stretched: int | None,
    concentric: int | None,
    peak: int | None,
) -> None:
    components = [eccentric, stretched, concentric, peak]
    present = [c for c in components if c is not None]
    absent = [c for c in components if c is None]
    if present and absent:
        raise ValueError("All four tempo components must be provided together or all absent")
    if present:
        for c in present:
            if not 0 <= c <= 60:
                raise ValueError("Tempo components must be 0-60")
        if all(c == 0 for c in present):
            raise ValueError("At least one tempo component must be greater than zero")


def _build_set_records(
    session: Session,
    config: ExerciseConfiguration,
    sets_data: list[dict[str, Any]],
) -> None:
    session.query(ConfiguredSet).filter(
        ConfiguredSet.exercise_configuration_id == config.id
    ).delete()
    session.flush()

    for i, set_data in enumerate(sets_data):
        position = i + 1
        target_value = set_data["target_value"]
        _validate_target_value(config.target_type, target_value)

        weight = set_data.get("target_weight_kg")
        if weight is not None:
            if not math.isfinite(weight):
                raise ValueError("Target weight must be a finite number")
            if not 0 <= weight <= 5000:
                raise ValueError("Target weight must be 0-5000 kg")
            weight_decimal = Decimal(str(weight))
            if weight_decimal != weight_decimal.quantize(Decimal("0.01")):
                raise ValueError("Target weight must have at most two decimal places")

        rir = set_data.get("target_rir")
        if rir is not None and not (0 <= rir <= 10 and rir == int(rir)):
            raise ValueError("Target RIR must be 0-10")

        tempo = set_data.get("tempo")
        eccentric = None
        stretched = None
        concentric = None
        peak = None
        if tempo is not None:
            eccentric = tempo.get("eccentric_seconds")
            stretched = tempo.get("stretched_pause_seconds")
            concentric = tempo.get("concentric_seconds")
            peak = tempo.get("peak_contraction_seconds")
            _validate_tempo(eccentric, stretched, concentric, peak)

        rest = set_data.get("rest_after_set_seconds")
        if rest is not None and not (0 <= rest <= 3600 and rest == int(rest)):
            raise ValueError("Set rest must be 0-3600 seconds")

        notes = set_data.get("notes")
        if isinstance(notes, str):
            trimmed = notes.strip()
            if not trimmed:
                notes = None
            elif len(trimmed) > 500:
                raise ValueError("Set notes must not exceed 500 characters")
            else:
                notes = trimmed
        else:
            notes = None

        configured_set = ConfiguredSet(
            exercise_configuration_id=config.id,
            position=position,
            target_value=Decimal(str(target_value)),
            target_weight_kg=Decimal(str(weight)) if weight is not None else None,
            target_rir=rir,
            eccentric_seconds=eccentric,
            stretched_pause_seconds=stretched,
            concentric_seconds=concentric,
            peak_contraction_seconds=peak,
            rest_after_set_seconds=rest,
            notes=notes,
        )
        session.add(configured_set)


def _configured_set_out(s: ConfiguredSet) -> dict[str, object]:
    tempo = None
    tempo_components = [
        s.eccentric_seconds,
        s.stretched_pause_seconds,
        s.concentric_seconds,
        s.peak_contraction_seconds,
    ]
    if all(tc is not None for tc in tempo_components):
        tempo = {
            "eccentric_seconds": s.eccentric_seconds,
            "stretched_pause_seconds": s.stretched_pause_seconds,
            "concentric_seconds": s.concentric_seconds,
            "peak_contraction_seconds": s.peak_contraction_seconds,
        }

    return {
        "position": s.position,
        "target_value": float(s.target_value),
        "target_weight_kg": float(s.target_weight_kg) if s.target_weight_kg is not None else None,
        "target_rir": s.target_rir,
        "tempo": tempo,
        "rest_after_set_seconds": s.rest_after_set_seconds,
        "notes": s.notes,
    }


def _exercise_config_out(config: ExerciseConfiguration) -> dict[str, object]:
    exercise = config.exercise
    return {
        "id": config.id,
        "position": config.position,
        "exercise": {
            "slug": exercise.slug,
            "name": exercise.name,
            "primary_muscle": exercise.primary_muscle,
            "secondary_muscles": exercise.secondary_muscles,
            "equipment": exercise.equipment,
            "movement_pattern": exercise.movement_pattern,
            "execution_type": exercise.execution_type,
        },
        "target_type": config.target_type,
        "rest_after_exercise_seconds": config.rest_after_exercise_seconds,
        "notes": config.notes,
        "sets": [_configured_set_out(s) for s in config.configured_sets],
        "created_at": config.created_at.isoformat(),
        "updated_at": config.updated_at.isoformat(),
    }


def list_exercise_configs(
    session: Session, routine_id: int, user_id: int, day_id: int
) -> list[dict[str, object]]:
    _require_routine(session, routine_id, user_id)
    _require_training_day(session, routine_id, day_id)

    configs = (
        session.query(ExerciseConfiguration)
        .filter(ExerciseConfiguration.training_day_id == day_id)
        .order_by(ExerciseConfiguration.position.asc(), ExerciseConfiguration.id.asc())
        .all()
    )
    return [_exercise_config_out(c) for c in configs]


def create_exercise_config(
    session: Session,
    routine_id: int,
    user_id: int,
    day_id: int,
    exercise_slug: str,
    target_type: str,
    rest_after_exercise_seconds: int | None,
    notes: str | None,
    sets_data: list[dict[str, Any]],
) -> dict[str, object]:
    _require_routine(session, routine_id, user_id)
    day = _require_training_day(session, routine_id, day_id)

    if target_type not in TARGET_TYPES:
        raise ValueError(f"target_type must be one of: {', '.join(sorted(TARGET_TYPES))}")

    if not sets_data:
        raise ValueError("At least one set is required")
    if len(sets_data) > MAX_SETS_PER_EXERCISE:
        raise ValueError("An exercise may have at most 20 sets")

    exercise = session.query(Exercise).filter(Exercise.slug == exercise_slug).first()
    if exercise is None:
        raise ExerciseNotFoundError("Exercise not found")

    existing = (
        session.query(ExerciseConfiguration)
        .filter(
            ExerciseConfiguration.training_day_id == day_id,
            ExerciseConfiguration.exercise_id == exercise.id,
        )
        .first()
    )
    if existing is not None:
        raise DuplicateExerciseError("Exercise is already configured for this training day")

    count = (
        session.query(ExerciseConfiguration)
        .filter(ExerciseConfiguration.training_day_id == day_id)
        .count()
    )
    if count >= MAX_EXERCISES_PER_DAY:
        raise ExerciseConfigurationLimitError("Training day already has 20 exercises")

    if rest_after_exercise_seconds is not None:
        if not 0 <= rest_after_exercise_seconds <= 3600:
            raise ValueError("Exercise rest must be 0-3600 seconds")
        if rest_after_exercise_seconds != int(rest_after_exercise_seconds):
            raise ValueError("Exercise rest must be a whole number of seconds")

    if isinstance(notes, str):
        trimmed = notes.strip()
        if not trimmed:
            notes = None
        elif len(trimmed) > 1000:
            raise ValueError("Exercise notes must not exceed 1000 characters")
        else:
            notes = trimmed
    else:
        notes = None

    created_at = datetime.datetime.utcnow()
    config = ExerciseConfiguration(
        training_day_id=day_id,
        exercise_id=exercise.id,
        position=count + 1,
        target_type=target_type,
        rest_after_exercise_seconds=rest_after_exercise_seconds,
        notes=notes,
        created_at=created_at,
        updated_at=created_at,
    )
    session.add(config)
    session.flush()

    _build_set_records(session, config, sets_data)

    _refresh_parent_timestamps(session, day)
    session.commit()
    session.refresh(config)
    return _exercise_config_out(config)


def update_exercise_config(
    session: Session,
    routine_id: int,
    user_id: int,
    day_id: int,
    config_id: int,
    target_type: str,
    rest_after_exercise_seconds: int | None,
    notes: str | None,
    sets_data: list[dict[str, Any]],
) -> dict[str, object]:
    _require_routine(session, routine_id, user_id)
    day = _require_training_day(session, routine_id, day_id)
    config = _require_config(session, day_id, config_id)

    if target_type not in TARGET_TYPES:
        raise ValueError(f"target_type must be one of: {', '.join(sorted(TARGET_TYPES))}")

    if not sets_data:
        raise ValueError("At least one set is required")
    if len(sets_data) > MAX_SETS_PER_EXERCISE:
        raise ValueError("An exercise may have at most 20 sets")

    if rest_after_exercise_seconds is not None:
        if not 0 <= rest_after_exercise_seconds <= 3600:
            raise ValueError("Exercise rest must be 0-3600 seconds")
        if rest_after_exercise_seconds != int(rest_after_exercise_seconds):
            raise ValueError("Exercise rest must be a whole number of seconds")

    if isinstance(notes, str):
        trimmed = notes.strip()
        if not trimmed:
            notes = None
        elif len(trimmed) > 1000:
            raise ValueError("Exercise notes must not exceed 1000 characters")
        else:
            notes = trimmed
    else:
        notes = None

    config.target_type = target_type
    config.rest_after_exercise_seconds = rest_after_exercise_seconds
    config.notes = notes
    config.updated_at = datetime.datetime.utcnow()

    _build_set_records(session, config, sets_data)

    _refresh_parent_timestamps(session, day)
    session.commit()
    session.refresh(config)
    return _exercise_config_out(config)


def reorder_exercise_configs(
    session: Session,
    routine_id: int,
    user_id: int,
    day_id: int,
    config_ids: list[int],
) -> list[dict[str, object]]:
    _require_routine(session, routine_id, user_id)
    day = _require_training_day(session, routine_id, day_id)

    existing = (
        session.query(ExerciseConfiguration)
        .filter(ExerciseConfiguration.training_day_id == day_id)
        .order_by(ExerciseConfiguration.position.asc())
        .all()
    )

    existing_ids = {c.id for c in existing}
    if len(config_ids) != len(existing_ids) or set(config_ids) != existing_ids:
        raise ExerciseConfigurationOrderError(
            "Exercise order must contain every configured exercise exactly once"
        )

    id_to_config = {c.id: c for c in existing}

    for i, config_id in enumerate(config_ids):
        id_to_config[config_id].position = -(i + 1)

    session.flush()

    for i, config_id in enumerate(config_ids):
        id_to_config[config_id].position = i + 1

    _refresh_parent_timestamps(session, day)
    session.commit()

    configs = (
        session.query(ExerciseConfiguration)
        .filter(ExerciseConfiguration.training_day_id == day_id)
        .order_by(ExerciseConfiguration.position.asc(), ExerciseConfiguration.id.asc())
        .all()
    )
    return [_exercise_config_out(c) for c in configs]


def delete_exercise_config(
    session: Session,
    routine_id: int,
    user_id: int,
    day_id: int,
    config_id: int,
) -> None:
    _require_routine(session, routine_id, user_id)
    day = _require_training_day(session, routine_id, day_id)
    config = _require_config(session, day_id, config_id)

    session.delete(config)
    session.flush()

    _compact_exercise_positions(session, day_id)

    _refresh_parent_timestamps(session, day)
    session.commit()
