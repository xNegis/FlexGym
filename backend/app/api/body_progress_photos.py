"""Body-progress photo endpoints: browse, upload, reorder, view, and delete."""

from __future__ import annotations

import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app.auth.dependencies import get_current_user
from app.db import get_session
from app.models import User
from app.services import photo_service
from app.services.fitness_profile_service import get_fitness_profile
from app.services.image_processing import (
    ImageTooLargeError,
    InvalidImageError,
    UnsupportedImageError,
)
from app.services.photo_service import (
    GlobalPhotoLimitExceededError,
    InvalidPhotoOrderError,
    MeasurementNotFoundError,
    PhotoLimitExceededError,
    PhotoNotFoundError,
    StaleOrderError,
)
from app.storage import get_object_store
from app.storage.base import ObjectStore, StorageUnavailableError

router = APIRouter(tags=["body-progress-photos"])

MAX_INPUT_BYTES = 15 * 1024 * 1024


class PhotoOrderRequest(BaseModel):
    photo_ids: list[str]

    model_config = {"extra": "forbid"}

    @field_validator("photo_ids")
    @classmethod
    def validate_photo_ids(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("photo_ids must not be empty")
        for photo_id in value:
            if not isinstance(photo_id, str) or not photo_id.strip():
                raise ValueError("photo_ids must be non-empty strings")
            try:
                uuid.UUID(photo_id)
            except ValueError:
                raise ValueError("photo_ids contains a malformed id") from None
        return value


def _require_profile(session: Session, user_id: int) -> None:
    if get_fitness_profile(session, user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fitness profile not found",
        )


def _require_subset(request: Request, allowed: set[str]) -> None:
    if not set(request.query_params.keys()).issubset(allowed):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "Unknown query parameter"}],
        )


@router.get("/body-weight-measurements/{measurement_date}/photos")
def list_photos(
    request: Request,
    measurement_date: datetime.date,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    _require_subset(request, set())
    _require_profile(session, user.id)
    try:
        return photo_service.list_photos(session, user.id, measurement_date)
    except MeasurementNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Body weight measurement not found",
        ) from None


@router.post("/body-weight-measurements/{measurement_date}/photos")
async def upload_photos(
    measurement_date: datetime.date,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_object_store),
) -> Response:
    _require_profile(session, user.id)

    form = await request.form()
    for field_name in form.keys():
        if field_name != "photos":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"msg": "Unexpected multipart field"}],
            )

    uploads = form.getlist("photos")
    if not uploads or len(uploads) > 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "photos must contain between one and five files"}],
        )

    raw_files: list[bytes] = []
    for upload in uploads:
        if not isinstance(upload, UploadFile):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"msg": "photos must contain files only"}],
            )
        data = await _read_bounded(upload)
        raw_files.append(data)

    try:
        result = photo_service.upload_photos(session, store, user.id, measurement_date, raw_files)
    except MeasurementNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Body weight measurement not found",
        ) from None
    except PhotoLimitExceededError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A measurement can retain at most five photos",
        ) from None
    except GlobalPhotoLimitExceededError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The installation-wide photo limit has been reached",
        ) from None
    except ImageTooLargeError:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="A photo exceeds the 15 MiB limit",
        ) from None
    except UnsupportedImageError:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The image format is not supported",
        ) from None
    except InvalidImageError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "The image data is invalid or unsafe"}],
        ) from None
    except StorageUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Private photo storage is unavailable",
        ) from None

    return Response(
        content=_json_bytes(result),
        media_type="application/json",
        status_code=status.HTTP_201_CREATED,
    )


async def _read_bounded(upload: UploadFile) -> bytes:
    data = await upload.read(MAX_INPUT_BYTES + 1)
    if len(data) > MAX_INPUT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="A photo exceeds the 15 MiB limit",
        )
    return data


def _json_bytes(value: object) -> bytes:
    import json

    return json.dumps(value).encode("utf-8")


@router.put("/body-weight-measurements/{measurement_date}/photos/order")
def reorder_photos(
    measurement_date: datetime.date,
    body: PhotoOrderRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    _require_profile(session, user.id)
    try:
        return photo_service.reorder_photos(session, user.id, measurement_date, body.photo_ids)
    except MeasurementNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Body weight measurement not found",
        ) from None
    except InvalidPhotoOrderError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"msg": "The photo order is invalid"}],
        ) from None
    except StaleOrderError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The photo set has changed; please reload",
        ) from None


@router.get("/body-progress-photos/{photo_id}/content")
def get_photo_content(
    photo_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_object_store),
) -> Response:
    _require_profile(session, user.id)
    try:
        content = photo_service.get_photo_content(session, store, user.id, photo_id)
    except PhotoNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo not found",
        ) from None
    except StorageUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Private photo storage is unavailable",
        ) from None

    return StreamingResponse(
        iter([content]),
        media_type="image/jpeg",
        headers={
            "Content-Disposition": "inline",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/body-progress-photos/{photo_id}")
def delete_photo(
    photo_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_object_store),
) -> Response:
    _require_profile(session, user.id)
    try:
        photo_service.delete_photo(session, store, user.id, photo_id)
    except PhotoNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo not found",
        ) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
