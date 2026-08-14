"""Body-progress photo domain operations.

Photos are ownership-scoped metadata rows in SQLite plus normalized image bytes
in private object storage. A batch upload is user-atomic: every object is written
and every metadata row persisted before any photo becomes visible, and partial
work is compensated on failure. Deletion revokes access and durably records the
object key before idempotent storage cleanup is attempted.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_config
from app.models import BodyProgressPhoto, BodyWeightMeasurement, PhotoDeletion, User
from app.services.image_processing import NormalizedImage, normalize_image
from app.storage.base import ObjectNotFoundError, ObjectStore, StorageUnavailableError

MAX_PHOTOS_PER_MEASUREMENT = 5
CONTENT_PATH_PREFIX = "/api/body-progress-photos"


class PhotoServiceError(Exception):
    """Base class for contained photo-domain failures."""


class MeasurementNotFoundError(PhotoServiceError):
    pass


class PhotoNotFoundError(PhotoServiceError):
    pass


class PhotoLimitExceededError(PhotoServiceError):
    pass


class StaleOrderError(PhotoServiceError):
    pass


class InvalidPhotoOrderError(PhotoServiceError):
    pass


def build_object_key(
    prefix: str, namespace: uuid.UUID, measurement_date: datetime.date, photo_uuid: uuid.UUID
) -> str:
    return (
        f"{prefix.strip('/')}/users/{namespace}/"
        f"measurements/{measurement_date.isoformat()}/{photo_uuid}.jpg"
    )


def _owned_measurement(
    session: Session, user_id: int, measurement_date: datetime.date
) -> BodyWeightMeasurement:
    measurement = (
        session.query(BodyWeightMeasurement)
        .filter(
            BodyWeightMeasurement.user_id == user_id,
            BodyWeightMeasurement.measurement_date == measurement_date,
        )
        .first()
    )
    if measurement is None:
        raise MeasurementNotFoundError("Body weight measurement not found")
    return measurement


def _photo_payload(photo: BodyProgressPhoto) -> dict[str, object]:
    return {
        "id": str(photo.id),
        "display_order": photo.display_order,
        "width": photo.width,
        "height": photo.height,
        "byte_size": photo.byte_size,
        "created_at": photo.created_at.isoformat(),
        "content_path": f"{CONTENT_PATH_PREFIX}/{photo.id}/content",
    }


def _page_payload(
    measurement: BodyWeightMeasurement, photos: list[BodyProgressPhoto]
) -> dict[str, object]:
    return {
        "measurement": {
            "measurement_date": measurement.measurement_date.isoformat(),
            "weight_kg": float(measurement.weight_kg),
            "note": measurement.note,
        },
        "photos": [_photo_payload(photo) for photo in photos],
        "photo_count": len(photos),
        "remaining_capacity": MAX_PHOTOS_PER_MEASUREMENT - len(photos),
    }


def _ordered_photos(session: Session, measurement_id: int) -> list[BodyProgressPhoto]:
    return (
        session.query(BodyProgressPhoto)
        .filter(BodyProgressPhoto.measurement_id == measurement_id)
        .order_by(BodyProgressPhoto.display_order)
        .all()
    )


def list_photos(
    session: Session, user_id: int, measurement_date: datetime.date
) -> dict[str, object]:
    measurement = _owned_measurement(session, user_id, measurement_date)
    return _page_payload(measurement, _ordered_photos(session, measurement.id))


def upload_photos(
    session: Session,
    store: ObjectStore,
    user_id: int,
    measurement_date: datetime.date,
    raw_files: list[bytes],
) -> dict[str, object]:
    measurement = _owned_measurement(session, user_id, measurement_date)
    existing_count = _count_photos(session, measurement.id)

    if existing_count + len(raw_files) > MAX_PHOTOS_PER_MEASUREMENT:
        raise PhotoLimitExceededError("A measurement can retain at most five photos")

    normalized: list[NormalizedImage] = []
    for raw in raw_files:
        normalized.append(normalize_image(raw))

    user = session.get(User, user_id)
    if user is None:
        raise MeasurementNotFoundError("Body weight measurement not found")
    if user.photo_storage_namespace is None:
        user.photo_storage_namespace = uuid.uuid4()
        session.flush()
    namespace = user.photo_storage_namespace

    prefix = get_config().s3_prefix
    entries: list[tuple[uuid.UUID, str, NormalizedImage]] = []
    for image in normalized:
        photo_uuid = uuid.uuid4()
        key = build_object_key(prefix, namespace, measurement_date, photo_uuid)
        entries.append((photo_uuid, key, image))

    put_keys: list[str] = []
    try:
        for _photo_uuid, key, image in entries:
            store.put(key, image.data)
            put_keys.append(key)
    except StorageUnavailableError:
        _compensate(session, store, put_keys)
        raise

    next_order = existing_count
    for photo_uuid, key, image in entries:
        session.add(
            BodyProgressPhoto(
                id=photo_uuid,
                measurement_id=measurement.id,
                object_key=key,
                display_order=next_order,
                content_type=image.content_type,
                byte_size=len(image.data),
                width=image.width,
                height=image.height,
            )
        )
        next_order += 1

    try:
        session.commit()
    except Exception:
        session.rollback()
        _compensate(session, store, put_keys)
        raise StorageUnavailableError("The photo upload could not be completed") from None

    return _page_payload(measurement, _ordered_photos(session, measurement.id))


def _count_photos(session: Session, measurement_id: int) -> int:
    return (
        session.query(func.count(BodyProgressPhoto.id))
        .filter(BodyProgressPhoto.measurement_id == measurement_id)
        .scalar()
        or 0
    )


def _compensate(session: Session, store: ObjectStore, keys: list[str]) -> None:
    """Remove failed-upload objects, retaining unreachable keys for retry."""
    pending_keys: list[str] = []
    for key in keys:
        try:
            store.delete(key)
        except StorageUnavailableError:
            pending_keys.append(key)

    # A failed upload has no visible metadata row, but its unreachable objects
    # still need their exact keys recorded for the normal durable cleanup path.
    # The rollback before this function is intentional when persistence failed.
    for key in pending_keys:
        session.add(PhotoDeletion(object_key=key))
    if pending_keys:
        session.commit()


def reorder_photos(
    session: Session, user_id: int, measurement_date: datetime.date, photo_ids: list[str]
) -> dict[str, object]:
    measurement = _owned_measurement(session, user_id, measurement_date)

    parsed_ids: list[uuid.UUID] = []
    for token in photo_ids:
        try:
            parsed_ids.append(uuid.UUID(token))
        except (ValueError, AttributeError):
            raise InvalidPhotoOrderError("Invalid photo id") from None

    if len(set(parsed_ids)) != len(parsed_ids):
        raise InvalidPhotoOrderError("Duplicate photo ids")

    current = _ordered_photos(session, measurement.id)
    current_by_id = {photo.id: photo for photo in current}

    submitted_set = set(parsed_ids)
    current_set = set(current_by_id.keys())

    if any(photo_id not in current_set for photo_id in submitted_set):
        raise StaleOrderError("The photo set has changed; please reload")
    if any(photo_id not in submitted_set for photo_id in current_set):
        raise InvalidPhotoOrderError("The order must include every current photo")

    try:
        _assign_contiguous_order(
            session,
            current,
            [current_by_id[photo_id] for photo_id in parsed_ids],
        )
        session.commit()
    except IntegrityError:
        session.rollback()
        raise StaleOrderError("The photo set has changed; please reload") from None
    return _page_payload(measurement, _ordered_photos(session, measurement.id))


def _assign_contiguous_order(
    session: Session,
    current: list[BodyProgressPhoto],
    desired: list[BodyProgressPhoto],
) -> None:
    """Assign a complete order without transient unique-key collisions."""
    for photo in current:
        photo.display_order += MAX_PHOTOS_PER_MEASUREMENT
    session.flush()
    for index, photo in enumerate(desired):
        photo.display_order = index
    session.flush()


def get_photo_content(session: Session, store: ObjectStore, user_id: int, photo_id: str) -> bytes:
    photo = _owned_photo(session, user_id, photo_id)
    if _is_pending_deletion(session, photo.object_key):
        raise PhotoNotFoundError("Photo not found")
    try:
        return store.get(photo.object_key)
    except ObjectNotFoundError:
        raise PhotoNotFoundError("Photo not found") from None


def delete_photo(session: Session, store: ObjectStore, user_id: int, photo_id: str) -> None:
    photo = _owned_photo(session, user_id, photo_id)
    key = photo.object_key
    measurement_id = photo.measurement_id
    session.delete(photo)
    session.flush()
    remaining = _ordered_photos(session, measurement_id)
    _assign_contiguous_order(session, remaining, remaining)
    session.add(PhotoDeletion(object_key=key))
    session.commit()

    attempt_delete_objects(session, store, [key])


def _owned_photo(session: Session, user_id: int, photo_id: str) -> BodyProgressPhoto:
    try:
        parsed = uuid.UUID(photo_id)
    except (ValueError, AttributeError):
        raise PhotoNotFoundError("Photo not found") from None

    photo = (
        session.query(BodyProgressPhoto)
        .join(BodyWeightMeasurement, BodyProgressPhoto.measurement_id == BodyWeightMeasurement.id)
        .filter(BodyProgressPhoto.id == parsed, BodyWeightMeasurement.user_id == user_id)
        .first()
    )
    if photo is None:
        raise PhotoNotFoundError("Photo not found")
    return photo


def _is_pending_deletion(session: Session, object_key: str) -> bool:
    return (
        session.query(PhotoDeletion).filter(PhotoDeletion.object_key == object_key).first()
        is not None
    )


def attempt_delete_objects(session: Session, store: ObjectStore, keys: list[str]) -> None:
    for key in keys:
        try:
            store.delete(key)
        except StorageUnavailableError:
            continue
        record = session.query(PhotoDeletion).filter(PhotoDeletion.object_key == key).first()
        if record is not None:
            session.delete(record)
    session.commit()


def retry_pending_deletions(session: Session, store: ObjectStore) -> None:
    """Retry cleanup for objects whose deletion has not yet succeeded."""
    records = session.query(PhotoDeletion).all()
    for record in records:
        try:
            store.delete(record.object_key)
        except StorageUnavailableError:
            continue
        session.delete(record)
    session.commit()
