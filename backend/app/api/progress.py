"""Progress endpoints: exercise performance list, chart, and exercise history."""

from __future__ import annotations

import datetime
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services import progress_service

router = APIRouter(tags=["progress"])

LIMIT_RE = re.compile(r"^[1-9][0-9]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

PERIOD_VALUES = {"1m", "3m", "6m", "1y", "all"}


def _require_subset(params: Any, allowed: set[str]) -> None:
    if not set(params.query_params.keys()).issubset(allowed):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "Unknown query parameter"}],
        )


def _reject_repeats(params: Any, keys: tuple[str, ...]) -> None:
    for key in keys:
        if len(params.query_params.getlist(key)) > 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"msg": f"{key} must be provided at most once"}],
            )


def _parse_period(value: str | None) -> str:
    if value not in PERIOD_VALUES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "period must be one of 1m, 3m, 6m, 1y, all"}],
        )
    return value


def _parse_local_date(value: str | None) -> datetime.date:
    if value is None or not DATE_RE.fullmatch(value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "local_date must be a real YYYY-MM-DD date"}],
        )
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "local_date must be a real YYYY-MM-DD date"}],
        ) from None


def _parse_limit(value: str | None) -> int:
    if value is None:
        return 20
    if not LIMIT_RE.fullmatch(value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "limit must be an integer from 1 through 50"}],
        )
    limit = int(value)
    if limit < 1 or limit > 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "limit must be an integer from 1 through 50"}],
        )
    return limit


@router.get("/progress/statistics")
def get_workout_statistics(
    request: Request,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    params = request.query_params
    _require_subset(request, {"period", "local_date"})
    _reject_repeats(request, ("period", "local_date"))

    period = _parse_period(params.get("period"))
    local_date = _parse_local_date(params.get("local_date"))

    return progress_service.get_workout_statistics(session, user.id, period, local_date)


@router.get("/progress/exercises")
def list_exercise_progress(
    request: Request,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if len(request.query_params) != 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "Unknown query parameter"}],
        )

    items = progress_service.list_exercise_progress(session, user.id)
    return {"items": items}


@router.get("/progress/exercises/{exercise_slug}/chart")
def get_exercise_chart(
    exercise_slug: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    params = request.query_params
    _require_subset(request, {"period", "local_date"})
    _reject_repeats(request, ("period", "local_date"))

    period = _parse_period(params.get("period"))
    local_date = _parse_local_date(params.get("local_date"))

    result = progress_service.get_exercise_chart(
        session, user.id, exercise_slug, period, local_date
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found",
        )

    return result


@router.get("/progress/exercises/{exercise_slug}/history")
def get_exercise_history(
    exercise_slug: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    params = request.query_params
    _require_subset(request, {"cursor", "limit", "period", "local_date"})
    _reject_repeats(request, ("cursor", "limit", "period", "local_date"))

    period = _parse_period(params.get("period"))
    local_date = _parse_local_date(params.get("local_date"))

    cursor = params.get("cursor")
    if cursor is not None and cursor == "":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "cursor must be a non-empty string"}],
        )

    limit = _parse_limit(params.get("limit"))

    try:
        result = progress_service.get_exercise_history(
            session, user.id, exercise_slug, period, local_date, cursor, limit
        )
    except progress_service.ProgressError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "Invalid cursor"}],
        )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found",
        )

    return result
