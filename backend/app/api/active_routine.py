"""Active routine endpoints: get, activate, deactivate."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, StrictInt, field_validator
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import Routine, User
from app.services.active_routine_service import (
    ActivationError,
    activate_routine,
    deactivate_routine,
    get_active_routine,
)

__all__ = ["router"]

router = APIRouter()


class ActivateRequest(BaseModel):
    routine_id: StrictInt

    model_config = {"extra": "forbid"}

    @field_validator("routine_id")
    @classmethod
    def validate_routine_id(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("routine_id must be a positive integer")
        return v


def _routine_dict(routine: Routine) -> dict[str, object]:
    return {
        "id": routine.id,
        "name": routine.name,
        "objective": routine.objective,
        "description": routine.description,
        "training_day_count": len(routine.training_days) if routine.training_days else 0,
        "is_active": True,
        "created_at": routine.created_at.isoformat(),
        "updated_at": routine.updated_at.isoformat(),
    }


@router.get("/active-routine")
def get_active_routine_endpoint(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    result = get_active_routine(session, current_user.id)
    if result is None:
        return JSONResponse(status_code=status.HTTP_200_OK, content=None)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "routine": _routine_dict(result.routine),
            "activated_at": result.activated_at.isoformat(),
        },
    )


@router.put("/active-routine")
def activate_routine_endpoint(
    body: ActivateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        result = activate_routine(session, current_user.id, body.routine_id)
    except ActivationError as exc:
        detail = str(exc)
        if detail == "Routine not found":
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"detail": detail},
            )
        status_code = (
            status.HTTP_409_CONFLICT
            if "training day" in detail or "schedule" in detail
            else status.HTTP_400_BAD_REQUEST
        )
        return JSONResponse(status_code=status_code, content={"detail": detail})

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "routine": _routine_dict(result.routine),
            "activated_at": result.activated_at.isoformat(),
        },
    )


@router.delete("/active-routine")
def deactivate_routine_endpoint(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    deactivate_routine(session, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
