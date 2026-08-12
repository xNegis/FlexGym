"""Tests for F18 Workout History."""

from __future__ import annotations

import base64
import datetime
import itertools
import json
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from app.models import Exercise, WorkoutSession

_PLAN_COUNTER = itertools.count(1)


@pytest.fixture(autouse=True)
def seed_test_exercises(test_session_factory: Any) -> None:
    with test_session_factory() as session:
        session.add_all(
            [
                Exercise(
                    slug="history-bench-press",
                    name="History Bench Press",
                    primary_muscle="chest",
                    secondary_muscles=["triceps"],
                    equipment="barbell",
                    movement_pattern="horizontal_push",
                    execution_type="bilateral",
                    instructions="Press the bar with control.",
                ),
                Exercise(
                    slug="history-row",
                    name="History Row",
                    primary_muscle="back",
                    secondary_muscles=["biceps"],
                    equipment="cable",
                    movement_pattern="horizontal_pull",
                    execution_type="bilateral",
                    instructions="Pull with control.",
                ),
            ]
        )
        session.commit()


def _register(client: TestClient, email: str = "history@example.com") -> tuple[str, int]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-secure-password-15"},
    )
    assert response.status_code == 201
    token = response.cookies.get("flexgym_token")
    assert token is not None
    return token, response.json()["id"]


