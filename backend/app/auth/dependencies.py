"""FastAPI dependency for extracting the current user from the JWT cookie."""

import logging

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.jwt import decode_token
from app.db import get_session
from app.models import User

logger = logging.getLogger(__name__)

COOKIE_NAME = "flexgym_token"


def get_current_user(
    session: Session = Depends(get_session),
    flexgym_token: str | None = Cookie(default=None),
) -> User:
    if flexgym_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    user_id = decode_token(flexgym_token)
    if user_id is None:
        logger.info("Authentication failed: invalid or expired token")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    user = session.get(User, user_id)
    if user is None:
        logger.info("Authentication failed: token references unknown user %d", user_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    return user
