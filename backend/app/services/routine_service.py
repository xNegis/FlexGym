"""Routine domain operations: creation, listing, lookup, update, and deletion."""

from __future__ import annotations

import unicodedata

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import Routine

OBJECTIVE_VALUES = {"build_muscle", "lose_fat", "increase_strength", "general_fitness"}


class RoutineNameConflictError(Exception):
    pass


class RoutineNotFoundError(Exception):
    pass


def _normalize_name(name: str) -> str:
    return unicodedata.normalize("NFKC", name.strip().casefold())


def _sanitize_description(description: str | None) -> str | None:
    if description is None:
        return None
    trimmed = description.strip()
    if not trimmed:
        return None
    return trimmed


def create_routine(
    session: Session,
    user_id: int,
    name: str,
    objective: str,
    description: str | None,
) -> Routine:
    normalized = _normalize_name(name)
    description = _sanitize_description(description)

    existing = (
        session.query(Routine)
        .filter(Routine.user_id == user_id, Routine.normalized_name == normalized)
        .first()
    )
    if existing is not None:
        raise RoutineNameConflictError("Routine name already exists")

    routine = Routine(
        user_id=user_id,
        name=name.strip(),
        normalized_name=normalized,
        objective=objective,
        description=description,
    )
    session.add(routine)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise RoutineNameConflictError("Routine name already exists") from exc
    session.refresh(routine)
    return routine


def list_routines(session: Session, user_id: int) -> list[Routine]:
    return (
        session.query(Routine)
        .options(selectinload(Routine.training_days))
        .filter(Routine.user_id == user_id)
        .order_by(Routine.name.collate("NOCASE").asc(), Routine.id.asc())
        .all()
    )


def get_routine(session: Session, routine_id: int, user_id: int) -> Routine | None:
    return (
        session.query(Routine)
        .options(selectinload(Routine.training_days))
        .filter(Routine.id == routine_id, Routine.user_id == user_id)
        .first()
    )


def _require_routine(session: Session, routine_id: int, user_id: int) -> Routine:
    routine = get_routine(session, routine_id, user_id)
    if routine is None:
        raise RoutineNotFoundError("Routine not found")
    return routine


def update_routine(
    session: Session,
    routine_id: int,
    user_id: int,
    name: str,
    objective: str,
    description: str | None,
) -> Routine:
    routine = _require_routine(session, routine_id, user_id)
    normalized = _normalize_name(name)
    description = _sanitize_description(description)

    conflict = (
        session.query(Routine)
        .filter(
            Routine.user_id == user_id,
            Routine.normalized_name == normalized,
            Routine.id != routine_id,
        )
        .first()
    )
    if conflict is not None:
        raise RoutineNameConflictError("Routine name already exists")

    routine.name = name.strip()
    routine.normalized_name = normalized
    routine.objective = objective
    routine.description = description
    session.commit()
    session.refresh(routine)
    return routine


def delete_routine(session: Session, routine_id: int, user_id: int) -> None:
    from app.services.active_routine_service import clear_active_if_matches_routine

    routine = _require_routine(session, routine_id, user_id)
    clear_active_if_matches_routine(session, routine_id)
    session.delete(routine)
    session.commit()
