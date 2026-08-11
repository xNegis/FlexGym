"""Exercise catalog domain operations: listing and lookup."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Exercise

MUSCLE_GROUP_VALUES = {
    "chest",
    "lats",
    "upper_back",
    "shoulders",
    "biceps",
    "triceps",
    "forearms",
    "quadriceps",
    "hamstrings",
    "glutes",
    "adductors",
    "calves",
    "core",
    "full_body",
}

EQUIPMENT_VALUES = {
    "bodyweight",
    "barbell",
    "dumbbell",
    "kettlebell",
    "cable",
    "machine",
    "resistance_band",
    "pull_up_bar",
}

MAX_SEARCH_LENGTH = 100


def list_exercises(
    session: Session,
    search: str | None = None,
    primary_muscle: str | None = None,
    equipment: str | None = None,
) -> list[Exercise]:
    query = session.query(Exercise)

    if search is not None:
        trimmed = search.strip()
        if trimmed:
            query = query.filter(Exercise.name.ilike(f"%{trimmed}%"))

    if primary_muscle is not None:
        query = query.filter(Exercise.primary_muscle == primary_muscle)

    if equipment is not None:
        query = query.filter(Exercise.equipment == equipment)

    return query.order_by(
        Exercise.name.collate("NOCASE").asc(),
        Exercise.slug.asc(),
    ).all()


def get_exercise_by_slug(session: Session, slug: str) -> Exercise | None:
    return session.query(Exercise).filter(Exercise.slug == slug).first()
