"""Routine endpoints: list, create, inspect, update, and delete."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, status
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import Routine, User
from app.services.active_routine_service import (
    is_routine_active,
)
from app.services.routine_service import (
    OBJECTIVE_VALUES,
    RoutineNameConflictError,
    RoutineNotFoundError,
    create_routine,
    delete_routine,
    get_routine,
    list_routines,
    update_routine,
)

__all__ = ["router"]

router = APIRouter()


class RoutineRequest(BaseModel):
    name: str
    objective: str
    description: str | None = None

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

    @field_validator("objective")
    @classmethod
    def validate_objective(cls, v: str) -> str:
        if v not in OBJECTIVE_VALUES:
            allowed = ", ".join(sorted(OBJECTIVE_VALUES))
            raise ValueError(f"objective must be one of: {allowed}")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        if len(trimmed) > 1000:
            raise ValueError("description must not exceed 1000 characters")
        return trimmed


class RoutineOut(BaseModel):
    id: int
    name: str
    objective: str
    description: str | None
    training_day_count: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


def _routine_dict(routine: Routine, session: Session, user_id: int) -> dict[str, object]:
    active = is_routine_active(session, routine.id, user_id)
    return {
        "id": routine.id,
        "name": routine.name,
        "objective": routine.objective,
        "description": routine.description,
        "training_day_count": len(routine.training_days),
        "is_active": active,
        "created_at": routine.created_at.isoformat(),
        "updated_at": routine.updated_at.isoformat(),
    }


@router.get("/routines")
def list_routines_endpoint(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    routines = list_routines(session, current_user.id)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=[_routine_dict(r, session, current_user.id) for r in routines],
    )


@router.post("/routines")
def create_routine_endpoint(
    body: RoutineRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        routine = create_routine(
            session=session,
            user_id=current_user.id,
            name=body.name,
            objective=body.objective,
            description=body.description,
        )
    except RoutineNameConflictError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc)},
        )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=_routine_dict(routine, session, current_user.id),
    )


@router.get("/routines/{routine_id}")
def get_routine_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    routine = get_routine(session, routine_id, current_user.id)
    if routine is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Routine not found"},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=_routine_dict(routine, session, current_user.id),
    )


@router.put("/routines/{routine_id}")
def update_routine_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    body: RoutineRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        routine = update_routine(
            session=session,
            routine_id=routine_id,
            user_id=current_user.id,
            name=body.name,
            objective=body.objective,
            description=body.description,
        )
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except RoutineNameConflictError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc)},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=_routine_dict(routine, session, current_user.id),
    )


@router.delete("/routines/{routine_id}")
def delete_routine_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    try:
        delete_routine(session, routine_id=routine_id, user_id=current_user.id)
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
