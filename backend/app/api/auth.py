"""Authentication endpoints: registration status, register, login, me, logout."""

import logging
import re

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.auth.cookies import clear_auth_cookie
from app.auth.dependencies import COOKIE_NAME, get_current_user
from app.auth.jwt import TOKEN_EXPIRY
from app.config import get_config
from app.db import get_session
from app.models import User
from app.services.user_service import (
    EmailAlreadyRegisteredError,
    LoginError,
    RegistrationError,
    login_user,
    register_user,
)

__all__ = ["router"]

logger = logging.getLogger(__name__)

router = APIRouter()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserOut(BaseModel):
    id: int
    email: str

    model_config = {"from_attributes": True}


class AuthRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("email is required")
        if not EMAIL_RE.match(trimmed):
            raise ValueError("invalid email format")
        return trimmed

    @field_validator("password")
    @classmethod
    def password_must_not_be_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("password is required")
        return v


class RegistrationRequest(AuthRequest):
    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if len(v) < 15:
            raise ValueError("password must contain at least 15 characters")
        if len(v) > 128:
            raise ValueError("password must not exceed 128 characters")
        return v


def _make_auth_response(status_code: int, content: dict[str, object], token: str) -> JSONResponse:
    config = get_config()
    secure = config.app_env != "development"
    response = JSONResponse(status_code=status_code, content=content)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=int(TOKEN_EXPIRY.total_seconds()),
        httponly=True,
        samesite="lax",
        path="/",
        secure=secure,
    )
    return response


@router.post("/auth/register")
def register(
    body: RegistrationRequest,
    session: Session = Depends(get_session),
) -> JSONResponse:
    try:
        user, token = register_user(session, body.email, body.password)
    except EmailAlreadyRegisteredError as exc:
        logger.info("Registration failed: duplicate email")
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc)},
        )
    except RegistrationError as exc:
        logger.info("Registration failed: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": str(exc)},
        )
    return _make_auth_response(
        status.HTTP_201_CREATED,
        UserOut.model_validate(user).model_dump(),
        token,
    )


@router.post("/auth/login")
def login(
    body: AuthRequest,
    session: Session = Depends(get_session),
) -> JSONResponse:
    try:
        user, token = login_user(session, body.email, body.password)
    except LoginError:
        logger.info("Login failed: invalid credentials")
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Invalid credentials"},
        )
    return _make_auth_response(
        status.HTTP_200_OK,
        UserOut.model_validate(user).model_dump(),
        token,
    )


@router.get("/auth/me")
def me(current_user: User = Depends(get_current_user)) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=UserOut.model_validate(current_user).model_dump(),
    )


@router.post("/auth/logout")
def logout(response: Response) -> Response:
    clear_auth_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
