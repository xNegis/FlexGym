"""Tests for F20 Progress Area and Exercise Performance History."""

from __future__ import annotations

import datetime
import itertools
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient

from app.models import Exercise, PerformedSet, WorkoutExercise, WorkoutPlannedSet
from app.services.progress_service import resolve_period

_PLAN_COUNTER = itertools.count(1)


@pytest.fixture(autouse=True)
def seed_progress_exercises(test_session_factory: Any) -> None:
    with test_session_factory() as session:
        session.add_all(
            [
                Exercise(
                    slug="progress-bench-press",
                    name="Progress Bench Press",
                    primary_muscle="chest",
                    secondary_muscles=["triceps"],
                    equipment="barbell",
                    movement_pattern="horizontal_push",
                    execution_type="bilateral",
                    instructions="Press the bar with control.",
                ),
                Exercise(
                    slug="progress-squat",
                    name="Progress Squat",
                    primary_muscle="quadriceps",
                    secondary_muscles=["glutes"],
                    equipment="barbell",
                    movement_pattern="squat",
                    execution_type="bilateral",
                    instructions="Squat with control.",
                ),
                Exercise(
                    slug="progress-plank",
                    name="Progress Plank",
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


def _register(client: TestClient, email: str = "progress@example.com") -> tuple[str, int]:
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
    slug: str = "progress-bench-press",
    set_count: int = 1,
    target_type: str = "repetitions",
) -> tuple[int, int]:
    name = f"Progress Plan {next(_PLAN_COUNTER)}"
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


def _make_completed(
    client: TestClient,
    token: str,
    slug: str = "progress-bench-press",
    local_date: str = "2026-08-10",
) -> int:
    _, day_id = _ready_plan(client, token, slug=slug)
    workout_id = _start(client, token, day_id, local_date=local_date)
    _start_exercise(client, token, workout_id, 1)
    _complete_planned(client, token, workout_id, 1, 1)
    _complete_workout(client, token, workout_id)
    return workout_id


def _progress_list(client: TestClient, token: str) -> Any:
    return client.get("/api/progress/exercises", headers=_headers(token))


def _history(client: TestClient, token: str, slug: str, query: str = "") -> Any:
    qs = query
    if qs and not qs.startswith("?"):
        qs = f"?{qs}"
    sep = "&" if "?" in qs else "?"
    qs = f"{qs}{sep}period=all&local_date=2026-08-31"
    return client.get(f"/api/progress/exercises/{slug}/history{qs}", headers=_headers(token))


def _history_scoped(
    client: TestClient,
    token: str,
    slug: str,
    period: str,
    local_date: str,
    query: str = "",
) -> Any:
    qs = query
    if qs and not qs.startswith("?"):
        qs = f"?{qs}"
    sep = "&" if "?" in qs else "?"
    qs = f"{qs}{sep}period={period}&local_date={local_date}"
    return client.get(f"/api/progress/exercises/{slug}/history{qs}", headers=_headers(token))


def _chart(
    client: TestClient,
    token: str,
    slug: str,
    period: str,
    local_date: str = "2026-08-31",
) -> Any:
    return client.get(
        f"/api/progress/exercises/{slug}/chart?period={period}&local_date={local_date}",
        headers=_headers(token),
    )


# ────────────────── exercise list ──────────────────


def test_progress_list_empty(client: TestClient) -> None:
    token, _ = _register(client)
    response = _progress_list(client, token)
    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_progress_list_authentication(client: TestClient) -> None:
    client.cookies.clear()
    assert client.get("/api/progress/exercises").status_code == 401


def test_progress_list_excludes_non_repetition_and_in_progress(client: TestClient) -> None:
    token, _ = _register(client)
    _, plank_day = _ready_plan(client, token, slug="progress-plank", target_type="duration_seconds")
    plank_workout = _start(client, token, plank_day)
    _start_exercise(client, token, plank_workout, 1)
    _record(client, token, plank_workout, 1, 1, 60)
    _complete_workout(client, token, plank_workout)

    _, bench_day = _ready_plan(client, token, slug="progress-bench-press")
    in_progress = _start(client, token, bench_day)
    _start_exercise(client, token, in_progress, 1)
    _complete_planned(client, token, in_progress, 1, 1)

    response = _progress_list(client, token)
    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_progress_list_includes_completed_and_cancelled(client: TestClient) -> None:
    token, _ = _register(client)
    completed = _make_completed(client, token)

    _, day_id = _ready_plan(client, token, slug="progress-bench-press", set_count=1)
    cancelled = _start(client, token, day_id)
    _start_exercise(client, token, cancelled, 1)
    _complete_planned(client, token, cancelled, 1, 1)
    _cancel(client, token, cancelled)

    items = _progress_list(client, token).json()["items"]
    slugs = [item["exercise_slug"] for item in items]
    assert slugs == ["progress-bench-press"]
    assert items[0]["session_count"] == 2
    assert completed is not None
    assert cancelled is not None


def test_progress_list_ordering_and_latest_name(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, slug="progress-squat", local_date="2026-08-01")
    _make_completed(client, token, slug="progress-bench-press", local_date="2026-08-05")

    items = _progress_list(client, token).json()["items"]
    assert [item["exercise_slug"] for item in items] == ["progress-bench-press", "progress-squat"]
    bench = items[0]
    assert bench["exercise_name"] == "Progress Bench Press"
    assert bench["session_count"] == 1
    assert bench["last_local_date"] == "2026-08-05"
    assert bench["last_performed_at"] is not None


def test_progress_list_user_isolation(client: TestClient) -> None:
    owner, _ = _register(client, "progress-owner@example.com")
    other, _ = _register(client, "progress-other@example.com")
    _make_completed(client, owner)

    assert _progress_list(client, other).json() == {"items": []}


def test_progress_list_rejects_query_params(client: TestClient) -> None:
    token, _ = _register(client)
    assert _progress_list(client, token).status_code == 200
    assert client.get("/api/progress/exercises?limit=1", headers=_headers(token)).status_code == 422
    assert client.get("/api/progress/exercises?foo=1", headers=_headers(token)).status_code == 422


def test_progress_list_same_slug_multiple_workouts_distinct_count(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token)
    _make_completed(client, token)
    _make_completed(client, token)

    items = _progress_list(client, token).json()["items"]
    assert len(items) == 1
    assert items[0]["session_count"] == 3


def test_progress_list_keeps_independent_counts_for_multiple_exercises(
    client: TestClient,
) -> None:
    token, _ = _register(client)
    _make_completed(client, token, slug="progress-bench-press")
    _make_completed(client, token, slug="progress-bench-press")
    _make_completed(client, token, slug="progress-bench-press")
    _make_completed(client, token, slug="progress-squat")

    items = _progress_list(client, token).json()["items"]
    counts = {item["exercise_slug"]: item["session_count"] for item in items}
    assert counts == {"progress-bench-press": 3, "progress-squat": 1}


# ────────────────── exercise history metrics ──────────────────


def test_history_metrics_exact_calculation(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, slug="progress-bench-press", set_count=3)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 10, 60.0, 2)
    _start_set(client, token, workout_id, 1, 2)
    _record(client, token, workout_id, 1, 2, 8, 70.0, 1)
    _start_set(client, token, workout_id, 1, 3)
    _record(client, token, workout_id, 1, 3, 6, 80.0, 0)
    _complete_workout(client, token, workout_id)

    item = _history(client, token, "progress-bench-press").json()["items"][0]
    assert item["total_reps"] == 24
    assert item["heaviest_weight_kg"] == 80.0
    # Epley: 60*(1+10/30)=80.0, 70*(1+8/30)=88.67, 80*(1+6/30)=96.0
    assert item["estimated_1rm_kg"] == 96.0
    assert [s["performed_reps"] for s in item["sets"]] == [10, 8, 6]
    assert [s["performed_weight_kg"] for s in item["sets"]] == [60.0, 70.0, 80.0]
    assert [s["performed_rir"] for s in item["sets"]] == [2, 1, 0]


def test_history_missing_weight_is_null(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, slug="progress-bench-press", set_count=1)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 12, None, None)
    _complete_workout(client, token, workout_id)

    item = _history(client, token, "progress-bench-press").json()["items"][0]
    assert item["total_reps"] == 12
    assert item["heaviest_weight_kg"] is None
    assert item["estimated_1rm_kg"] is None


