"""Workout endpoints: start context, start, active, lookup, execution, cancel, history."""

from __future__ import annotations

import datetime
import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, FiniteFloat, StrictInt, field_validator

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services import workout_service

router = APIRouter(tags=["workouts"])

DATE_RE = r"^\d{4}-\d{2}-\d{2}$"
LIMIT_RE = re.compile(r"^[1-9][0-9]*$")


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


class AsPlannedPerformance(BaseModel):
    entry_mode: Literal["as_planned"]

    model_config = {"extra": "forbid"}


class AdjustedPerformance(BaseModel):
    entry_mode: Literal["adjusted"]
    performed_value: FiniteFloat
    performed_weight_kg: FiniteFloat | None
    performed_rir: StrictInt | None

    @field_validator("performed_value", "performed_weight_kg", mode="before")
    @classmethod
    def reject_boolean_numbers(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("performed values must be numbers, not booleans")
        return value

    model_config = {"extra": "forbid"}


class SkipRequest(BaseModel):
    reason_code: str | None = None
    note: str | None = None

    @field_validator("reason_code", mode="before")
    @classmethod
    def reject_boolean_reason(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("reason_code must be a string or null, not a boolean")
        return value

    model_config = {"extra": "forbid"}


def _parse_date(date_str: str) -> datetime.date:
    return datetime.date.fromisoformat(date_str)


def _execution_error_to_http(error: str) -> tuple[int, str]:
    mapping = {
        "Workout not found": (404, "Workout not found"),
        "Workout is not active": (409, "Workout is not active"),
        "Workout has unresolved sets": (409, "Workout has unresolved sets"),
        "Workout exercise not found": (404, "Workout exercise not found"),
        "Workout set not found": (404, "Workout set not found"),
        "Exercise is already started": (409, "Exercise is already started"),
        "Exercise cannot be started yet": (409, "Exercise cannot be started yet"),
        "Exercise has not been started": (409, "Exercise has not been started"),
        "Exercise has no incomplete sets": (409, "Exercise has no incomplete sets"),
        "Workout set is not current": (409, "Workout set is not current"),
        "Workout set is already incomplete": (409, "Workout set is already incomplete"),
        "Workout set is already started": (409, "Workout set is already started"),
        "Workout set is already complete": (409, "Workout set is already complete"),
        "Workout set has not been started": (409, "Workout set has not been started"),
        "Workout set is already skipped": (409, "Workout set is already skipped"),
        "Workout set is not skipped": (409, "Workout set is not skipped"),
        "Exercise cannot be skipped yet": (409, "Exercise cannot be skipped yet"),
        "Exercise is already resolved": (409, "Exercise is already resolved"),
        "Exercise is already skipped": (409, "Exercise is already skipped"),
        "Exercise is not skipped": (409, "Exercise is not skipped"),
        "Unsupported reason code": (422, "Unsupported reason code"),
    }
    if error.startswith("Invalid performed"):
        return (422, error)
    if error.startswith("A note is required"):
        return (422, error)
    if error.startswith("Note exceeds"):
        return (422, error)
    return mapping.get(error, (500, "Unable to process request"))


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


@router.get("/api/workouts/history")
def get_workout_history(
    request: Request,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    params = request.query_params
    allowed = {"status", "cursor", "limit"}
    if not set(params.keys()).issubset(allowed):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "Unknown query parameter"}],
        )
    for key in ("status", "cursor", "limit"):
        if len(params.getlist(key)) > 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"msg": f"{key} must be provided at most once"}],
            )

    status_filter = params.get("status")
    if status_filter is not None and (
        status_filter == "" or status_filter not in ("completed", "cancelled")
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "status must be 'completed' or 'cancelled'"}],
        )

    cursor = params.get("cursor")
    if cursor is not None and cursor == "":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "cursor must be a non-empty string"}],
        )

    limit_raw = params.get("limit", "20")
    if not LIMIT_RE.fullmatch(limit_raw):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "limit must be an integer from 1 through 50"}],
        )
    limit = int(limit_raw)
    if limit < 1 or limit > 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "limit must be an integer from 1 through 50"}],
        )

    try:
        result = workout_service.list_workout_history(
            session, user.id, status_filter, cursor, limit
        )
    except workout_service.HistoryError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "Invalid cursor"}],
        )

    return result


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


# ────────────────── F17 completion endpoint ──────────────────


@router.post("/api/workouts/{workout_id}/complete")
def complete_workout(
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
        workout = workout_service.complete_workout(session, user.id, workout_id)
    except workout_service.ExecutionError as e:
        code, detail = _execution_error_to_http(str(e))
        raise HTTPException(status_code=code, detail=detail)

    return workout_service._build_workout_response(workout)


# ────────────────── F14 execution endpoints ──────────────────


@router.post("/api/workouts/{workout_id}/exercises/{exercise_position}/start")
def start_exercise(
    workout_id: int,
    exercise_position: int,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0 or exercise_position <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "workout_id and exercise_position must be positive integers"}],
        )

    try:
        workout = workout_service.start_exercise(session, user.id, workout_id, exercise_position)
    except workout_service.ExecutionError as e:
        code, detail = _execution_error_to_http(str(e))
        raise HTTPException(status_code=code, detail=detail)

    return workout_service._build_workout_response(workout)


