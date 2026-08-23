"""Body weight measurement domain operations: history, upsert, deletion, and resolution."""

from __future__ import annotations

import base64
import datetime
import hashlib
import hmac
import json
import re

from sqlalchemy.orm import Session

from app.config import get_config
from app.models import BodyWeightMeasurement, PhotoDeletion
from app.services import photo_service
from app.services.progress_service import resolve_period
from app.storage.base import ObjectStore

_CURSOR_VERSION = 1
_CURSOR_MAX_LENGTH = 512
_CURSOR_RE = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")

DEFAULT_PAGE_LIMIT = 5
MAX_PAGE_LIMIT = 50


class BodyWeightError(Exception):
    pass


def _sign_and_encode(payload: dict[str, object]) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(get_config().jwt_secret.encode("utf-8"), raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw + signature).decode("ascii").rstrip("=")


def _verify_and_decode(token: str) -> dict[str, object]:
    if not token or len(token) > _CURSOR_MAX_LENGTH:
        raise BodyWeightError("Invalid cursor")
    if not _CURSOR_RE.fullmatch(token):
        raise BodyWeightError("Invalid cursor")
    padded = token + "=" * (-len(token) % 4)
    try:
        signed = base64.urlsafe_b64decode(padded.encode("ascii"))
    except (ValueError, UnicodeDecodeError):
        raise BodyWeightError("Invalid cursor") from None
    if len(signed) <= hashlib.sha256().digest_size:
        raise BodyWeightError("Invalid cursor")
    raw = signed[: -hashlib.sha256().digest_size]
    signature = signed[-hashlib.sha256().digest_size :]
    expected = hmac.new(get_config().jwt_secret.encode("utf-8"), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise BodyWeightError("Invalid cursor")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise BodyWeightError("Invalid cursor") from None
    if not isinstance(payload, dict) or payload.get("v") != _CURSOR_VERSION:
        raise BodyWeightError("Invalid cursor")
    return payload


def _require_payload_user(payload: dict[str, object], user_id: int) -> None:
    cursor_user_id = payload.get("u")
    if (
        isinstance(cursor_user_id, bool)
        or not isinstance(cursor_user_id, int)
        or cursor_user_id != user_id
    ):
        raise BodyWeightError("Invalid cursor")


def _parse_payload_date(payload: dict[str, object], key: str) -> datetime.date:
    date_token = payload.get(key)
    if not isinstance(date_token, str) or not date_token:
        raise BodyWeightError("Invalid cursor")
    try:
        return datetime.date.fromisoformat(date_token)
    except ValueError:
        raise BodyWeightError("Invalid cursor") from None


def _encode_cursor(
    user_id: int, boundary_date: datetime.date, period: str | None, local_date: datetime.date | None
) -> str:
    payload: dict[str, object] = {
        "v": _CURSOR_VERSION,
        "u": user_id,
        "b": boundary_date.isoformat(),
    }
    if period is not None and local_date is not None:
        payload["p"] = period
        payload["d"] = local_date.isoformat()
    return _sign_and_encode(payload)


def _decode_cursor(
    token: str, user_id: int, period: str | None, local_date: datetime.date | None
) -> datetime.date:
    payload = _verify_and_decode(token)
    _require_payload_user(payload, user_id)
    if period is not None and local_date is not None:
        if set(payload.keys()) != {"v", "u", "b", "p", "d"}:
            raise BodyWeightError("Invalid cursor")
        if payload.get("p") != period or payload.get("d") != local_date.isoformat():
            raise BodyWeightError("Invalid cursor")
    elif set(payload.keys()) != {"v", "u", "b"}:
        raise BodyWeightError("Invalid cursor")
    return _parse_payload_date(payload, "b")


def measurement_payload(measurement: BodyWeightMeasurement) -> dict[str, object]:
    return {
        "measurement_date": measurement.measurement_date.isoformat(),
        "weight_kg": float(measurement.weight_kg),
        "note": measurement.note,
        "photo_count": len(measurement.photos),
        "created_at": measurement.created_at.isoformat(),
        "updated_at": measurement.updated_at.isoformat(),
    }


def get_latest_measurement(session: Session, user_id: int) -> BodyWeightMeasurement | None:
    return (
        session.query(BodyWeightMeasurement)
        .filter(BodyWeightMeasurement.user_id == user_id)
        .order_by(BodyWeightMeasurement.measurement_date.desc(), BodyWeightMeasurement.id.desc())
        .first()
    )


def resolve_current_weight(
    session: Session, user_id: int, fallback_weight_kg: float
) -> tuple[float, datetime.date | None]:
    latest = get_latest_measurement(session, user_id)
    if latest is not None:
        return float(latest.weight_kg), latest.measurement_date
    return float(fallback_weight_kg), None


def _measurement_chart_item(measurement: BodyWeightMeasurement) -> dict[str, object]:
    return {
        "measurement_date": measurement.measurement_date.isoformat(),
        "weight_kg": float(measurement.weight_kg),
        "note": measurement.note,
    }


def get_body_weight_chart(
    session: Session,
    user_id: int,
    period: str,
    local_date: datetime.date,
) -> dict[str, object]:
    from_date, through_date = resolve_period(period, local_date)

    query = session.query(BodyWeightMeasurement).filter(BodyWeightMeasurement.user_id == user_id)
    if from_date is not None:
        query = query.filter(BodyWeightMeasurement.measurement_date >= from_date)
    query = query.filter(BodyWeightMeasurement.measurement_date <= through_date)

    measurements = query.order_by(
        BodyWeightMeasurement.measurement_date.asc(), BodyWeightMeasurement.id.asc()
    ).all()

    items = [_measurement_chart_item(measurement) for measurement in measurements]

    summary: dict[str, object] = {"latest": None, "previous": None, "change_kg": None}
    if len(measurements) >= 1:
        latest = measurements[-1]
        summary["latest"] = {
            "measurement_date": latest.measurement_date.isoformat(),
            "weight_kg": float(latest.weight_kg),
        }
    if len(measurements) >= 2:
        latest = measurements[-1]
        previous = measurements[-2]
        summary["previous"] = {
            "measurement_date": previous.measurement_date.isoformat(),
            "weight_kg": float(previous.weight_kg),
        }
        summary["change_kg"] = round(float(latest.weight_kg) - float(previous.weight_kg), 1)

    return {
        "period": period,
        "range_start": from_date.isoformat() if from_date is not None else None,
        "range_end": through_date.isoformat(),
        "items": items,
        "summary": summary,
    }


def list_measurements(
    session: Session,
    user_id: int,
    cursor: str | None,
    limit: int,
    period: str | None = None,
    local_date: datetime.date | None = None,
) -> tuple[list[dict[str, object]], str | None]:
    from_date: datetime.date | None = None
    through_date: datetime.date | None = None
    if period is not None and local_date is not None:
        from_date, through_date = resolve_period(period, local_date)

    query = session.query(BodyWeightMeasurement).filter(BodyWeightMeasurement.user_id == user_id)
    if from_date is not None:
        query = query.filter(BodyWeightMeasurement.measurement_date >= from_date)
    if through_date is not None:
        query = query.filter(BodyWeightMeasurement.measurement_date <= through_date)

    if cursor is not None:
        boundary = _decode_cursor(cursor, user_id, period, local_date)
        query = query.filter(BodyWeightMeasurement.measurement_date < boundary)

    rows = (
        query.order_by(
            BodyWeightMeasurement.measurement_date.desc(), BodyWeightMeasurement.id.desc()
        )
        .limit(limit + 1)
        .all()
    )

    has_more = len(rows) > limit
    page_rows = rows[:limit]

    next_cursor: str | None = None
    if has_more:
        next_cursor = _encode_cursor(user_id, page_rows[-1].measurement_date, period, local_date)

    items = [measurement_payload(measurement) for measurement in page_rows]
    return items, next_cursor


def upsert_measurement(
    session: Session,
    user_id: int,
    measurement_date: datetime.date,
    weight_kg: float,
    note: str | None,
) -> tuple[BodyWeightMeasurement, bool]:
    existing = (
        session.query(BodyWeightMeasurement)
        .filter(
            BodyWeightMeasurement.user_id == user_id,
            BodyWeightMeasurement.measurement_date == measurement_date,
        )
        .first()
    )

    if existing is not None:
        existing.weight_kg = weight_kg
        existing.note = note
        session.commit()
        session.refresh(existing)
        return existing, False

    measurement = BodyWeightMeasurement(
        user_id=user_id,
        measurement_date=measurement_date,
        weight_kg=weight_kg,
        note=note,
    )
    session.add(measurement)
    session.commit()
    session.refresh(measurement)
    return measurement, True


def delete_measurement(
    session: Session,
    store: ObjectStore,
    user_id: int,
    measurement_date: datetime.date,
) -> bool:
    measurement = (
        session.query(BodyWeightMeasurement)
        .filter(
            BodyWeightMeasurement.user_id == user_id,
            BodyWeightMeasurement.measurement_date == measurement_date,
        )
        .first()
    )
    if measurement is None:
        return False

    photo_keys = [photo.object_key for photo in measurement.photos]
    session.delete(measurement)
    for key in photo_keys:
        session.add(PhotoDeletion(object_key=key))
    session.commit()

    photo_service.attempt_delete_objects(session, store, photo_keys)
    return True