def test_history_zero_weight_is_not_a_metric(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, slug="progress-bench-press", set_count=1)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 15, 0.0, None)
    _complete_workout(client, token, workout_id)

    item = _history(client, token, "progress-bench-press").json()["items"][0]
    assert item["total_reps"] == 15
    assert item["heaviest_weight_kg"] is None
    assert item["estimated_1rm_kg"] is None
    assert [s["performed_weight_kg"] for s in item["sets"]] == [0.0]


def test_history_decimal_weight_and_high_reps_epley(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, slug="progress-bench-press", set_count=2)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 10, 47.5, None)
    _start_set(client, token, workout_id, 1, 2)
    _record(client, token, workout_id, 1, 2, 50, 100.0, None)
    _complete_workout(client, token, workout_id)

    item = _history(client, token, "progress-bench-press").json()["items"][0]
    assert item["heaviest_weight_kg"] == 100.0
    # Epley set1: 47.5*(1+10/30)=63.33; set2: 100*(1+50/30)=266.67
    assert item["estimated_1rm_kg"] == 266.67


def test_history_cancelled_session_included(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, slug="progress-bench-press", set_count=2)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 10, 60.0, 2)
    _cancel(client, token, workout_id)

    item = _history(client, token, "progress-bench-press").json()["items"][0]
    assert item["status"] == "cancelled"
    assert item["total_reps"] == 10
    assert item["heaviest_weight_kg"] == 60.0


