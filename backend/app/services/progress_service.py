"""Progress domain operations: exercise performance history and read-time metrics."""

from __future__ import annotations

import base64
import calendar
import datetime
import hashlib
import hmac
import json
import re
from typing import Any, cast

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_config
from app.models import PerformedSet, WorkoutExercise, WorkoutPlannedSet, WorkoutSession
from app.services.exercise_service import get_exercise_by_slug

TERMINAL_STATUSES = ("completed", "cancelled")

PERIODS = ("1m", "3m", "6m", "1y", "all")

_PROGRESS_CURSOR_VERSION = 1
_PROGRESS_CURSOR_MAX_LENGTH = 512
_PROGRESS_CURSOR_RE = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")


class ProgressError(Exception):
    pass


def _workout_terminal_at(workout: WorkoutSession) -> datetime.datetime | None:
    return workout.completed_at if workout.status == "completed" else workout.cancelled_at


def _epley_1rm(weight: float, reps: float) -> float:
    return weight * (1 + reps / 30)


# ────────────────── periods (FR-3 / FR-4) ──────────────────


def _shift_months(value: datetime.date, months: int) -> datetime.date:
    total = value.year * 12 + (value.month - 1) + months
    year, month_index = divmod(total, 12)
    month = month_index + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return datetime.date(year, month, day)


def resolve_period(
    period: str, local_date: datetime.date
) -> tuple[datetime.date | None, datetime.date]:
    if period not in PERIODS:
        raise ValueError("Unsupported progress period")
    months = {"1m": -1, "3m": -3, "6m": -6, "1y": -12}.get(period)
    if months is None:
        return None, local_date
    return _shift_months(local_date, months), local_date


# ────────────────── exercise list (FR-3) ──────────────────


def list_exercise_progress(session: Session, user_id: int) -> list[dict[str, object]]:
    terminal = func.coalesce(WorkoutSession.completed_at, WorkoutSession.cancelled_at)

    summary_rows = (
        session.query(
            WorkoutExercise.exercise_slug,
            func.count(func.distinct(WorkoutSession.id)).label("session_count"),
            func.max(terminal).label("latest_terminal_at"),
            func.max(PerformedSet.completed_at).label("last_performed_at"),
        )
        .join(WorkoutSession, WorkoutSession.id == WorkoutExercise.workout_session_id)
        .join(WorkoutPlannedSet, WorkoutPlannedSet.workout_exercise_id == WorkoutExercise.id)
        .join(PerformedSet, PerformedSet.workout_planned_set_id == WorkoutPlannedSet.id)
        .filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status.in_(TERMINAL_STATUSES),
            WorkoutExercise.target_type == "repetitions",
        )
        .group_by(WorkoutExercise.exercise_slug)
        .all()
    )

    ranked_snapshots = (
        session.query(
            WorkoutExercise.exercise_slug.label("exercise_slug"),
            WorkoutExercise.exercise_name.label("exercise_name"),
            WorkoutSession.local_date.label("local_date"),
            func.row_number()
            .over(
                partition_by=WorkoutExercise.exercise_slug,
                order_by=(
                    terminal.desc(),
                    WorkoutSession.id.desc(),
                    WorkoutExercise.position.asc(),
                ),
            )
            .label("snapshot_rank"),
        )
        .join(WorkoutSession, WorkoutSession.id == WorkoutExercise.workout_session_id)
        .join(WorkoutPlannedSet, WorkoutPlannedSet.workout_exercise_id == WorkoutExercise.id)
        .join(PerformedSet, PerformedSet.workout_planned_set_id == WorkoutPlannedSet.id)
        .filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status.in_(TERMINAL_STATUSES),
            WorkoutExercise.target_type == "repetitions",
        )
        .subquery()
    )
    latest_rows = session.execute(
        select(
            ranked_snapshots.c.exercise_slug,
            ranked_snapshots.c.exercise_name,
            ranked_snapshots.c.local_date,
        ).where(ranked_snapshots.c.snapshot_rank == 1)
    ).all()
    latest_by_slug = {row.exercise_slug: row for row in latest_rows}

    summary_rows.sort(key=lambda row: row.exercise_slug)
    summary_rows.sort(key=lambda row: row.latest_terminal_at, reverse=True)

    return [
        {
            "exercise_slug": row.exercise_slug,
            "exercise_name": latest_by_slug[row.exercise_slug].exercise_name,
            "session_count": row.session_count,
            "last_local_date": latest_by_slug[row.exercise_slug].local_date.isoformat(),
            "last_performed_at": row.last_performed_at.isoformat(),
        }
        for row in summary_rows
    ]


