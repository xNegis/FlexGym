"""Workout preference endpoints: effective retrieval and update."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, StrictInt, field_validator
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services import workout_preference_service

router = APIRouter(tags=["workout-preferences"])

ALLOWED_DELAYS = workout_preference_service.ALLOWED_AUTO_START_DELAYS


class WorkoutPreferenceRequest(BaseModel):
    automatic_set_start_delay_seconds: StrictInt

    model_config = {"extra": "forbid"}

    @field_validator("automatic_set_start_delay_seconds", mode="before")
    @classmethod
    def reject_boolean_delay(cls, v: object) -> object:
        if isinstance(v, bool):
            raise ValueError("automatic_set_start_delay_seconds must be an integer, not a boolean")
        return v

    @field_validator("automatic_set_start_delay_seconds")
    @classmethod
    def validate_delay(cls, v: int) -> int:
        if v not in ALLOWED_DELAYS:
            raise ValueError(
                "automatic_set_start_delay_seconds must be one of 0, 5, 10, 15, 20, 30"
            )
        return v


@router.get("/workout-preferences")
def get_workout_preferences(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return workout_preference_service.preference_payload(session, user.id)


@router.put("/workout-preferences")
def update_workout_preferences(
    body: WorkoutPreferenceRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return workout_preference_service.set_preference(
        session, user.id, body.automatic_set_start_delay_seconds
    )