def test_history_skipped_and_unresolved_do_not_contribute(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, slug="progress-bench-press", set_count=3)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 10, 60.0, 2)
    _start_set(client, token, workout_id, 1, 2)
    client.post(
        f"/api/workouts/{workout_id}/exercises/1/sets/2/skip", json={}, headers=_headers(token)
    )
    _cancel(client, token, workout_id)

    item = _history(client, token, "progress-bench-press").json()["items"][0]
    assert item["total_reps"] == 10
    assert len(item["sets"]) == 1


def test_history_unknown_slug_404(client: TestClient) -> None:
    token, _ = _register(client)
    assert _history(client, token, "does-not-exist").status_code == 404


def test_history_valid_slug_no_history_empty(client: TestClient) -> None:
    token, _ = _register(client)
    response = _history(client, token, "progress-bench-press")
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["next_cursor"] is None
    assert response.json()["exercise"]["name"] == "Progress Bench Press"


def test_history_newest_first_and_pagination(client: TestClient) -> None:
    token, _ = _register(client)
    ids = [_make_completed(client, token) for _ in range(4)]

    first = _history(client, token, "progress-bench-press", "?limit=2").json()
    assert len(first["items"]) == 2
    assert first["next_cursor"] is not None

    second = _history(
        client, token, "progress-bench-press", f"?limit=2&cursor={first['next_cursor']}"
    ).json()
    assert len(second["items"]) == 2
    assert second["next_cursor"] is None

    collected = [i["workout_id"] for i in first["items"]] + [
        i["workout_id"] for i in second["items"]
    ]
    assert collected == sorted(ids, reverse=True)
    assert len(collected) == len(set(collected)) == 4


def test_history_cursor_slug_mismatch(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, slug="progress-bench-press")
    _make_completed(client, token, slug="progress-bench-press")
    _make_completed(client, token, slug="progress-squat")

    page = _history(client, token, "progress-bench-press", "?limit=1").json()
    assert page["next_cursor"] is not None
    assert (
        _history(
            client, token, "progress-squat", f"?limit=1&cursor={page['next_cursor']}"
        ).status_code
        == 422
    )


def test_history_cursor_user_bound(client: TestClient) -> None:
    owner, _ = _register(client, "progress-cursor-owner@example.com")
    other, _ = _register(client, "progress-cursor-other@example.com")
    for _ in range(2):
        _make_completed(client, owner)

    page = _history(client, owner, "progress-bench-press", "?limit=1").json()
    assert page["next_cursor"] is not None
    assert (
        _history(
            client, other, "progress-bench-press", f"?limit=1&cursor={page['next_cursor']}"
        ).status_code
        == 422
    )