@router.post("/api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/start")
def start_set(
    workout_id: int,
    exercise_position: int,
    set_position: int,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0 or exercise_position <= 0 or set_position <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "path parameters must be positive integers"}],
        )

    try:
        workout = workout_service.start_set(
            session, user.id, workout_id, exercise_position, set_position
        )
    except workout_service.ExecutionError as e:
        code, detail = _execution_error_to_http(str(e))
        raise HTTPException(status_code=code, detail=detail)

    return workout_service._build_workout_response(workout)


@router.put(
    "/api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/performance"
)
def record_set_performance(
    workout_id: int,
    exercise_position: int,
    set_position: int,
    body: AsPlannedPerformance | AdjustedPerformance,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0 or exercise_position <= 0 or set_position <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "path parameters must be positive integers"}],
        )

    entry_mode = body.entry_mode

    if isinstance(body, AsPlannedPerformance):
        pv = pw = pr = None
    else:
        pv = float(body.performed_value)
        pw = float(body.performed_weight_kg) if body.performed_weight_kg is not None else None
        pr = int(body.performed_rir) if body.performed_rir is not None else None

    try:
        if entry_mode == "as_planned" or entry_mode == "adjusted":
            workout = workout_service.complete_set(
                session,
                user.id,
                workout_id,
                exercise_position,
                set_position,
                entry_mode=entry_mode,
                performed_value=pv,
                performed_weight_kg=pw,
                performed_rir=pr,
            )
        else:
            raise HTTPException(status_code=422, detail="Invalid entry_mode")
    except workout_service.ExecutionError as e:
        code, detail = _execution_error_to_http(str(e))
        raise HTTPException(status_code=code, detail=detail)

    return workout_service._build_workout_response(workout)


@router.delete(
    "/api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/performance"
)
def mark_incomplete(
    workout_id: int,
    exercise_position: int,
    set_position: int,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0 or exercise_position <= 0 or set_position <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "path parameters must be positive integers"}],
        )

    try:
        workout = workout_service.mark_set_incomplete(
            session,
            user.id,
            workout_id,
            exercise_position,
            set_position,
        )
    except workout_service.ExecutionError as e:
        code, detail = _execution_error_to_http(str(e))
        raise HTTPException(status_code=code, detail=detail)

    return workout_service._build_workout_response(workout)


# ────────────────── F15 exception endpoints ──────────────────


@router.post("/api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/skip")
def skip_set(
    workout_id: int,
    exercise_position: int,
    set_position: int,
    body: SkipRequest,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0 or exercise_position <= 0 or set_position <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "path parameters must be positive integers"}],
        )

    try:
        workout = workout_service.skip_set(
            session,
            user.id,
            workout_id,
            exercise_position,
            set_position,
            reason_code=body.reason_code,
            note=body.note,
        )
    except workout_service.ExecutionError as e:
        code, detail = _execution_error_to_http(str(e))
        raise HTTPException(status_code=code, detail=detail)

    return workout_service._build_workout_response(workout)


@router.delete("/api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/skip")
def undo_skip_set(
    workout_id: int,
    exercise_position: int,
    set_position: int,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0 or exercise_position <= 0 or set_position <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "path parameters must be positive integers"}],
        )

    try:
        workout = workout_service.revert_skip_set(
            session,
            user.id,
            workout_id,
            exercise_position,
            set_position,
        )
    except workout_service.ExecutionError as e:
        code, detail = _execution_error_to_http(str(e))
        raise HTTPException(status_code=code, detail=detail)

    return workout_service._build_workout_response(workout)


@router.post("/api/workouts/{workout_id}/exercises/{exercise_position}/skip")
def skip_exercise(
    workout_id: int,
    exercise_position: int,
    body: SkipRequest,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0 or exercise_position <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "workout_id and exercise_position must be positive integers"}],
        )

    try:
        workout = workout_service.skip_exercise(
            session,
            user.id,
            workout_id,
            exercise_position,
            reason_code=body.reason_code,
            note=body.note,
        )
    except workout_service.ExecutionError as e:
        code, detail = _execution_error_to_http(str(e))
        raise HTTPException(status_code=code, detail=detail)

    return workout_service._build_workout_response(workout)


@router.delete("/api/workouts/{workout_id}/exercises/{exercise_position}/skip")
def undo_skip_exercise(
    workout_id: int,
    exercise_position: int,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if workout_id <= 0 or exercise_position <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "workout_id and exercise_position must be positive integers"}],
        )

    try:
        workout = workout_service.revert_skip_exercise(
            session,
            user.id,
            workout_id,
            exercise_position,
        )
    except workout_service.ExecutionError as e:
        code, detail = _execution_error_to_http(str(e))
        raise HTTPException(status_code=code, detail=detail)

    return workout_service._build_workout_response(workout)
