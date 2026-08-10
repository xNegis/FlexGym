import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import check_database_connection, get_session

__all__ = ["router", "check_database_connection"]

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health(session: Session = Depends(get_session)) -> JSONResponse:
    try:
        check_database_connection(session)
    except Exception:
        logger.exception("Health check failed: database unavailable")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable"},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "ok"},
    )
