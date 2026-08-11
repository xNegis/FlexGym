"""Authentication cookie helpers shared by authenticated endpoints."""

from fastapi import Response

from app.auth.dependencies import COOKIE_NAME
from app.config import get_config


def clear_auth_cookie(response: Response) -> None:
    config = get_config()
    secure = config.app_env != "development"
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=secure,
    )