def test_history_malformed_cursor(client: TestClient) -> None:
    token, _ = _register(client)
    assert _history(client, token, "progress-bench-press", "?cursor=!!!bad!!!").status_code == 422
    assert _history(client, token, "progress-bench-press", "?cursor=abc123").status_code == 422
    assert _history(client, token, "progress-bench-press", "?cursor=").status_code == 422


def test_history_invalid_and_repeated_parameters(client: TestClient) -> None:
    token, _ = _register(client)
    assert _history(client, token, "progress-bench-press", "?limit=0").status_code == 422
    assert _history(client, token, "progress-bench-press", "?limit=51").status_code == 422
    assert _history(client, token, "progress-bench-press", "?limit=abc").status_code == 422
    assert _history(client, token, "progress-bench-press", "?unknown=1").status_code == 422
    assert _history(client, token, "progress-bench-press", "?limit=1&limit=2").status_code == 422
    assert _history(client, token, "progress-bench-press", "?cursor=a&cursor=b").status_code == 422


def test_history_new_workout_between_pages_does_not_repeat(client: TestClient) -> None:
    token, _ = _register(client)
    oldest = _make_completed(client, token)
    middle = _make_completed(client, token)
    newest = _make_completed(client, token)

    first = _history(client, token, "progress-bench-press", "?limit=2").json()
    assert [i["workout_id"] for i in first["items"]] == [newest, middle]

    inserted = _make_completed(client, token)

    second = _history(
        client, token, "progress-bench-press", f"?limit=2&cursor={first['next_cursor']}"
    ).json()
    second_ids = [i["workout_id"] for i in second["items"]]
    assert inserted not in second_ids
    assert newest not in second_ids
    assert middle not in second_ids
    assert second_ids == [oldest]


def test_history_snapshot_independence(client: TestClient) -> None:
    token, _ = _register(client)
    routine_id, day_id = _ready_plan(client, token, slug="progress-bench-press")
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 10, 60.0, 2)
    _complete_workout(client, token, workout_id)

    assert client.delete(f"/api/routines/{routine_id}", headers=_headers(token)).status_code == 204

    item = _history(client, token, "progress-bench-press").json()["items"][0]
    assert isinstance(item["routine_name"], str) and item["routine_name"]
    assert item["total_reps"] == 10
    assert item["sets"][0]["performed_weight_kg"] == 60.0


def test_history_same_slug_multiple_occurrences_aggregate(
    client: TestClient, test_session_factory: Any
) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, slug="progress-bench-press", set_count=1)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 10, 60.0, 2)
    _complete_workout(client, token, workout_id)

    with test_session_factory() as session:
        second = WorkoutExercise(
            workout_session_id=workout_id,
            position=2,
            source_exercise_id=None,
            exercise_slug="progress-bench-press",
            exercise_name="Progress Bench Press",
            target_type="repetitions",
        )
        session.add(second)
        session.flush()
        planned = WorkoutPlannedSet(
            workout_exercise_id=second.id,
            position=1,
            target_value=8,
            target_weight_kg=70.0,
        )
        session.add(planned)
        session.flush()
        session.add(
            PerformedSet(
                workout_planned_set_id=planned.id,
                performed_value=8,
                performed_weight_kg=70.0,
                performed_rir=1,
                entry_mode="as_planned",
                completed_at=datetime.datetime.utcnow(),
            )
        )
        session.commit()

    items = _progress_list(client, token).json()["items"]
    assert items[0]["session_count"] == 1

    item = _history(client, token, "progress-bench-press").json()["items"][0]
    assert item["total_reps"] == 18
    assert item["heaviest_weight_kg"] == 70.0
    positions = [(s["exercise_position"], s["set_position"]) for s in item["sets"]]
    assert positions == [(1, 1), (2, 1)]


# ────────────────── F20.1 period resolution ──────────────────


