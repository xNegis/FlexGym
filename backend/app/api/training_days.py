"""Training day endpoints: list, create, rename, reorder, and delete."""

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
    TrainingDayOrderError,
    create_training_day,
    delete_training_day,
    list_training_days,
    rename_training_day,
    reorder_training_days,
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


class TrainingDayOrderRequest(BaseModel):
    day_ids: list[int]

    model_config = {"extra": "forbid"}

    @field_validator("day_ids")
    @classmethod
    def validate_day_ids(cls, v: list[int]) -> list[int]:
        for item in v:
            if not isinstance(item, int) or item <= 0:
                raise ValueError("day_ids must contain only positive integers")
        return v


class TrainingDayOut(BaseModel):
    id: int
    name: str
    position: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


def _training_day_out(day: TrainingDay) -> dict[str, object]:
    return {
        "id": day.id,
        "name": day.name,
        "position": day.position,
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
        day = create_training_day(
            session, routine_id, current_user.id, body.name
        )
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


@router.put("/routines/{routine_id}/days/order")
def reorder_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    body: TrainingDayOrderRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        days = reorder_training_days(
            session, routine_id, current_user.id, body.day_ids
        )
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except TrainingDayOrderError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": str(exc)},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=[_training_day_out(d) for d in days],
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
        day = rename_training_day(
            session, routine_id, current_user.id, day_id, body.name
        )
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
