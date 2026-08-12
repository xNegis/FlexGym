"""Workout endpoints: start context, start, active, lookup, cancel."""

from __future__ import annotations

import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StrictInt, field_validator

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services import workout_service

router = APIRouter(tags=["workouts"])

DATE_RE = r"^\d{4}-\d{2}-\d{2}$"


class StartRequest(BaseModel):
    training_day_id: StrictInt
    local_date: str

    @field_validator("training_day_id")
    @classmethod
    def positive_id(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("training_day_id must be a positive integer")
        return v

    @field_validator("local_date")
    @classmethod
    def valid_calendar_date(cls, v: str) -> str:
        if not __import__("re").fullmatch(DATE_RE, v):
            raise ValueError("local_date must be in YYYY-MM-DD format")
        try:
            datetime.date.fromisoformat(v)
        except ValueError:
            raise ValueError("local_date must be a valid calendar date")
        return v

    model_config = {"extra": "forbid"}


def _parse_date(date_str: str) -> datetime.date:
    return datetime.date.fromisoformat(date_str)


@router.get("/api/workouts/start-context")
def get_start_context(
    request: Request,
    local_date: str,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if (
        set(request.query_params.keys()) != {"local_date"}
        or len(request.query_params.getlist("local_date")) != 1
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "local_date must be provided exactly once"}],
        )

    try:
        _parse_date(local_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "local_date must be a valid calendar date in YYYY-MM-DD format"}],
        )

    context = workout_service.resolve_start_context(session, user.id, _parse_date(local_date))
    return context


@router.post("/api/workouts", status_code=status.HTTP_201_CREATED)
def create_workout(
    body: StartRequest,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> Any:
    try:
        workout = workout_service.start_workout(
            session,
            user.id,
            body.training_day_id,
            _parse_date(body.local_date),
        )
    except workout_service.StartError as e:
        msg = str(e)
        if msg == "active_workout_exists":
            active = workout_service.get_active_workout(session, user.id)
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={
                    "detail": "A workout is already in progress",
                    "active_workout": (
                        workout_service._active_workout_summary(active) if active else None
                    ),
                },
            )
        if msg == "no_active_routine":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No active routine",
            )
        if msg == "training_day_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training day not found",
            )
        if msg == "training_day_empty":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Training day has no configured exercises",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to start workout",
        )

    return workout_service._build_workout_response(workout)


@router.get("/api/workouts/active")
def get_active_workout(
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> Any:
    workout = workout_service.get_active_workout(session, user.id)
    if workout is None:
        return None
    return workout_service._build_workout_response(workout)


@router.get("/api/workouts/{workout_id}")
def get_workout(
    workout_id: int,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "workout_id must be a positive integer"}],
        )

    workout = workout_service.get_workout(session, user.id, workout_id)
    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found",
        )

    return workout_service._build_workout_response(workout)


@router.post("/api/workouts/{workout_id}/cancel")
def cancel_workout(
    workout_id: int,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "workout_id must be a positive integer"}],
        )

    try:
        workout = workout_service.cancel_workout(session, user.id, workout_id)
    except ValueError as e:
        msg = str(e)
        if msg == "Workout not found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workout not found",
            )
        if msg == "Workout is not in progress":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Workout is not in progress",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to cancel workout",
        )

    return workout_service._build_workout_response(workout)