def test_resolve_period_calendar_subtraction() -> None:
    assert resolve_period("1m", datetime.date(2026, 8, 13)) == (
        datetime.date(2026, 7, 13),
        datetime.date(2026, 8, 13),
    )
    assert resolve_period("3m", datetime.date(2026, 8, 13)) == (
        datetime.date(2026, 5, 13),
        datetime.date(2026, 8, 13),
    )
    assert resolve_period("6m", datetime.date(2026, 8, 13)) == (
        datetime.date(2026, 2, 13),
        datetime.date(2026, 8, 13),
    )
    assert resolve_period("1y", datetime.date(2026, 8, 13)) == (
        datetime.date(2025, 8, 13),
        datetime.date(2026, 8, 13),
    )
    assert resolve_period("all", datetime.date(2026, 8, 13)) == (
        None,
        datetime.date(2026, 8, 13),
    )


def test_resolve_period_clamps_end_of_month() -> None:
    assert resolve_period("1m", datetime.date(2026, 3, 31))[0] == datetime.date(2026, 2, 28)
    assert resolve_period("1m", datetime.date(2024, 3, 31))[0] == datetime.date(2024, 2, 29)
    assert resolve_period("1y", datetime.date(2024, 2, 29))[0] == datetime.date(2023, 2, 28)
    assert resolve_period("1m", datetime.date(2026, 1, 31))[0] == datetime.date(2025, 12, 31)


def test_resolve_period_rejects_unsupported_value() -> None:
    with pytest.raises(ValueError, match="Unsupported progress period"):
        resolve_period("2m", datetime.date(2026, 8, 13))


# ────────────────── F20.1 chart ──────────────────


def test_chart_oldest_first_and_complete(client: TestClient) -> None:
    token, _ = _register(client)
    ids = [_make_completed(client, token) for _ in range(25)]

    body = _chart(client, token, "progress-bench-press", "all").json()
    assert body["has_any_history"] is True
    assert body["range"]["from_local_date"] is None
    assert body["range"]["through_local_date"] == "2026-08-31"
    assert [i["workout_id"] for i in body["items"]] == ids
    assert "total_reps" not in body["items"][0]
    assert all(i["heaviest_weight_kg"] is not None for i in body["items"])


def test_chart_range_fields(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, local_date="2026-08-10")

    body = _chart(client, token, "progress-bench-press", "3m", "2026-08-13").json()
    assert body["range"] == {
        "period": "3m",
        "from_local_date": "2026-05-13",
        "through_local_date": "2026-08-13",
    }
    assert len(body["items"]) == 1


def test_chart_excludes_non_positive_weight_sessions(client: TestClient) -> None:
    token, _ = _register(client)

    _, day_id = _ready_plan(client, token, slug="progress-bench-press")
    zero_w = _start(client, token, day_id, local_date="2026-08-01")
    _start_exercise(client, token, zero_w, 1)
    _record(client, token, zero_w, 1, 1, 15, 0.0, None)
    _complete_workout(client, token, zero_w)

    _, day_id = _ready_plan(client, token, slug="progress-bench-press")
    null_w = _start(client, token, day_id, local_date="2026-08-02")
    _start_exercise(client, token, null_w, 1)
    _record(client, token, null_w, 1, 1, 12, None, None)
    _complete_workout(client, token, null_w)

    positive = _make_completed(client, token, local_date="2026-08-03")

    body = _chart(client, token, "progress-bench-press", "all").json()
    assert [i["workout_id"] for i in body["items"]] == [positive]
    assert body["has_any_history"] is True

    history = _history_scoped(client, token, "progress-bench-press", "all", "2026-08-31").json()
    assert {i["workout_id"] for i in history["items"]} == {zero_w, null_w, positive}


def test_chart_mixed_session_uses_only_positive(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, slug="progress-bench-press", set_count=2)
    workout_id = _start(client, token, day_id, local_date="2026-08-05")
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 10, 60.0, 2)
    _start_set(client, token, workout_id, 1, 2)
    _record(client, token, workout_id, 1, 2, 8, 0.0, None)
    _complete_workout(client, token, workout_id)

    body = _chart(client, token, "progress-bench-press", "all").json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["heaviest_weight_kg"] == 60.0
    assert item["estimated_1rm_kg"] == 80.0
    assert [s["performed_weight_kg"] for s in item["sets"]] == [60.0, 0.0]


def test_chart_same_day_multiple_workouts_distinct(client: TestClient) -> None:
    token, _ = _register(client)
    a = _make_completed(client, token, local_date="2026-08-10")
    b = _make_completed(client, token, local_date="2026-08-10")

    body = _chart(client, token, "progress-bench-press", "all").json()
    ids = [i["workout_id"] for i in body["items"]]
    assert ids == [a, b]
    assert len(set(ids)) == 2


