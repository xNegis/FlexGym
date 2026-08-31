"""Administration endpoints: read-only overview."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.db import get_session
from app.models import User
from app.services import admin_service

router = APIRouter(tags=["admin"])


@router.get("/admin/overview")
def admin_overview(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict[str, int]:
    return {"registered_user_count": admin_service.registered_user_count(session)}
