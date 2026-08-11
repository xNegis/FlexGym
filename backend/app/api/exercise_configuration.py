"""Exercise configuration endpoints: list, create, update, reorder, and delete."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, status
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services.exercise_configuration_service import (
    TARGET_TYPES,
    DuplicateExerciseError,
    ExerciseConfigurationLimitError,
    ExerciseConfigurationNotFoundError,
    ExerciseConfigurationOrderError,
    ExerciseNotFoundError,
    create_exercise_config,
    delete_exercise_config,
    list_exercise_configs,
    reorder_exercise_configs,
    update_exercise_config,
)
from app.services.routine_service import RoutineNotFoundError

__all__ = ["router"]

router = APIRouter()


class TempoWrite(BaseModel):
    eccentric_seconds: int
    stretched_pause_seconds: int
    concentric_seconds: int
    peak_contraction_seconds: int

    model_config = {"extra": "forbid"}


class SetWrite(BaseModel):
    target_value: float
    target_weight_kg: float | None = None
    target_rir: int | None = None
    tempo: TempoWrite | None = None
    rest_after_set_seconds: int | None = None
    notes: str | None = None

    model_config = {"extra": "forbid"}


class ExerciseConfigCreateRequest(BaseModel):
    exercise_slug: str
    target_type: str
    rest_after_exercise_seconds: int | None = None
    notes: str | None = None
    sets: list[SetWrite]

    model_config = {"extra": "forbid"}

    @field_validator("exercise_slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("exercise_slug must not be empty")
        return trimmed

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, v: str) -> str:
        if v not in TARGET_TYPES:
            allowed = ", ".join(sorted(TARGET_TYPES))
            raise ValueError(f"target_type must be one of: {allowed}")
        return v

    @field_validator("sets")
    @classmethod
    def validate_sets(cls, v: list[SetWrite]) -> list[SetWrite]:
        if not v:
            raise ValueError("At least one set is required")
        if len(v) > 20:
            raise ValueError("An exercise may have at most 20 sets")
        return v


class ExerciseConfigUpdateRequest(BaseModel):
    target_type: str
    rest_after_exercise_seconds: int | None = None
    notes: str | None = None
    sets: list[SetWrite]

    model_config = {"extra": "forbid"}

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, v: str) -> str:
        if v not in TARGET_TYPES:
            allowed = ", ".join(sorted(TARGET_TYPES))
            raise ValueError(f"target_type must be one of: {allowed}")
        return v

    @field_validator("sets")
    @classmethod
    def validate_sets(cls, v: list[SetWrite]) -> list[SetWrite]:
        if not v:
            raise ValueError("At least one set is required")
        if len(v) > 20:
            raise ValueError("An exercise may have at most 20 sets")
        return v


class ExerciseConfigOrderRequest(BaseModel):
    exercise_configuration_ids: list[Annotated[int, Field(strict=True, gt=0)]]

    model_config = {"extra": "forbid"}


@router.get("/routines/{routine_id}/days/{day_id}/exercises")
def list_exercises_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    day_id: Annotated[int, Path(gt=0)],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        configs = list_exercise_configs(session, routine_id, current_user.id, day_id)
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except ExerciseConfigurationNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    return JSONResponse(status_code=status.HTTP_200_OK, content=configs)


@router.post("/routines/{routine_id}/days/{day_id}/exercises")
def create_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    day_id: Annotated[int, Path(gt=0)],
    body: ExerciseConfigCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        sets_data = [s.model_dump() for s in body.sets]
        config = create_exercise_config(
            session=session,
            routine_id=routine_id,
            user_id=current_user.id,
            day_id=day_id,
            exercise_slug=body.exercise_slug,
            target_type=body.target_type,
            rest_after_exercise_seconds=body.rest_after_exercise_seconds,
            notes=body.notes,
            sets_data=sets_data,
        )
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except ExerciseConfigurationNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except ExerciseNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except DuplicateExerciseError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc)},
        )
    except ExerciseConfigurationLimitError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc)},
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": str(exc)},
        )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=config)


@router.put("/routines/{routine_id}/days/{day_id}/exercises/order")
def reorder_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    day_id: Annotated[int, Path(gt=0)],
    body: ExerciseConfigOrderRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        configs = reorder_exercise_configs(
            session, routine_id, current_user.id, day_id, body.exercise_configuration_ids
        )
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except ExerciseConfigurationNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except ExerciseConfigurationOrderError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": str(exc)},
        )
    return JSONResponse(status_code=status.HTTP_200_OK, content=configs)


@router.put("/routines/{routine_id}/days/{day_id}/exercises/{config_id}")
def update_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    day_id: Annotated[int, Path(gt=0)],
    config_id: Annotated[int, Path(gt=0)],
    body: ExerciseConfigUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        sets_data = [s.model_dump() for s in body.sets]
        config = update_exercise_config(
            session=session,
            routine_id=routine_id,
            user_id=current_user.id,
            day_id=day_id,
            config_id=config_id,
            target_type=body.target_type,
            rest_after_exercise_seconds=body.rest_after_exercise_seconds,
            notes=body.notes,
            sets_data=sets_data,
        )
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except ExerciseConfigurationNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": str(exc)},
        )
    return JSONResponse(status_code=status.HTTP_200_OK, content=config)


@router.delete("/routines/{routine_id}/days/{day_id}/exercises/{config_id}")
def delete_endpoint(
    routine_id: Annotated[int, Path(gt=0)],
    day_id: Annotated[int, Path(gt=0)],
    config_id: Annotated[int, Path(gt=0)],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    try:
        delete_exercise_config(session, routine_id, current_user.id, day_id, config_id)
    except RoutineNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    except ExerciseConfigurationNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