# ────────────────── cursors ──────────────────


def _encode_progress_cursor(
    user_id: int,
    slug: str,
    period: str,
    through_date: datetime.date,
    terminal_at: datetime.datetime,
    workout_id: int,
) -> str:
    payload = {
        "v": _PROGRESS_CURSOR_VERSION,
        "u": user_id,
        "e": slug,
        "p": period,
        "d": through_date.isoformat(),
        "t": terminal_at.isoformat(),
        "i": workout_id,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(get_config().jwt_secret.encode("utf-8"), raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw + signature).decode("ascii").rstrip("=")


def _decode_progress_cursor(
    token: str,
    user_id: int,
    slug: str,
    period: str,
    through_date: datetime.date,
) -> tuple[datetime.datetime, int]:
    if not token or len(token) > _PROGRESS_CURSOR_MAX_LENGTH:
        raise ProgressError("Invalid cursor")
    if not _PROGRESS_CURSOR_RE.fullmatch(token):
        raise ProgressError("Invalid cursor")
    padded = token + "=" * (-len(token) % 4)
    try:
        signed = base64.urlsafe_b64decode(padded.encode("ascii"))
    except (ValueError, UnicodeDecodeError):
        raise ProgressError("Invalid cursor") from None
    if len(signed) <= hashlib.sha256().digest_size:
        raise ProgressError("Invalid cursor")
    raw = signed[: -hashlib.sha256().digest_size]
    signature = signed[-hashlib.sha256().digest_size :]
    expected = hmac.new(get_config().jwt_secret.encode("utf-8"), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise ProgressError("Invalid cursor")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise ProgressError("Invalid cursor") from None
    if not isinstance(payload, dict) or set(payload.keys()) != {"v", "u", "e", "p", "d", "t", "i"}:
        raise ProgressError("Invalid cursor")
    if payload.get("v") != _PROGRESS_CURSOR_VERSION:
        raise ProgressError("Invalid cursor")
    if payload.get("e") != slug:
        raise ProgressError("Invalid cursor")
    if payload.get("p") != period:
        raise ProgressError("Invalid cursor")
    if payload.get("d") != through_date.isoformat():
        raise ProgressError("Invalid cursor")
    cursor_user_id = payload.get("u")
    if (
        isinstance(cursor_user_id, bool)
        or not isinstance(cursor_user_id, int)
        or cursor_user_id != user_id
    ):
        raise ProgressError("Invalid cursor")
    workout_id = payload.get("i")
    if isinstance(workout_id, bool) or not isinstance(workout_id, int) or workout_id <= 0:
        raise ProgressError("Invalid cursor")
    terminal_token = payload.get("t")
    if not isinstance(terminal_token, str) or not terminal_token:
        raise ProgressError("Invalid cursor")
    try:
        terminal_at = datetime.datetime.fromisoformat(terminal_token)
    except ValueError:
        raise ProgressError("Invalid cursor") from None
    return terminal_at, workout_id


# ────────────────── exercise history (FR-4..FR-9) ──────────────────


def _resolve_latest_snapshot_name(session: Session, user_id: int, slug: str) -> str | None:
    terminal = func.coalesce(WorkoutSession.completed_at, WorkoutSession.cancelled_at)
    row = (
        session.query(WorkoutExercise.exercise_name)
        .join(WorkoutSession, WorkoutSession.id == WorkoutExercise.workout_session_id)
        .join(WorkoutPlannedSet, WorkoutPlannedSet.workout_exercise_id == WorkoutExercise.id)
        .join(PerformedSet, PerformedSet.workout_planned_set_id == WorkoutPlannedSet.id)
        .filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status.in_(TERMINAL_STATUSES),
            WorkoutExercise.exercise_slug == slug,
            WorkoutExercise.target_type == "repetitions",
        )
        .order_by(terminal.desc(), WorkoutSession.id.desc(), WorkoutExercise.position.asc())
        .first()
    )
    if row is None:
        return None
    return cast(str, row[0])


def _build_history_items(
    session: Session, workouts: list[WorkoutSession], slug: str
) -> list[dict[str, object]]:
    if not workouts:
        return []

    workout_ids = [workout.id for workout in workouts]
    exercises = (
        session.query(WorkoutExercise)
        .options(
            selectinload(WorkoutExercise.planned_sets).selectinload(WorkoutPlannedSet.performed_set)
        )
        .filter(
            WorkoutExercise.workout_session_id.in_(workout_ids),
            WorkoutExercise.exercise_slug == slug,
            WorkoutExercise.target_type == "repetitions",
        )
        .all()
    )

    by_workout: dict[int, list[WorkoutExercise]] = {}
    for we in exercises:
        by_workout.setdefault(we.workout_session_id, []).append(we)

    items: list[dict[str, object]] = []
    for workout in workouts:
        occurrences = sorted(by_workout.get(workout.id, []), key=lambda we: we.position)

        sets: list[dict[str, object]] = []
        total_reps = 0.0
        max_weight: float | None = None
        max_epley: float | None = None

        for we in occurrences:
            for ps in we.planned_sets:
                performed = ps.performed_set
                if performed is None:
                    continue
                reps = float(performed.performed_value)
                weight = (
                    float(performed.performed_weight_kg)
                    if performed.performed_weight_kg is not None
                    else None
                )
                sets.append(
                    {
                        "exercise_position": we.position,
                        "set_position": ps.position,
                        "performed_reps": int(reps),
                        "performed_weight_kg": weight,
                        "performed_rir": performed.performed_rir,
                        "completed_at": performed.completed_at.isoformat(),
                    }
                )
                total_reps += reps
                if weight is not None and weight > 0:
                    if max_weight is None or weight > max_weight:
                        max_weight = weight
                    epley = _epley_1rm(weight, reps)
                    if max_epley is None or epley > max_epley:
                        max_epley = epley

        terminal_at = _workout_terminal_at(workout)
        items.append(
            {
                "workout_id": workout.id,
                "routine_name": workout.routine_name,
                "selected_training_day_name": workout.selected_training_day_name,
                "local_date": workout.local_date.isoformat(),
                "status": workout.status,
                "terminal_at": terminal_at.isoformat() if terminal_at is not None else None,
                "total_reps": int(total_reps),
                "heaviest_weight_kg": round(max_weight, 2) if max_weight is not None else None,
                "estimated_1rm_kg": round(max_epley, 2) if max_epley is not None else None,
                "sets": sets,
            }
        )
    return items


def _performed_exists_expr(slug: str) -> Any:
    return (
        select(PerformedSet.id)
        .join(WorkoutPlannedSet, PerformedSet.workout_planned_set_id == WorkoutPlannedSet.id)
        .join(WorkoutExercise, WorkoutPlannedSet.workout_exercise_id == WorkoutExercise.id)
        .where(
            WorkoutExercise.workout_session_id == WorkoutSession.id,
            WorkoutExercise.exercise_slug == slug,
            WorkoutExercise.target_type == "repetitions",
        )
        .exists()
    )


def _has_any_history(session: Session, user_id: int, slug: str) -> bool:
    exists = (
        select(PerformedSet.id)
        .join(WorkoutPlannedSet, PerformedSet.workout_planned_set_id == WorkoutPlannedSet.id)
        .join(WorkoutExercise, WorkoutPlannedSet.workout_exercise_id == WorkoutExercise.id)
        .join(WorkoutSession, WorkoutExercise.workout_session_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status.in_(TERMINAL_STATUSES),
            WorkoutExercise.exercise_slug == slug,
            WorkoutExercise.target_type == "repetitions",
        )
        .exists()
    )
    return session.query(exists).scalar() is True


def _period_filters(
    query: Any, from_date: datetime.date | None, through_date: datetime.date
) -> Any:
    if from_date is not None:
        query = query.filter(WorkoutSession.local_date >= from_date)
    return query.filter(WorkoutSession.local_date <= through_date)


def get_exercise_chart(
    session: Session,
    user_id: int,
    slug: str,
    period: str,
    local_date: datetime.date,
) -> dict[str, object] | None:
    catalog = get_exercise_by_slug(session, slug)
    if catalog is None:
        return None

    from_date, through_date = resolve_period(period, local_date)

    terminal = func.coalesce(WorkoutSession.completed_at, WorkoutSession.cancelled_at)
    performed_exists = _performed_exists_expr(slug)

    query = session.query(WorkoutSession).filter(
        WorkoutSession.user_id == user_id,
        WorkoutSession.status.in_(TERMINAL_STATUSES),
        performed_exists,
    )
    query = _period_filters(query, from_date, through_date)

    workouts = query.order_by(
        WorkoutSession.local_date.asc(), terminal.asc(), WorkoutSession.id.asc()
    ).all()

    items = _build_history_items(session, workouts, slug)
    chart_items = [
        {key: value for key, value in item.items() if key != "total_reps"}
        for item in items
        if item["heaviest_weight_kg"] is not None
    ]

    name = _resolve_latest_snapshot_name(session, user_id, slug) or catalog.name

    return {
        "exercise": {"slug": slug, "name": name},
        "range": {
            "period": period,
            "from_local_date": from_date.isoformat() if from_date is not None else None,
            "through_local_date": through_date.isoformat(),
        },
        "has_any_history": _has_any_history(session, user_id, slug),
        "items": chart_items,
    }


def get_exercise_history(
    session: Session,
    user_id: int,
    slug: str,
    period: str,
    local_date: datetime.date,
    cursor: str | None,
    limit: int,
) -> dict[str, object] | None:
    catalog = get_exercise_by_slug(session, slug)
    if catalog is None:
        return None

    from_date, through_date = resolve_period(period, local_date)

    terminal = func.coalesce(WorkoutSession.completed_at, WorkoutSession.cancelled_at)
    performed_exists = _performed_exists_expr(slug)

    query = session.query(WorkoutSession).filter(
        WorkoutSession.user_id == user_id,
        WorkoutSession.status.in_(TERMINAL_STATUSES),
        performed_exists,
    )
    query = _period_filters(query, from_date, through_date)

    if cursor is not None:
        cursor_terminal, cursor_id = _decode_progress_cursor(
            cursor, user_id, slug, period, through_date
        )
        query = query.filter(
            or_(
                terminal < cursor_terminal,
                and_(terminal == cursor_terminal, WorkoutSession.id < cursor_id),
            )
        )

    rows = query.order_by(terminal.desc(), WorkoutSession.id.desc()).limit(limit + 1).all()

    has_more = len(rows) > limit
    page_rows = rows[:limit]

    items = _build_history_items(session, page_rows, slug)

    next_cursor: str | None = None
    if has_more:
        last = page_rows[-1]
        last_terminal = _workout_terminal_at(last)
        if last_terminal is not None:
            next_cursor = _encode_progress_cursor(
                user_id, slug, period, through_date, last_terminal, last.id
            )

    name = _resolve_latest_snapshot_name(session, user_id, slug) or catalog.name

    return {
        "exercise": {"slug": slug, "name": name},
        "range": {
            "period": period,
            "from_local_date": from_date.isoformat() if from_date is not None else None,
            "through_local_date": through_date.isoformat(),
        },
        "has_any_history": _has_any_history(session, user_id, slug),
        "items": items,
        "next_cursor": next_cursor,
    }