def test_chart_cancelled_included_and_status_explicit(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, slug="progress-bench-press")
    workout_id = _start(client, token, day_id, local_date="2026-08-08")
    _start_exercise(client, token, workout_id, 1)
    _record(client, token, workout_id, 1, 1, 10, 60.0, 2)
    _cancel(client, token, workout_id)

    body = _chart(client, token, "progress-bench-press", "all").json()
    assert len(body["items"]) == 1
    assert body["items"][0]["status"] == "cancelled"
    assert body["items"][0]["heaviest_weight_kg"] == 60.0


def test_chart_starts_at_oldest_actual_session(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, local_date="2026-06-20")
    _make_completed(client, token, local_date="2026-06-30")

    body = _chart(client, token, "progress-bench-press", "6m", "2026-08-31").json()
    assert body["range"]["from_local_date"] == "2026-02-28"
    assert [i["local_date"] for i in body["items"]] == ["2026-06-20", "2026-06-30"]


def test_chart_unknown_slug_404(client: TestClient) -> None:
    token, _ = _register(client)
    assert _chart(client, token, "does-not-exist", "all").status_code == 404


def test_chart_excludes_duration_target_and_other_users(client: TestClient) -> None:
    token, _ = _register(client)
    _, plank_day = _ready_plan(client, token, slug="progress-plank", target_type="duration_seconds")
    plank_w = _start(client, token, plank_day, local_date="2026-08-05")
    _start_exercise(client, token, plank_w, 1)
    _record(client, token, plank_w, 1, 1, 60)
    _complete_workout(client, token, plank_w)

    body = _chart(client, token, "progress-plank", "all").json()
    assert body["items"] == []
    assert body["has_any_history"] is False

    _make_completed(client, token, local_date="2026-08-06")
    other, _ = _register(client, "progress-chart-other@example.com")
    assert _chart(client, other, "progress-bench-press", "all").json()["items"] == []


# ────────────────── F20.1 period-scoped history ──────────────────


def test_history_period_scoping_and_range(client: TestClient) -> None:
    token, _ = _register(client)
    in_window = _make_completed(client, token, local_date="2026-08-10")
    _make_completed(client, token, local_date="2026-01-10")

    body = _history_scoped(client, token, "progress-bench-press", "3m", "2026-08-31").json()
    assert body["range"] == {
        "period": "3m",
        "from_local_date": "2026-05-31",
        "through_local_date": "2026-08-31",
    }
    assert [i["workout_id"] for i in body["items"]] == [in_window]
    assert body["has_any_history"] is True


def test_period_bounds_are_inclusive_for_chart_and_history(client: TestClient) -> None:
    token, _ = _register(client)
    lower = _make_completed(client, token, local_date="2026-05-31")
    upper = _make_completed(client, token, local_date="2026-08-31")
    _make_completed(client, token, local_date="2026-05-30")
    _make_completed(client, token, local_date="2026-09-01")

    chart = _chart(client, token, "progress-bench-press", "3m", "2026-08-31").json()
    assert [item["workout_id"] for item in chart["items"]] == [lower, upper]

    history = _history_scoped(client, token, "progress-bench-press", "3m", "2026-08-31").json()
    assert [item["workout_id"] for item in history["items"]] == [upper, lower]


def test_history_period_empty_vs_global_empty(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token, local_date="2026-01-10")

    body = _history_scoped(client, token, "progress-bench-press", "3m", "2026-08-31").json()
    assert body["items"] == []
    assert body["next_cursor"] is None
    assert body["has_any_history"] is True

    empty = _history_scoped(client, token, "progress-squat", "all", "2026-08-31").json()
    assert empty["items"] == []
    assert empty["next_cursor"] is None
    assert empty["has_any_history"] is False


