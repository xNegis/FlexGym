"""Fitness profile endpoints: retrieval and creation."""

import datetime
import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services.fitness_profile_service import (
    ProfileAlreadyExistsError,
    create_fitness_profile,
    get_fitness_profile,
)

__all__ = ["router"]

logger = logging.getLogger(__name__)

router = APIRouter()

BIOLOGICAL_SEX_VALUES = {"male", "female"}
TRAINING_EXPERIENCE_VALUES = {"beginner", "intermediate", "advanced"}
PRIMARY_GOAL_VALUES = {"build_muscle", "lose_fat", "increase_strength", "general_fitness"}
TRAINING_ENVIRONMENT_VALUES = {"full_gym", "home_gym", "minimal_equipment", "bodyweight_only"}


class FitnessProfileCreate(BaseModel):
    date_of_birth: datetime.date
    biological_sex: str
    height_cm: float
    weight_kg: float
    body_fat_percentage: float | None = None
    training_experience: str
    primary_goal: str
    training_days_per_week: int
    preferred_workout_duration_minutes: int
    training_environment: str
    physical_limitations: str | None = None

    model_config = {"extra": "forbid"}

    @field_validator(
        "height_cm",
        "weight_kg",
        "body_fat_percentage",
        "training_days_per_week",
        "preferred_workout_duration_minutes",
        mode="before",
    )
    @classmethod
    def reject_boolean_numerics(cls, v: object) -> object:
        if isinstance(v, bool):
            raise ValueError("numeric profile values must not be booleans")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: datetime.date) -> datetime.date:
        today = datetime.date.today()
        if v >= today:
            raise ValueError("date_of_birth must be in the past")
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age > 120:
            raise ValueError("date_of_birth must not imply an age greater than 120 years")
        return v

    @field_validator("biological_sex")
    @classmethod
    def validate_biological_sex(cls, v: str) -> str:
        if v not in BIOLOGICAL_SEX_VALUES:
            raise ValueError(
                f"biological_sex must be one of: {', '.join(sorted(BIOLOGICAL_SEX_VALUES))}"
            )
        return v

    @field_validator("height_cm")
    @classmethod
    def validate_height_cm(cls, v: float) -> float:
        if v < 50 or v > 250:
            raise ValueError("height_cm must be between 50 and 250")
        rounded = round(v, 1)
        if abs(v - rounded) > 1e-9:
            raise ValueError("height_cm may contain at most one decimal place")
        return rounded

    @field_validator("weight_kg")
    @classmethod
    def validate_weight_kg(cls, v: float) -> float:
        if v < 20 or v > 500:
            raise ValueError("weight_kg must be between 20 and 500")
        rounded = round(v, 1)
        if abs(v - rounded) > 1e-9:
            raise ValueError("weight_kg may contain at most one decimal place")
        return rounded

    @field_validator("body_fat_percentage")
    @classmethod
    def validate_body_fat_percentage(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if v < 2 or v > 75:
            raise ValueError("body_fat_percentage must be between 2 and 75")
        rounded = round(v, 1)
        if abs(v - rounded) > 1e-9:
            raise ValueError("body_fat_percentage may contain at most one decimal place")
        return rounded

    @field_validator("training_experience")
    @classmethod
    def validate_training_experience(cls, v: str) -> str:
        if v not in TRAINING_EXPERIENCE_VALUES:
            allowed = ", ".join(sorted(TRAINING_EXPERIENCE_VALUES))
            raise ValueError(f"training_experience must be one of: {allowed}")
        return v

    @field_validator("primary_goal")
    @classmethod
    def validate_primary_goal(cls, v: str) -> str:
        if v not in PRIMARY_GOAL_VALUES:
            allowed = ", ".join(sorted(PRIMARY_GOAL_VALUES))
            raise ValueError(f"primary_goal must be one of: {allowed}")
        return v

    @field_validator("training_days_per_week")
    @classmethod
    def validate_training_days_per_week(cls, v: int) -> int:
        if not isinstance(v, int) or isinstance(v, bool):
            raise ValueError("training_days_per_week must be an integer")
        if v < 1 or v > 7:
            raise ValueError("training_days_per_week must be between 1 and 7")
        return v

    @field_validator("preferred_workout_duration_minutes")
    @classmethod
    def validate_workout_duration(cls, v: int) -> int:
        if not isinstance(v, int) or isinstance(v, bool):
            raise ValueError("preferred_workout_duration_minutes must be an integer")
        if v < 15 or v > 300:
            raise ValueError("preferred_workout_duration_minutes must be between 15 and 300")
        return v

    @field_validator("training_environment")
    @classmethod
    def validate_training_environment(cls, v: str) -> str:
        if v not in TRAINING_ENVIRONMENT_VALUES:
            allowed = ", ".join(sorted(TRAINING_ENVIRONMENT_VALUES))
            raise ValueError(f"training_environment must be one of: {allowed}")
        return v

    @field_validator("physical_limitations")
    @classmethod
    def validate_physical_limitations(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        if len(trimmed) > 1000:
            raise ValueError("physical_limitations must not exceed 1000 characters")
        return trimmed


class FitnessProfileOut(BaseModel):
    id: int
    date_of_birth: datetime.date
    biological_sex: str
    height_cm: float
    weight_kg: float
    body_fat_percentage: float | None
    training_experience: str
    primary_goal: str
    training_days_per_week: int
    preferred_workout_duration_minutes: int
    training_environment: str
    physical_limitations: str | None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


@router.get("/fitness-profile")
def get_profile(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    profile = get_fitness_profile(session, current_user.id)
    if profile is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Fitness profile not found"},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=FitnessProfileOut.model_validate(profile).model_dump(mode="json"),
    )


@router.post("/fitness-profile")
def create_profile(
    body: FitnessProfileCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        profile = create_fitness_profile(
            session=session,
            user_id=current_user.id,
            date_of_birth=body.date_of_birth,
            biological_sex=body.biological_sex,
            height_cm=body.height_cm,
            weight_kg=body.weight_kg,
            body_fat_percentage=body.body_fat_percentage,
            training_experience=body.training_experience,
            primary_goal=body.primary_goal,
            training_days_per_week=body.training_days_per_week,
            preferred_workout_duration_minutes=body.preferred_workout_duration_minutes,
            training_environment=body.training_environment,
            physical_limitations=body.physical_limitations,
        )
    except ProfileAlreadyExistsError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc)},
        )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=FitnessProfileOut.model_validate(profile).model_dump(mode="json"),
    )
