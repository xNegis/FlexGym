"""Fitness profile domain operations: retrieval, creation, update, and deletion."""

from __future__ import annotations

import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import FitnessProfile


class ProfileAlreadyExistsError(Exception):
    pass


class ProfileNotFoundError(Exception):
    pass


def get_fitness_profile(session: Session, user_id: int) -> FitnessProfile | None:
    return session.query(FitnessProfile).filter(FitnessProfile.user_id == user_id).first()


def _require_profile(session: Session, user_id: int) -> FitnessProfile:
    profile = get_fitness_profile(session, user_id)
    if profile is None:
        raise ProfileNotFoundError("Fitness profile not found")
    return profile


def create_fitness_profile(
    session: Session,
    user_id: int,
    date_of_birth: datetime.date,
    biological_sex: str,
    height_cm: float,
    weight_kg: float,
    body_fat_percentage: float | None,
    training_experience: str,
    primary_goal: str,
    training_days_per_week: int,
    preferred_workout_duration_minutes: int,
    training_environment: str,
    physical_limitations: str | None,
) -> FitnessProfile:
    existing = get_fitness_profile(session, user_id)
    if existing is not None:
        raise ProfileAlreadyExistsError("Fitness profile already exists")

    profile = FitnessProfile(
        user_id=user_id,
        date_of_birth=date_of_birth,
        biological_sex=biological_sex,
        height_cm=height_cm,
        weight_kg=weight_kg,
        body_fat_percentage=body_fat_percentage,
        training_experience=training_experience,
        primary_goal=primary_goal,
        training_days_per_week=training_days_per_week,
        preferred_workout_duration_minutes=preferred_workout_duration_minutes,
        training_environment=training_environment,
        physical_limitations=physical_limitations,
    )
    session.add(profile)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise ProfileAlreadyExistsError("Fitness profile already exists") from exc
    session.refresh(profile)
    return profile


def update_fitness_profile(
    session: Session,
    user_id: int,
    date_of_birth: datetime.date,
    biological_sex: str,
    height_cm: float,
    weight_kg: float,
    body_fat_percentage: float | None,
    training_experience: str,
    primary_goal: str,
    training_days_per_week: int,
    preferred_workout_duration_minutes: int,
    training_environment: str,
    physical_limitations: str | None,
) -> FitnessProfile:
    profile = _require_profile(session, user_id)

    profile.date_of_birth = date_of_birth
    profile.biological_sex = biological_sex
    profile.height_cm = height_cm
    profile.weight_kg = weight_kg
    profile.body_fat_percentage = body_fat_percentage
    profile.training_experience = training_experience
    profile.primary_goal = primary_goal
    profile.training_days_per_week = training_days_per_week
    profile.preferred_workout_duration_minutes = preferred_workout_duration_minutes
    profile.training_environment = training_environment
    profile.physical_limitations = physical_limitations

    session.commit()
    session.refresh(profile)
    return profile


def delete_fitness_profile(session: Session, user_id: int) -> None:
    profile = _require_profile(session, user_id)
    session.delete(profile)
    session.commit()
