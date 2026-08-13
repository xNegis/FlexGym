"""Tests for F21 Workout Statistics and Activity Trends."""

from __future__ import annotations

import datetime
import itertools
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient

from app.models import Exercise, WorkoutSession

_PLAN_COUNTER = itertools.count(1)


@pytest.fixture(autouse=True)
def seed_statistics_exercises(test_session_factory: Any) -> None:
    with test_session_factory() as session:
        session.add_all(
            [
                Exercise(
                    slug="stats-bench-press",
                    name="Stats Bench Press",
                    primary_muscle="chest",
                    secondary_muscles=["triceps"],
                    equipment="barbell",
                    movement_pattern="horizontal_push",
                    execution_type="bilateral",
                    instructions="Press the bar with control.",
                ),
                Exercise(
                    slug="stats-plank",
                    name="Stats Plank",
                    primary_muscle="core",
                    secondary_muscles=[],
                    equipment="bodyweight",
                    movement_pattern="trunk_anti_extension",
                    execution_type="isometric",
                    instructions="Hold the plank.",
                ),
            ]
        )
        session.commit()


def _register(client: TestClient, email: str = "stats@example.com") -> tuple[str, int]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-secure-password-15"},
    )
    assert response.status_code == 201
    token = response.cookies.get("auth_token")
    assert token is not None
    return token, response.json()["id"]


def _headers(token: str) -> dict[str, str]:
    return {"Cookie": f"auth_token={token}"}


