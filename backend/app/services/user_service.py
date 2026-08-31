"""User domain operations: registration availability, creation, and lookup."""

import re

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.jwt import create_token
from app.auth.password import hash_password, verify_password
from app.models import User, UserRole

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegistrationError(Exception):
    pass


class LoginError(Exception):
    pass


class EmailAlreadyRegisteredError(RegistrationError):
    pass


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _validate_email(email: str) -> None:
    if not email:
        raise RegistrationError("Email is required")
    if not EMAIL_RE.match(email):
        raise RegistrationError("Invalid email format")


def _validate_password(password: str) -> None:
    if len(password) < 15:
        raise RegistrationError("Password must be at least 15 characters")
    if len(password) > 128:
        raise RegistrationError("Password must not exceed 128 characters")


def register_user(session: Session, email: str, password: str) -> tuple[User, str]:
    normalized_email = _normalize_email(email)
    _validate_email(normalized_email)
    _validate_password(password)

    existing = session.query(User).filter(User.email == normalized_email).first()
    if existing is not None:
        raise EmailAlreadyRegisteredError("Email is already registered")

    user = User(
        email=normalized_email,
        password_hash=hash_password(password),
        role=UserRole.USER.value,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise EmailAlreadyRegisteredError("Email is already registered") from exc
    session.refresh(user)

    token = create_token(user.id)
    return user, token


def login_user(session: Session, email: str, password: str) -> tuple[User, str]:
    normalized_email = _normalize_email(email)
    if not normalized_email or not password:
        raise LoginError("Invalid credentials")

    user = session.query(User).filter(User.email == normalized_email).first()
    if user is None:
        raise LoginError("Invalid credentials")

    if not verify_password(password, user.password_hash):
        raise LoginError("Invalid credentials")

    token = create_token(user.id)
    return user, token


def get_user_by_id(session: Session, user_id: int) -> User | None:
    return session.get(User, user_id)
