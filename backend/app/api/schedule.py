"""Schedule endpoints: inspect and move training days within the weekly cycle."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services.routine_service import RoutineNotFoundError
from app.services.schedule_service import get_schedule, move_training_day

__all__ = ["router"]

router = APIRouter()


class ScheduleMoveRequest(BaseModel):
    training_day_id: Annotated[int, Field(strict=True, gt=0)]
    week_position: Annotated[int, Field(strict=True, gt=0)]

    model_config = {"extra": "forbid"}

    @field_validator("week_position")
    @classmethod
    def validate_week_position(cls, v: int) -> int:
        if v < 1 or v > 7:
            raise ValueError("week_position must be between 1 and 7")
        return v


@router.get("/routines/{routine_id}/schedule")
def get_schedule_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        slots = get_schedule(session, routine_id, current_user.id)
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    return JSONResponse(status_code=status.HTTP_200_OK, content=slots)


@router.put("/routines/{routine_id}/schedule")
def move_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    body: ScheduleMoveRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        slots = move_training_day(
            session, routine_id, current_user.id, body.training_day_id, body.week_position
        )
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Training day not found"},
        )
    return JSONResponse(status_code=status.HTTP_200_OK, content=slots)
