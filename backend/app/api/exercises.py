"""Exercise catalog endpoints: browse, search, filter, and inspect."""

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services.exercise_service import (
    EQUIPMENT_VALUES,
    MAX_SEARCH_LENGTH,
    MUSCLE_GROUP_VALUES,
    get_exercise_by_slug,
    list_exercises,
)

__all__ = ["router"]

router = APIRouter()

_ALLOWED_QUERY_PARAMS = {"search", "primary_muscle", "equipment"}


def _reject_unknown_query_params(request: Request) -> None:
    for key in request.query_params:
        if key not in _ALLOWED_QUERY_PARAMS:
            raise _UnknownQueryParamError(key)
        if len(request.query_params.getlist(key)) > 1:
            raise _RepeatedQueryParamError(key)


class _UnknownQueryParamError(Exception):
    def __init__(self, param: str) -> None:
        self.param = param


class _RepeatedQueryParamError(Exception):
    def __init__(self, param: str) -> None:
        self.param = param


class ExerciseSummary(BaseModel):
    slug: str
    name: str
    primary_muscle: str
    secondary_muscles: list[str]
    equipment: str
    movement_pattern: str
    execution_type: str

    model_config = {"from_attributes": True}


class ExerciseDetail(ExerciseSummary):
    instructions: str


@router.get("/exercises")
def list_exercises_endpoint(
    request: Request,
    search: str | None = Query(default=None, max_length=MAX_SEARCH_LENGTH),
    primary_muscle: str | None = Query(default=None),
    equipment: str | None = Query(default=None),
    session: Session = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        _reject_unknown_query_params(request)
    except _UnknownQueryParamError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": f"unknown query parameter: {exc.param}"},
        )
    except _RepeatedQueryParamError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": f"query parameter must not be repeated: {exc.param}"},
        )
    if search is not None:
        trimmed = search.strip()
        if len(trimmed) > MAX_SEARCH_LENGTH:
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={"detail": f"search must not exceed {MAX_SEARCH_LENGTH} characters"},
            )

    if primary_muscle is not None and primary_muscle not in MUSCLE_GROUP_VALUES:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": f"primary_muscle must be one of: {', '.join(sorted(MUSCLE_GROUP_VALUES))}"
            },
        )

    if equipment is not None and equipment not in EQUIPMENT_VALUES:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": f"equipment must be one of: {', '.join(sorted(EQUIPMENT_VALUES))}"},
        )

    results = list_exercises(
        session, search=search, primary_muscle=primary_muscle, equipment=equipment
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=[ExerciseSummary.model_validate(r).model_dump() for r in results],
    )


@router.get("/exercises/{slug}")
def get_exercise_endpoint(
    slug: str,
    session: Session = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> JSONResponse:
    exercise = get_exercise_by_slug(session, slug)
    if exercise is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Exercise not found"},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=ExerciseDetail.model_validate(exercise).model_dump(),
    )
