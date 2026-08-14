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
from app.models import BodyWeightMeasurement

_CURSOR_VERSION = 1
_CURSOR_MAX_LENGTH = 512
_CURSOR_RE = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")

DEFAULT_PAGE_LIMIT = 5
MAX_PAGE_LIMIT = 50


class BodyWeightError(Exception):
    pass


def _encode_cursor(user_id: int, through_date: datetime.date) -> str:
    payload = {"v": _CURSOR_VERSION, "u": user_id, "d": through_date.isoformat()}
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(get_config().jwt_secret.encode("utf-8"), raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw + signature).decode("ascii").rstrip("=")


def _decode_cursor(token: str, user_id: int) -> datetime.date:
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
    if not isinstance(payload, dict) or set(payload.keys()) != {"v", "u", "d"}:
        raise BodyWeightError("Invalid cursor")
    if payload.get("v") != _CURSOR_VERSION:
        raise BodyWeightError("Invalid cursor")
    cursor_user_id = payload.get("u")
    if (
        isinstance(cursor_user_id, bool)
        or not isinstance(cursor_user_id, int)
        or cursor_user_id != user_id
    ):
        raise BodyWeightError("Invalid cursor")
    date_token = payload.get("d")
    if not isinstance(date_token, str) or not date_token:
        raise BodyWeightError("Invalid cursor")
    try:
        return datetime.date.fromisoformat(date_token)
    except ValueError:
        raise BodyWeightError("Invalid cursor") from None


def measurement_payload(measurement: BodyWeightMeasurement) -> dict[str, object]:
    return {
        "measurement_date": measurement.measurement_date.isoformat(),
        "weight_kg": float(measurement.weight_kg),
        "note": measurement.note,
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


def list_measurements(
    session: Session, user_id: int, cursor: str | None, limit: int
) -> tuple[list[dict[str, object]], str | None]:
    query = session.query(BodyWeightMeasurement).filter(BodyWeightMeasurement.user_id == user_id)
    if cursor is not None:
        through_date = _decode_cursor(cursor, user_id)
        query = query.filter(BodyWeightMeasurement.measurement_date < through_date)

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
        next_cursor = _encode_cursor(user_id, page_rows[-1].measurement_date)

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


def delete_measurement(session: Session, user_id: int, measurement_date: datetime.date) -> bool:
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
    session.delete(measurement)
    session.commit()
    return True
