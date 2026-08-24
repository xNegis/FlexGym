"""Workout preference domain operations: effective delay resolution and save."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import WorkoutPreference

ALLOWED_AUTO_START_DELAYS = frozenset({0, 5, 10, 15, 20, 30})


def get_effective_delay(session: Session, user_id: int) -> int:
    """Resolve the effective automatic-start delay for a user, defaulting to 0."""
    preference = (
        session.query(WorkoutPreference).filter(WorkoutPreference.user_id == user_id).first()
    )
    if preference is None:
        return 0
    return preference.automatic_set_start_delay_seconds


def preference_payload(session: Session, user_id: int) -> dict[str, object]:
    return {"automatic_set_start_delay_seconds": get_effective_delay(session, user_id)}


def set_preference(session: Session, user_id: int, delay_seconds: int) -> dict[str, object]:
    preference = (
        session.query(WorkoutPreference).filter(WorkoutPreference.user_id == user_id).first()
    )
    if preference is None:
        preference = WorkoutPreference(
            user_id=user_id,
            automatic_set_start_delay_seconds=delay_seconds,
        )
        session.add(preference)
    else:
        preference.automatic_set_start_delay_seconds = delay_seconds
    session.commit()
    session.refresh(preference)
    return preference_payload(session, user_id)
