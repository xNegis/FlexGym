"""Training day endpoints: list, create, rename, and delete."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, status
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import TrainingDay, User
from app.services.routine_service import RoutineNotFoundError
from app.services.training_day_service import (
    TrainingDayLimitError,
    TrainingDayNotFoundError,
    create_training_day,
    delete_training_day,
    list_training_days,
    rename_training_day,
)

__all__ = ["router"]

router = APIRouter()


class TrainingDayNameRequest(BaseModel):
    name: str

    model_config = {"extra": "forbid"}

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("name must not be empty")
        if len(trimmed) > 120:
            raise ValueError("name must not exceed 120 characters")
        return trimmed


class TrainingDayOut(BaseModel):
    id: int
    name: str
    week_position: int
    exercise_count: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


def _training_day_out(day: TrainingDay) -> dict[str, object]:
    week_position = day.schedule_assignment.week_position if day.schedule_assignment else 0
    return {
        "id": day.id,
        "name": day.name,
        "week_position": week_position,
        "exercise_count": len(day.exercise_configurations) if day.exercise_configurations else 0,
        "created_at": day.created_at.isoformat(),
        "updated_at": day.updated_at.isoformat(),
    }


@router.get("/routines/{routine_id}/days")
def list_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        days = list_training_days(session, routine_id, current_user.id)
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=[_training_day_out(d) for d in days],
    )


@router.post("/routines/{routine_id}/days")
def create_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    body: TrainingDayNameRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        day = create_training_day(session, routine_id, current_user.id, body.name)
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except TrainingDayLimitError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc)},
        )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=_training_day_out(day),
    )


@router.put("/routines/{routine_id}/days/{day_id}")
def rename_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    day_id: Annotated[int, Path(gt=0)],
    body: TrainingDayNameRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        day = rename_training_day(session, routine_id, current_user.id, day_id, body.name)
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except TrainingDayNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=_training_day_out(day),
    )


@router.delete("/routines/{routine_id}/days/{day_id}")
def delete_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    day_id: Annotated[int, Path(gt=0)],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    try:
        delete_training_day(session, routine_id, current_user.id, day_id)
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except TrainingDayNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