def _create_routine(client: TestClient, token: str, name: str) -> dict[str, Any]:
    response = client.post(
        "/api/routines",
        json={"name": name, "objective": "build_muscle"},
        headers=_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _create_day(client: TestClient, token: str, routine_id: int, name: str) -> dict[str, Any]:
    response = client.post(
        f"/api/routines/{routine_id}/days",
        json={"name": name},
        headers=_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _configure_day(
    client: TestClient,
    token: str,
    routine_id: int,
    day_id: int,
    slug: str,
    target_type: str = "repetitions",
    set_count: int = 1,
) -> dict[str, Any]:
    sets = []
    for i in range(set_count):
        sets.append(
            {
                "target_value": 10 + i,
                "target_weight_kg": 40.0 + i,
                "target_rir": 2,
                "tempo": None,
                "rest_after_set_seconds": 90,
                "notes": None,
            }
        )
    response = client.post(
        f"/api/routines/{routine_id}/days/{day_id}/exercises",
        headers=_headers(token),
        json={
            "exercise_slug": slug,
            "target_type": target_type,
            "rest_after_exercise_seconds": 120,
            "notes": None,
            "sets": sets,
        },
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _activate(client: TestClient, token: str, routine_id: int) -> None:
    response = client.put(
        "/api/active-routine",
        json={"routine_id": routine_id},
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _ready_plan(
    client: TestClient,
    token: str,
    slug: str = "stats-bench-press",
    set_count: int = 1,
    target_type: str = "repetitions",
) -> tuple[int, int]:
    name = f"Stats Plan {next(_PLAN_COUNTER)}"
    routine = _create_routine(client, token, name)
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day(
        client,
        token,
        routine["id"],
        day["id"],
        slug=slug,
        set_count=set_count,
        target_type=target_type,
    )
    _activate(client, token, routine["id"])
    return routine["id"], day["id"]


def _start(client: TestClient, token: str, day_id: int, local_date: str = "2026-08-10") -> int:
    response = client.post(
        "/api/workouts",
        json={"training_day_id": day_id, "local_date": local_date},
        headers=_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(int, response.json()["id"])


def _start_exercise(client: TestClient, token: str, workout_id: int, ex_pos: int) -> None:
    response = client.post(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/start",
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _complete_planned(
    client: TestClient, token: str, workout_id: int, ex_pos: int, set_pos: int
) -> None:
    response = client.put(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/performance",
        json={"entry_mode": "as_planned"},
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _start_set(client: TestClient, token: str, workout_id: int, ex_pos: int, set_pos: int) -> None:
    response = client.post(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/start",
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _record(
    client: TestClient,
    token: str,
    workout_id: int,
    ex_pos: int,
    set_pos: int,
    value: float,
    weight: float | None = None,
    rir: int | None = None,
) -> None:
    response = client.put(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/performance",
        json={
            "entry_mode": "adjusted",
            "performed_value": value,
            "performed_weight_kg": weight,
            "performed_rir": rir,
        },
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _complete_workout(client: TestClient, token: str, workout_id: int) -> None:
    assert (
        client.post(f"/api/workouts/{workout_id}/complete", headers=_headers(token)).status_code
        == 200
    )


def _cancel(client: TestClient, token: str, workout_id: int) -> None:
    assert (
        client.post(f"/api/workouts/{workout_id}/cancel", headers=_headers(token)).status_code
        == 200
    )


def _skip_set(
    client: TestClient,
    token: str,
    workout_id: int,
    ex_pos: int,
    set_pos: int,
    reason_code: str | None = None,
    note: str | None = None,
) -> None:
    response = client.post(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/skip",
        json={"reason_code": reason_code, "note": note},
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _revert_skip_set(
    client: TestClient, token: str, workout_id: int, ex_pos: int, set_pos: int
) -> None:
    response = client.delete(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/skip",
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _skip_exercise(
    client: TestClient,
    token: str,
    workout_id: int,
    ex_pos: int,
    reason_code: str | None = None,
    note: str | None = None,
) -> None:
    response = client.post(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/skip",
        json={"reason_code": reason_code, "note": note},
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _make_completed(
    client: TestClient,
    token: str,
    slug: str = "stats-bench-press",
    local_date: str = "2026-08-10",
) -> int:
    _, day_id = _ready_plan(client, token, slug=slug)
    workout_id = _start(client, token, day_id, local_date=local_date)
    _start_exercise(client, token, workout_id, 1)
    _complete_planned(client, token, workout_id, 1, 1)
    _complete_workout(client, token, workout_id)
    return workout_id


def _stats(
    client: TestClient,
    token: str,
    period: str = "3m",
    local_date: str = "2026-08-13",
    query: str = "",
) -> Any:
    qs = query
    if qs and not qs.startswith("?"):
        qs = f"?{qs}"
    sep = "&" if "?" in qs else "?"
    qs = f"{qs}{sep}period={period}&local_date={local_date}"
    return client.get(f"/api/progress/statistics{qs}", headers=_headers(token))


def _stats_raw(client: TestClient, token: str, path_query: str) -> Any:
    return client.get(f"/api/progress/statistics{path_query}", headers=_headers(token))


def _set_workout_times(
    test_session_factory: Any,
    workout_id: int,
    started_at: datetime.datetime,
    terminal_at: datetime.datetime,
    status: str,
) -> None:
    with test_session_factory() as session:
        workout = session.query(WorkoutSession).filter(WorkoutSession.id == workout_id).one()
        workout.started_at = started_at
        if status == "completed":
            workout.completed_at = terminal_at
            workout.cancelled_at = None
        else:
            workout.cancelled_at = terminal_at
            workout.completed_at = None
        session.commit()


def _week_by_start(body: dict[str, Any], start: str) -> dict[str, Any] | None:
    for week in body["weeks"]:
        if week["week_start_local_date"] == start:
            return cast(dict[str, Any], week)
    return None


# ────────────────── authentication / ownership / empty ──────────────────


def test_statistics_authentication(client: TestClient) -> None:
    client.cookies.clear()
    assert client.get("/api/progress/statistics?period=3m&local_date=2026-08-13").status_code == 401


def test_statistics_empty_period(client: TestClient) -> None:
    token, _ = _register(client)
    body = _stats(client, token).json()

    assert body["range"] == {
        "period": "3m",
        "from_local_date": "2026-05-13",
        "through_local_date": "2026-08-13",
    }
    assert body["summary"] == {
        "completed_workout_count": 0,
        "cancelled_workout_count": 0,
        "terminal_workout_count": 0,
        "completion_ratio_percent": None,
        "performed_set_count": 0,
        "skipped_set_count": 0,
        "skipped_exercise_count": 0,
        "total_elapsed_seconds": 0,
    }
    assert body["skip_reasons"] == []
    assert body["activity_days"] == []
    # Rolling periods still return a complete zero-filled bucket sequence.
    assert body["weeks"][0]["week_start_local_date"] == "2026-05-11"
    assert body["weeks"][-1]["week_end_local_date"] == "2026-08-16"
    assert all(
        week["completed_workout_count"] == 0 and week["cancelled_workout_count"] == 0
        for week in body["weeks"]
    )


def test_statistics_all_period_empty_is_empty_weeks(client: TestClient) -> None:
    token, _ = _register(client)
    body = _stats(client, token, period="all").json()
    assert body["summary"]["terminal_workout_count"] == 0
    assert body["weeks"] == []
    assert body["activity_days"] == []
    assert body["range"]["from_local_date"] is None


def test_statistics_user_isolation(client: TestClient) -> None:
    owner, _ = _register(client, "stats-owner@example.com")
    other, _ = _register(client, "stats-other@example.com")
    _make_completed(client, owner)

    assert _stats(client, other).json()["summary"]["terminal_workout_count"] == 0


# ────────────────── summary and ratio ──────────────────


def test_statistics_completed_and_cancelled_counts(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, local_date="2026-08-01")
    _make_completed(client, token, local_date="2026-08-02")

    _, day_id = _ready_plan(client, token)
    cancelled = _start(client, token, day_id, local_date="2026-08-03")
    _start_exercise(client, token, cancelled, 1)
    _complete_planned(client, token, cancelled, 1, 1)
    _cancel(client, token, cancelled)

    summary = _stats(client, token).json()["summary"]
    assert summary["completed_workout_count"] == 2
    assert summary["cancelled_workout_count"] == 1
    assert summary["terminal_workout_count"] == 3
    assert summary["completion_ratio_percent"] == 66.67
    assert summary["performed_set_count"] == 3


def test_statistics_ratio_exact(client: TestClient) -> None:
    token, _ = _register(client)
    for _ in range(3):
        _make_completed(client, token)
    _, day_id = _ready_plan(client, token)
    cancelled = _start(client, token, day_id)
    _start_exercise(client, token, cancelled, 1)
    _complete_planned(client, token, cancelled, 1, 1)
    _cancel(client, token, cancelled)

    summary = _stats(client, token).json()["summary"]
    assert summary["completion_ratio_percent"] == 75.0


def test_statistics_performed_sets_include_all_target_types(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, slug="stats-bench-press")

    _, plank_day = _ready_plan(client, token, slug="stats-plank", target_type="duration_seconds")
    plank = _start(client, token, plank_day)
    _start_exercise(client, token, plank, 1)
    _record(client, token, plank, 1, 1, 60)
    _complete_workout(client, token, plank)

    summary = _stats(client, token).json()["summary"]
    assert summary["performed_set_count"] == 2
    assert summary["completed_workout_count"] == 2


def test_statistics_duration_elapsed_seconds(client: TestClient, test_session_factory: Any) -> None:
    token, _ = _register(client)
    completed = _make_completed(client, token)
    _set_workout_times(
        test_session_factory,
        completed,
        datetime.datetime(2026, 8, 10, 10, 0, 0),
        datetime.datetime(2026, 8, 10, 10, 1, 30),
        "completed",
    )

    _, day_id = _ready_plan(client, token)
    cancelled = _start(client, token, day_id, local_date="2026-08-11")
    _start_exercise(client, token, cancelled, 1)
    _complete_planned(client, token, cancelled, 1, 1)
    _cancel(client, token, cancelled)
    _set_workout_times(
        test_session_factory,
        cancelled,
        datetime.datetime(2026, 8, 11, 9, 0, 0),
        datetime.datetime(2026, 8, 11, 9, 30, 0),
        "cancelled",
    )

    summary = _stats(client, token).json()["summary"]
    assert summary["total_elapsed_seconds"] == 90 + 1800


# ────────────────── effective skips and reason distribution ──────────────────


def test_statistics_set_skips_with_reasonless(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, set_count=3)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _complete_planned(client, token, workout_id, 1, 1)
    _start_set(client, token, workout_id, 1, 2)
    _skip_set(client, token, workout_id, 1, 2, reason_code="pain_or_discomfort")
    _start_set(client, token, workout_id, 1, 3)
    _skip_set(client, token, workout_id, 1, 3, reason_code=None)
    _complete_workout(client, token, workout_id)

    body = _stats(client, token).json()
    assert body["summary"]["performed_set_count"] == 1
    assert body["summary"]["skipped_set_count"] == 2
    assert body["summary"]["skipped_exercise_count"] == 0
    assert body["skip_reasons"] == [
        {
            "reason_code": "pain_or_discomfort",
            "set_skip_action_count": 1,
            "exercise_skip_action_count": 0,
        },
        {
            "reason_code": None,
            "set_skip_action_count": 1,
            "exercise_skip_action_count": 0,
        },
    ]


def test_statistics_exercise_skip_covers_remaining_unperformed(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, set_count=3)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _complete_planned(client, token, workout_id, 1, 1)
    _skip_exercise(client, token, workout_id, 1, reason_code="other", note="had to leave")
    _complete_workout(client, token, workout_id)

    body = _stats(client, token).json()
    assert body["summary"]["performed_set_count"] == 1
    assert body["summary"]["skipped_set_count"] == 2
    assert body["summary"]["skipped_exercise_count"] == 1
    assert body["skip_reasons"] == [
        {
            "reason_code": "other",
            "set_skip_action_count": 0,
            "exercise_skip_action_count": 1,
        }
    ]


def test_statistics_reversed_skip_contributes_nothing(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, set_count=2)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _skip_set(client, token, workout_id, 1, 1, reason_code="too_fatigued")
    _revert_skip_set(client, token, workout_id, 1, 1)
    _cancel(client, token, workout_id)

    body = _stats(client, token).json()
    assert body["summary"]["cancelled_workout_count"] == 1
    assert body["summary"]["performed_set_count"] == 0
    assert body["summary"]["skipped_set_count"] == 0
    assert body["summary"]["skipped_exercise_count"] == 0
    assert body["skip_reasons"] == []


def test_statistics_distinct_covered_set_count_no_duplicates(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, set_count=3)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _complete_planned(client, token, workout_id, 1, 1)
    _start_set(client, token, workout_id, 1, 2)
    _skip_set(client, token, workout_id, 1, 2, reason_code="pain_or_discomfort")
    _skip_exercise(client, token, workout_id, 1, reason_code="equipment_unavailable")
    _complete_workout(client, token, workout_id)

    body = _stats(client, token).json()
    # Set 2 is covered by a set-scope skip, set 3 by the exercise-scope skip.
    # Set 2 must not be counted twice even though an exercise skip also targets
    # its exercise.
    assert body["summary"]["skipped_set_count"] == 2
    assert body["summary"]["skipped_exercise_count"] == 1
    assert {r["reason_code"] for r in body["skip_reasons"]} == {
        "pain_or_discomfort",
        "equipment_unavailable",
    }
    for row in body["skip_reasons"]:
        if row["reason_code"] == "pain_or_discomfort":
            assert row["set_skip_action_count"] == 1
            assert row["exercise_skip_action_count"] == 0
        else:
            assert row["set_skip_action_count"] == 0
            assert row["exercise_skip_action_count"] == 1


# ────────────────── weekly buckets and calendar ──────────────────


def test_statistics_weekly_buckets_complete_and_boundary_partial(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, local_date="2026-05-13")
    _make_completed(client, token, local_date="2026-08-10")

    body = _stats(client, token).json()
    weeks = body["weeks"]
    assert weeks[0]["week_start_local_date"] == "2026-05-11"
    assert weeks[-1]["week_end_local_date"] == "2026-08-16"
    for prev, cur in zip(weeks, weeks[1:]):
        start = datetime.date.fromisoformat(cur["week_start_local_date"])
        prev_start = datetime.date.fromisoformat(prev["week_start_local_date"])
        assert (start - prev_start).days == 7
        assert (datetime.date.fromisoformat(cur["week_end_local_date"]) - start).days == 6

    first_week = _week_by_start(body, "2026-05-11")
    assert first_week is not None
    assert first_week["completed_workout_count"] == 1
    assert first_week["cancelled_workout_count"] == 0
    assert first_week["performed_set_count"] == 1

    last_week = _week_by_start(body, "2026-08-10")
    assert last_week is not None
    assert last_week["completed_workout_count"] == 1


def test_statistics_same_day_multiple_workouts_single_calendar_entry(
    client: TestClient,
) -> None:
    token, _ = _register(client)
    _make_completed(client, token, local_date="2026-08-10")
    _make_completed(client, token, local_date="2026-08-10")

    _, day_id = _ready_plan(client, token)
    cancelled = _start(client, token, day_id, local_date="2026-08-10")
    _start_exercise(client, token, cancelled, 1)
    _complete_planned(client, token, cancelled, 1, 1)
    _cancel(client, token, cancelled)

    body = _stats(client, token).json()
    assert body["activity_days"] == [
        {"local_date": "2026-08-10", "completed_workout_count": 2, "cancelled_workout_count": 1}
    ]


def test_statistics_local_date_membership_crosses_midnight(
    client: TestClient, test_session_factory: Any
) -> None:
    token, _ = _register(client)
    workout_id = _make_completed(client, token, local_date="2026-08-10")
    _set_workout_times(
        test_session_factory,
        workout_id,
        datetime.datetime(2026, 8, 10, 23, 30, 0),
        datetime.datetime(2026, 8, 11, 0, 30, 0),
        "completed",
    )

    body = _stats(client, token, period="1m").json()
    assert body["activity_days"] == [
        {"local_date": "2026-08-10", "completed_workout_count": 1, "cancelled_workout_count": 0}
    ]
    assert body["summary"]["total_elapsed_seconds"] == 3600


def test_statistics_all_range_starts_at_first_workout(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, local_date="2025-11-10")
    _make_completed(client, token, local_date="2026-08-10")

    body = _stats(client, token, period="all", local_date="2026-08-13").json()
    assert body["summary"]["terminal_workout_count"] == 2
    assert body["weeks"][0]["week_start_local_date"] == "2025-11-10"
    assert body["range"]["from_local_date"] is None


# ────────────────── reconciliation and snapshot independence ──────────────────


def test_statistics_reconciliation(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, local_date="2026-08-01")
    _make_completed(client, token, local_date="2026-08-08")

    _, day_id = _ready_plan(client, token)
    cancelled = _start(client, token, day_id, local_date="2026-08-09")
    _start_exercise(client, token, cancelled, 1)
    _complete_planned(client, token, cancelled, 1, 1)
    _cancel(client, token, cancelled)

    body = _stats(client, token).json()
    summary = body["summary"]
    assert summary["terminal_workout_count"] == (
        summary["completed_workout_count"] + summary["cancelled_workout_count"]
    )
    assert (
        sum(w["completed_workout_count"] for w in body["weeks"])
        == summary["completed_workout_count"]
    )
    assert (
        sum(w["cancelled_workout_count"] for w in body["weeks"])
        == summary["cancelled_workout_count"]
    )
    assert sum(w["performed_set_count"] for w in body["weeks"]) == summary["performed_set_count"]
    assert (
        sum(w["total_elapsed_seconds"] for w in body["weeks"]) == summary["total_elapsed_seconds"]
    )
    assert (
        sum(d["completed_workout_count"] for d in body["activity_days"])
        == summary["completed_workout_count"]
    )
    assert (
        sum(d["cancelled_workout_count"] for d in body["activity_days"])
        == summary["cancelled_workout_count"]
    )


def test_statistics_snapshot_independent_of_routine_deletion(client: TestClient) -> None:
    token, _ = _register(client)
    routine_id, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _complete_planned(client, token, workout_id, 1, 1)
    _complete_workout(client, token, workout_id)

    assert client.delete(f"/api/routines/{routine_id}", headers=_headers(token)).status_code == 204

    summary = _stats(client, token).json()["summary"]
    assert summary["completed_workout_count"] == 1
    assert summary["performed_set_count"] == 1


def test_statistics_excludes_in_progress(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _complete_planned(client, token, workout_id, 1, 1)

    summary = _stats(client, token).json()["summary"]
    assert summary["terminal_workout_count"] == 0
    assert summary["performed_set_count"] == 0


# ────────────────── parameter validation ──────────────────


def test_statistics_parameter_validation(client: TestClient) -> None:
    token, _ = _register(client)
    assert _stats(client, token).status_code == 200

    assert _stats_raw(client, token, "?local_date=2026-08-13").status_code == 422
    assert _stats_raw(client, token, "?period=3m").status_code == 422
    assert _stats_raw(client, token, "").status_code == 422
    assert _stats_raw(client, token, "?period=3m&local_date=2026-08-13&foo=1").status_code == 422
    assert (
        _stats_raw(client, token, "?period=3m&period=1m&local_date=2026-08-13").status_code == 422
    )
    assert (
        _stats_raw(
            client, token, "?period=3m&local_date=2026-08-13&local_date=2026-08-12"
        ).status_code
        == 422
    )
    assert _stats_raw(client, token, "?period=2m&local_date=2026-08-13").status_code == 422
    assert _stats_raw(client, token, "?period=3M&local_date=2026-08-13").status_code == 422
    assert _stats_raw(client, token, "?period=&local_date=2026-08-13").status_code == 422
    assert _stats_raw(client, token, "?period=all&local_date=2026-02-31").status_code == 422
    assert _stats_raw(client, token, "?period=all&local_date=not-a-date").status_code == 422


def test_statistics_existing_progress_contracts_unchanged(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token)

    assert client.get("/api/progress/exercises", headers=_headers(token)).status_code == 200
    assert client.get("/api/workouts/history", headers=_headers(token)).status_code == 200