def test_history_includes_zero_and_null_weight_sessions(client: TestClient) -> None:
    token, _ = _register(client)

    _, day_id = _ready_plan(client, token, slug="progress-bench-press")
    zero_w = _start(client, token, day_id, local_date="2026-08-01")
    _start_exercise(client, token, zero_w, 1)
    _record(client, token, zero_w, 1, 1, 15, 0.0, None)
    _complete_workout(client, token, zero_w)

    _, day_id = _ready_plan(client, token, slug="progress-bench-press")
    null_w = _start(client, token, day_id, local_date="2026-08-02")
    _start_exercise(client, token, null_w, 1)
    _record(client, token, null_w, 1, 1, 12, None, None)
    _complete_workout(client, token, null_w)

    items = _history_scoped(client, token, "progress-bench-press", "all", "2026-08-31").json()[
        "items"
    ]
    by_id = {i["workout_id"]: i for i in items}
    assert set(by_id) == {zero_w, null_w}
    assert by_id[zero_w]["heaviest_weight_kg"] is None
    assert by_id[zero_w]["estimated_1rm_kg"] is None
    assert by_id[zero_w]["total_reps"] == 15
    assert by_id[null_w]["heaviest_weight_kg"] is None


def test_history_cursor_period_bound(client: TestClient) -> None:
    token, _ = _register(client)
    for _ in range(3):
        _make_completed(client, token, local_date="2026-08-10")

    page = _history_scoped(
        client, token, "progress-bench-press", "3m", "2026-08-31", "limit=1"
    ).json()
    assert page["next_cursor"] is not None

    assert (
        _history_scoped(
            client,
            token,
            "progress-bench-press",
            "1m",
            "2026-08-31",
            f"limit=1&cursor={page['next_cursor']}",
        ).status_code
        == 422
    )
    assert (
        _history_scoped(
            client,
            token,
            "progress-bench-press",
            "3m",
            "2026-08-30",
            f"limit=1&cursor={page['next_cursor']}",
        ).status_code
        == 422
    )

    second = _history_scoped(
        client,
        token,
        "progress-bench-press",
        "3m",
        "2026-08-31",
        f"limit=1&cursor={page['next_cursor']}",
    ).json()
    assert len(second["items"]) == 1
    assert second["items"][0]["workout_id"] != page["items"][0]["workout_id"]


# ────────────────── F20.1 parameter validation ──────────────────


def test_chart_parameter_validation(client: TestClient) -> None:
    token, _ = _register(client)
    assert _chart(client, token, "progress-bench-press", "1m").status_code == 200

    assert (
        client.get(
            "/api/progress/exercises/progress-bench-press/chart?local_date=2026-08-31",
            headers=_headers(token),
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/progress/exercises/progress-bench-press/chart?period=all",
            headers=_headers(token),
        ).status_code
        == 422
    )
    assert _chart(client, token, "progress-bench-press", "2m").status_code == 422
    assert _chart(client, token, "progress-bench-press", "ALL").status_code == 422
    assert _chart(client, token, "progress-bench-press", "").status_code == 422
    assert (
        client.get(
            "/api/progress/exercises/progress-bench-press/chart?period=all&local_date=2026-02-31",
            headers=_headers(token),
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/progress/exercises/progress-bench-press/chart?period=all&local_date=not-a-date",
            headers=_headers(token),
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/progress/exercises/progress-bench-press/chart"
            "?period=all&period=1m&local_date=2026-08-31",
            headers=_headers(token),
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/progress/exercises/progress-bench-press/chart"
            "?period=all&local_date=2026-08-31&foo=1",
            headers=_headers(token),
        ).status_code
        == 422
    )


def test_history_period_parameter_validation(client: TestClient) -> None:
    token, _ = _register(client)
    assert (
        _history_scoped(client, token, "progress-bench-press", "3m", "2026-08-31").status_code
        == 200
    )

    assert (
        client.get(
            "/api/progress/exercises/progress-bench-press/history?local_date=2026-08-31",
            headers=_headers(token),
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/progress/exercises/progress-bench-press/history?period=all",
            headers=_headers(token),
        ).status_code
        == 422
    )
    assert (
        _history_scoped(client, token, "progress-bench-press", "4m", "2026-08-31").status_code
        == 422
    )
    assert (
        client.get(
            "/api/progress/exercises/progress-bench-press/history"
            "?period=all&period=1m&local_date=2026-08-31",
            headers=_headers(token),
        ).status_code
        == 422
    )
