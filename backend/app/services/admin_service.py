"""Administration domain operations: read-only overview and role promotion."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import User, UserRole


class AdminPromotionError(Exception):
    pass


class AdminNotFoundError(AdminPromotionError):
    pass


def registered_user_count(session: Session) -> int:
    return session.query(func.count(User.id)).scalar() or 0


def promote_to_admin(session: Session, email: str) -> User:
    normalized_email = email.strip().lower()
    user = session.query(User).filter(User.email == normalized_email).first()
    if user is None:
        raise AdminNotFoundError(f"No account found for {normalized_email}")
    if user.role != UserRole.ADMIN.value:
        user.role = UserRole.ADMIN.value
        session.commit()
        session.refresh(user)
    return user