def _headers(token: str) -> dict[str, str]:
    return {"Cookie": f"flexgym_token={token}"}


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
    set_count: int = 1,
    exercise_index: int = 0,
) -> dict[str, Any]:
    catalog = client.get("/api/exercises", headers=_headers(token)).json()
    exercise = catalog[exercise_index]
    sets = []
    for i in range(set_count):
        sets.append(
            {
                "target_value": 10 + i,
                "target_weight_kg": 42.5 + i,
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
            "exercise_slug": exercise["slug"],
            "target_type": "repetitions",
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


def _ready_plan(client: TestClient, token: str, set_count: int = 1) -> tuple[int, int]:
    name = f"History Plan {set_count} {next(_PLAN_COUNTER)}"
    routine = _create_routine(client, token, name)
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day(client, token, routine["id"], day["id"], set_count=set_count)
    _activate(client, token, routine["id"])
    return routine["id"], day["id"]


def _start(client: TestClient, token: str, day_id: int, local_date: str = "2026-08-10") -> Any:
    return client.post(
        "/api/workouts",
        json={"training_day_id": day_id, "local_date": local_date},
        headers=_headers(token),
    )


def _start_exercise(client: TestClient, token: str, workout_id: int, ex_pos: int) -> Any:
    return client.post(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/start",
        headers=_headers(token),
    )


def _complete(client: TestClient, token: str, workout_id: int, ex_pos: int, set_pos: int) -> Any:
    return client.put(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/performance",
        json={"entry_mode": "as_planned"},
        headers=_headers(token),
    )


def _skip_set(client: TestClient, token: str, workout_id: int, ex_pos: int, set_pos: int) -> Any:
    return client.post(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/skip",
        json={},
        headers=_headers(token),
    )


def _complete_workout(client: TestClient, token: str, workout_id: int) -> Any:
    return client.post(f"/api/workouts/{workout_id}/complete", headers=_headers(token))


def _cancel(client: TestClient, token: str, workout_id: int) -> Any:
    return client.post(f"/api/workouts/{workout_id}/cancel", headers=_headers(token))


def _make_completed(client: TestClient, token: str) -> int:
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id).json()["id"]
    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    assert _complete_workout(client, token, workout_id).status_code == 200
    return workout_id


def _make_cancelled(client: TestClient, token: str, set_count: int = 1) -> int:
    _, day_id = _ready_plan(client, token, set_count=set_count)
    workout_id = _start(client, token, day_id).json()["id"]
    assert _cancel(client, token, workout_id).status_code == 200
    return workout_id


def _history(client: TestClient, token: str, query: str = "") -> Any:
    return client.get(f"/api/workouts/history{query}", headers=_headers(token))


def test_history_empty(client: TestClient) -> None:
    token, _ = _register(client)
    response = _history(client, token)
    assert response.status_code == 200
    assert response.json() == {"items": [], "next_cursor": None}


def test_history_excludes_in_progress_and_lists_terminal(client: TestClient) -> None:
    token, _ = _register(client)
    completed = _make_completed(client, token)
    cancelled = _make_cancelled(client, token)
    in_progress = _start(client, token, _ready_plan(client, token)[1]).json()["id"]

    response = _history(client, token)
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    assert completed in ids
    assert cancelled in ids
    assert in_progress not in ids


def test_history_newest_first(client: TestClient) -> None:
    token, _ = _register(client)
    first = _make_completed(client, token)
    second = _make_completed(client, token)
    third = _make_cancelled(client, token)

    items = _history(client, token).json()["items"]
    ids = [item["id"] for item in items]
    assert ids[0] == third
    assert ids[1] == second
    assert ids[2] == first
    for item in items:
        assert item["terminal_at"] is not None


def test_history_status_filters(client: TestClient) -> None:
    token, _ = _register(client)
    completed = _make_completed(client, token)
    cancelled = _make_cancelled(client, token)

    completed_items = _history(client, token, "?status=completed").json()["items"]
    assert [i["id"] for i in completed_items] == [completed]
    assert all(i["status"] == "completed" for i in completed_items)

    cancelled_items = _history(client, token, "?status=cancelled").json()["items"]
    assert [i["id"] for i in cancelled_items] == [cancelled]
    assert all(i["status"] == "cancelled" for i in cancelled_items)


def test_history_user_isolation(client: TestClient) -> None:
    owner, _ = _register(client, "history-owner@example.com")
    other, _ = _register(client, "history-other@example.com")
    _make_completed(client, owner)
    _make_cancelled(client, owner)

    response = _history(client, other)
    assert response.status_code == 200
    assert response.json() == {"items": [], "next_cursor": None}


def test_history_pagination_without_duplication(client: TestClient) -> None:
    token, _ = _register(client)
    ids = [_make_completed(client, token) for _ in range(4)]

    first_page = _history(client, token, "?limit=2").json()
    assert len(first_page["items"]) == 2
    assert first_page["next_cursor"] is not None

    second_page = _history(client, token, f"?limit=2&cursor={first_page['next_cursor']}").json()
    assert len(second_page["items"]) == 2
    assert second_page["next_cursor"] is None

    collected = [i["id"] for i in first_page["items"]] + [i["id"] for i in second_page["items"]]
    assert sorted(collected, reverse=True) == sorted(ids, reverse=True)
    assert len(collected) == len(set(collected)) == 4


def test_history_new_rows_between_pages_do_not_repeat(client: TestClient) -> None:
    token, _ = _register(client)
    oldest = _make_completed(client, token)
    middle = _make_completed(client, token)
    newest = _make_completed(client, token)

    first_page = _history(client, token, "?limit=2").json()
    assert [i["id"] for i in first_page["items"]] == [newest, middle]

    inserted = _make_completed(client, token)

    second_page = _history(client, token, f"?limit=2&cursor={first_page['next_cursor']}").json()
    second_ids = [i["id"] for i in second_page["items"]]
    assert inserted not in second_ids
    assert newest not in second_ids
    assert middle not in second_ids
    assert second_ids == [oldest]
    assert second_page["next_cursor"] is None


def test_history_count_invariants_and_duration(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, set_count=2)
    workout_id = _start(client, token, day_id).json()["id"]
    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    _cancel(client, token, workout_id)

    item = _history(client, token, "?status=cancelled").json()["items"][0]
    assert item["completed_set_count"] == 1
    assert item["skipped_set_count"] == 0
    assert item["unresolved_set_count"] == 1
    assert item["total_set_count"] == 2
    assert (
        item["completed_set_count"] + item["skipped_set_count"] + item["unresolved_set_count"] == 2
    )
    assert isinstance(item["duration_seconds"], int)
    assert item["duration_seconds"] >= 0
    assert item["selection_kind"] == "scheduled"


def test_history_cancelled_unresolved_projection(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, set_count=3)
    workout_id = _start(client, token, day_id).json()["id"]
    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    _skip_set(client, token, workout_id, 1, 2)
    _cancel(client, token, workout_id)

    item = _history(client, token, "?status=cancelled").json()["items"][0]
    assert item["completed_set_count"] == 1
    assert item["skipped_set_count"] == 1
    assert item["unresolved_set_count"] == 1
    assert item["total_set_count"] == 3


def test_history_invalid_and_repeated_parameters(client: TestClient) -> None:
    token, _ = _register(client)

    assert _history(client, token, "?status=bogus").status_code == 422
    assert _history(client, token, "?status=").status_code == 422
    assert _history(client, token, "?limit=0").status_code == 422
    assert _history(client, token, "?limit=51").status_code == 422
    assert _history(client, token, "?limit=20.5").status_code == 422
    assert _history(client, token, "?limit=abc").status_code == 422
    assert _history(client, token, "?limit=true").status_code == 422
    assert _history(client, token, "?limit=02").status_code == 422
    assert _history(client, token, "?cursor=").status_code == 422
    assert _history(client, token, "?unknown=1").status_code == 422
    assert _history(client, token, "?status=completed&status=cancelled").status_code == 422
    assert _history(client, token, "?limit=1&limit=2").status_code == 422


def test_history_malformed_cursor(client: TestClient) -> None:
    token, _ = _register(client)
    assert _history(client, token, "?cursor=!!!not-base64!!!").status_code == 422
    assert _history(client, token, "?cursor=abc123").status_code == 422


def test_history_rejects_fabricated_unsigned_cursor(client: TestClient) -> None:
    token, _ = _register(client)
    _make_completed(client, token)
    payload = json.dumps(
        {"v": 1, "u": 1, "s": None, "t": "2099-01-01T00:00:00", "i": 999999},
        separators=(",", ":"),
    ).encode("utf-8")
    fabricated = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")

    assert _history(client, token, f"?cursor={fabricated}").status_code == 422


def test_history_cursor_is_bound_to_issuing_user(client: TestClient) -> None:
    owner, _ = _register(client, "history-cursor-owner@example.com")
    other, _ = _register(client, "history-cursor-other@example.com")
    for _ in range(2):
        _make_completed(client, owner)

    first = _history(client, owner, "?limit=1").json()
    assert first["next_cursor"] is not None
    assert _history(client, other, f"?limit=1&cursor={first['next_cursor']}").status_code == 422


def test_history_cursor_filter_mismatch(client: TestClient) -> None:
    token, _ = _register(client)
    for _ in range(3):
        _make_completed(client, token)

    completed_page = _history(client, token, "?status=completed&limit=1").json()
    assert completed_page["next_cursor"] is not None

    mismatch_all = _history(client, token, f"?cursor={completed_page['next_cursor']}")
    assert mismatch_all.status_code == 422

    mismatch_cancelled = _history(
        client, token, f"?status=cancelled&cursor={completed_page['next_cursor']}"
    )
    assert mismatch_cancelled.status_code == 422


def test_history_cursor_valid_scope_returns_next_page(client: TestClient) -> None:
    token, _ = _register(client)
    for _ in range(3):
        _make_completed(client, token)

    first = _history(client, token, "?status=completed&limit=1").json()
    assert len(first["items"]) == 1
    second = _history(client, token, f"?status=completed&limit=1&cursor={first['next_cursor']}")
    assert second.status_code == 200
    assert second.json()["items"][0]["id"] != first["items"][0]["id"]


def test_history_authentication(client: TestClient) -> None:
    client.cookies.clear()
    assert client.get("/api/workouts/history").status_code == 401


def test_history_deterministic_tie_ordering(client: TestClient, test_session_factory: Any) -> None:
    token, _ = _register(client)
    first = _make_completed(client, token)
    second = _make_completed(client, token)

    same_terminal = datetime.datetime(2026, 8, 12, 12, 0, 0)
    with test_session_factory() as session:
        session.execute(
            update(WorkoutSession)
            .where(WorkoutSession.id.in_([first, second]))
            .values(completed_at=same_terminal)
        )
        session.commit()

    items = _history(client, token).json()["items"]
    assert [i["id"] for i in items] == [second, first]


def test_history_snapshot_independence(client: TestClient) -> None:
    token, _ = _register(client)
    routine_id, day_id = _ready_plan(client, token)
    workout = _start(client, token, day_id).json()
    workout_id = workout["id"]
    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    _complete_workout(client, token, workout_id)

    assert client.delete(f"/api/routines/{routine_id}", headers=_headers(token)).status_code == 204

    item = _history(client, token, "?status=completed").json()["items"][0]
    assert item["routine_name"] == workout["routine_name"]
    assert item["selected_training_day_name"] == "Push"


def test_cancelled_detail_is_terminal_and_read_only(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, set_count=2)
    workout_id = _start(client, token, day_id).json()["id"]
    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    _cancel(client, token, workout_id)

    detail = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert detail["status"] == "cancelled"
    assert detail["resume_url"] is None
    assert detail["current_exercise_position"] is None
    assert detail["current_set_position"] is None
    assert detail["current_set_phase"] is None
    assert detail["current_set_started_at"] is None
    assert detail["transition_to_exercise_position"] is None
    assert isinstance(detail["duration_seconds"], int)
    assert detail["duration_seconds"] >= 0
    assert detail["cancelled_at"] is not None
    assert detail["completed_at"] is None


def test_history_uses_migrated_schema(client: TestClient, test_session_factory: Any) -> None:
    token, _ = _register(client)
    _make_completed(client, token)
    response = _history(client, token)
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
