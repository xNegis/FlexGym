"""Body weight measurement endpoints: history, create/replace, and delete."""

from __future__ import annotations

import datetime
import math
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import FitnessProfile, User
from app.services import body_weight_service
from app.services.fitness_profile_service import get_fitness_profile

router = APIRouter(tags=["body-weight"])

LIMIT_RE = re.compile(r"^[1-9][0-9]*$")


class BodyWeightUpsertRequest(BaseModel):
    current_local_date: datetime.date
    weight_kg: float
    note: str | None = None

    model_config = {"extra": "forbid"}

    @field_validator("weight_kg", mode="before")
    @classmethod
    def reject_non_number_weight(cls, v: object) -> object:
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise ValueError("weight_kg must be a number")
        return v

    @field_validator("weight_kg")
    @classmethod
    def validate_weight_kg(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("weight_kg must be a finite number")
        if v < 20 or v > 500:
            raise ValueError("weight_kg must be between 20 and 500")
        rounded = round(v, 1)
        if abs(v - rounded) > 1e-9:
            raise ValueError("weight_kg may contain at most one decimal place")
        return rounded

    @field_validator("note")
    @classmethod
    def validate_note(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        if len(trimmed) > 1000:
            raise ValueError("note must not exceed 1000 characters")
        return trimmed


def _require_subset(request: Request, allowed: set[str]) -> None:
    if not set(request.query_params.keys()).issubset(allowed):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "Unknown query parameter"}],
        )


def _reject_repeats(request: Request, keys: tuple[str, ...]) -> None:
    for key in keys:
        if len(request.query_params.getlist(key)) > 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"msg": f"{key} must be provided at most once"}],
            )


def _parse_limit(value: str | None) -> int:
    if value is None:
        return body_weight_service.DEFAULT_PAGE_LIMIT
    if not LIMIT_RE.fullmatch(value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "limit must be an integer from 1 through 50"}],
        )
    limit = int(value)
    if limit < 1 or limit > body_weight_service.MAX_PAGE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "limit must be an integer from 1 through 50"}],
        )
    return limit


def _require_profile(session: Session, user_id: int) -> FitnessProfile:
    profile = get_fitness_profile(session, user_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fitness profile not found",
        )
    return profile


def _current_weight(session: Session, user_id: int) -> dict[str, Any]:
    profile = get_fitness_profile(session, user_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fitness profile not found",
        )
    weight_kg, measurement_date = body_weight_service.resolve_current_weight(
        session, user_id, float(profile.weight_kg)
    )
    return {
        "weight_kg": weight_kg,
        "source": "measurement" if measurement_date is not None else "profile_fallback",
        "measurement_date": measurement_date.isoformat() if measurement_date is not None else None,
    }


@router.get("/body-weight-measurements")
def list_measurements(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _require_subset(request, {"cursor", "limit"})
    _reject_repeats(request, ("cursor", "limit"))

    cursor = request.query_params.get("cursor")
    if cursor is not None and cursor == "":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "cursor must be a non-empty string"}],
        )

    limit = _parse_limit(request.query_params.get("limit"))
    _require_profile(session, user.id)

    try:
        items, next_cursor = body_weight_service.list_measurements(session, user.id, cursor, limit)
    except body_weight_service.BodyWeightError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "Invalid cursor"}],
        )

    return {
        "current_weight": _current_weight(session, user.id),
        "items": items,
        "next_cursor": next_cursor,
    }


@router.put("/body-weight-measurements/{measurement_date}")
def upsert_measurement(
    measurement_date: datetime.date,
    body: BodyWeightUpsertRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> JSONResponse:
    _require_profile(session, user.id)

    if measurement_date > body.current_local_date:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": [{"msg": "measurement_date must not be in the future"}]},
        )

    measurement, created = body_weight_service.upsert_measurement(
        session,
        user.id,
        measurement_date,
        body.weight_kg,
        body.note,
    )

    return JSONResponse(
        status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        content={
            "item": body_weight_service.measurement_payload(measurement),
            "current_weight": _current_weight(session, user.id),
        },
    )


@router.delete("/body-weight-measurements/{measurement_date}")
def delete_measurement(
    measurement_date: datetime.date,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    _require_profile(session, user.id)

    deleted = body_weight_service.delete_measurement(session, user.id, measurement_date)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Body weight measurement not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
