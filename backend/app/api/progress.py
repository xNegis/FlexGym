"""Progress endpoints: exercise performance list and exercise history."""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services import progress_service

router = APIRouter(tags=["progress"])

LIMIT_RE = re.compile(r"^[1-9][0-9]*$")


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


@router.get("/progress/exercises/{exercise_slug}/history")
def get_exercise_history(
    exercise_slug: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    params = request.query_params
    allowed = {"cursor", "limit"}
    if not set(params.keys()).issubset(allowed):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "Unknown query parameter"}],
        )
    for key in ("cursor", "limit"):
        if len(params.getlist(key)) > 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"msg": f"{key} must be provided at most once"}],
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
        result = progress_service.get_exercise_history(
            session, user.id, exercise_slug, cursor, limit
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
