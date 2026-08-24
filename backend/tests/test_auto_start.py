"""Tests for F27 — Configurable Automatic Same-exercise Set Start."""

from __future__ import annotations

import datetime
import os
import sqlite3
import subprocess
import sys
from collections.abc import Generator
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_session
from app.main import app
from app.models import Exercise, PerformedSet, WorkoutExercise, WorkoutPlannedSet
from app.services import workout_service

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "f22_1_global_photo_limit"


@pytest.fixture(autouse=True)
def seed_f27_exercises(test_session_factory: Any) -> None:
    with test_session_factory() as session:
        session.add(
            Exercise(
                slug="f27-bench-press",
                name="F27 Bench Press",
                primary_muscle="chest",
                secondary_muscles=["triceps"],
                equipment="barbell",
                movement_pattern="horizontal_push",
                execution_type="bilateral",
                instructions="Press the bar with control.",
            )
        )
        session.commit()


def _register(client: TestClient, email: str = "f27@example.com") -> tuple[str, int]:
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


def _set_preference(client: TestClient, token: str, delay: int) -> None:
    response = client.put(
        "/api/workout-preferences",
        json={"automatic_set_start_delay_seconds": delay},
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"automatic_set_start_delay_seconds": delay}


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


def _configure_multi_sets(
    client: TestClient,
    token: str,
    routine_id: int,
    day_id: int,
    set_count: int,
    rest_after_first_set: int | None,
) -> None:
    sets = []
    for index in range(set_count):
        sets.append(
            {
                "target_value": 10,
                "target_weight_kg": 42.5,
                "target_rir": 2,
                "tempo": None,
                "rest_after_set_seconds": (rest_after_first_set if index == 0 else None),
                "notes": None,
            }
        )
    response = client.post(
        f"/api/routines/{routine_id}/days/{day_id}/exercises",
        headers=_headers(token),
        json={
            "exercise_slug": "f27-bench-press",
            "target_type": "repetitions",
            "rest_after_exercise_seconds": 120,
            "notes": None,
            "sets": sets,
        },
    )
    assert response.status_code == 201, response.text


def _activate(client: TestClient, token: str, routine_id: int) -> None:
    response = client.put(
        "/api/active-routine",
        json={"routine_id": routine_id},
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _start(client: TestClient, token: str, day_id: int) -> dict[str, Any]:
    response = client.post(
        "/api/workouts",
        json={"training_day_id": day_id, "local_date": "2026-08-10"},
        headers=_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _start_exercise(client: TestClient, token: str, workout_id: int) -> dict[str, Any]:
    response = client.post(
        f"/api/workouts/{workout_id}/exercises/1/start",
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


def _complete_set(
    client: TestClient, token: str, workout_id: int, set_position: int
) -> dict[str, Any]:
    response = client.put(
        f"/api/workouts/{workout_id}/exercises/1/sets/{set_position}/performance",
        json={"entry_mode": "as_planned"},
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


def _auto_start(client: TestClient, token: str, workout_id: int, set_position: int) -> Any:
    return client.post(
        f"/api/workouts/{workout_id}/exercises/1/sets/{set_position}/auto-start",
        headers=_headers(token),
    )


def _backdate_completed_at(
    session_factory: Any,
    workout_id: int,
    set_position: int,
    seconds_ago: int,
) -> datetime.datetime:
    with session_factory() as session:
        perf = (
            session.query(PerformedSet)
            .join(WorkoutPlannedSet, WorkoutPlannedSet.id == PerformedSet.workout_planned_set_id)
            .join(WorkoutExercise, WorkoutExercise.id == WorkoutPlannedSet.workout_exercise_id)
            .filter(
                WorkoutExercise.workout_session_id == workout_id,
                WorkoutPlannedSet.position == set_position,
            )
            .one()
        )
        target = datetime.datetime.utcnow() - datetime.timedelta(seconds=seconds_ago)
        perf.completed_at = target
        session.commit()
        return target


# ────────────────── preference endpoint ──────────────────


def test_preference_default_is_manual(client: TestClient) -> None:
    token, _ = _register(client)
    response = client.get("/api/workout-preferences", headers=_headers(token))
    assert response.status_code == 200
    assert response.json() == {"automatic_set_start_delay_seconds": 0}


def test_preference_roundtrip_allowed_values(client: TestClient) -> None:
    token, _ = _register(client)
    for delay in (0, 5, 10, 15, 20, 30):
        _set_preference(client, token, delay)
        assert client.get("/api/workout-preferences", headers=_headers(token)).json() == {
            "automatic_set_start_delay_seconds": delay
        }


def test_preference_rejects_invalid_values(client: TestClient) -> None:
    token, _ = _register(client)
    for payload in (
        {"automatic_set_start_delay_seconds": 7},
        {"automatic_set_start_delay_seconds": -1},
        {"automatic_set_start_delay_seconds": True},
        {"automatic_set_start_delay_seconds": "10"},
        {"automatic_set_start_delay_seconds": None},
        {},
        {"automatic_set_start_delay_seconds": 10, "extra": 1},
    ):
        assert (
            client.put(
                "/api/workout-preferences", json=payload, headers=_headers(token)
            ).status_code
            == 422
        )


def test_preference_requires_auth(client: TestClient) -> None:
    assert client.get("/api/workout-preferences").status_code == 401
    assert (
        client.put(
            "/api/workout-preferences", json={"automatic_set_start_delay_seconds": 10}
        ).status_code
        == 401
    )


def test_preference_ownership_isolation(client: TestClient) -> None:
    token_a, _ = _register(client, "a@example.com")
    token_b, _ = _register(client, "b@example.com")
    _set_preference(client, token_a, 15)
    assert client.get("/api/workout-preferences", headers=_headers(token_b)).json() == {
        "automatic_set_start_delay_seconds": 0
    }
    _set_preference(client, token_b, 20)
    assert client.get("/api/workout-preferences", headers=_headers(token_a)).json() == {
        "automatic_set_start_delay_seconds": 15
    }


def test_preference_survives_fitness_profile_deletion(client: TestClient) -> None:
    token, user_id = _register(client)
    _set_preference(client, token, 10)

    profile = client.post(
        "/api/fitness-profile",
        json={
            "date_of_birth": "1990-01-01",
            "biological_sex": "male",
            "height_cm": 180,
            "weight_kg": 80,
            "body_fat_percentage": 15,
            "training_experience": "intermediate",
            "primary_goal": "build_muscle",
            "training_days_per_week": 4,
            "preferred_workout_duration_minutes": 60,
            "training_environment": "full_gym",
            "physical_limitations": None,
            "current_local_date": "2026-08-10",
        },
        headers=_headers(token),
    )
    assert profile.status_code == 201

    assert client.delete("/api/fitness-profile", headers=_headers(token)).status_code == 204

    # Re-authenticate (profile deletion signs the user out) and re-read preference.
    login = client.post(
        "/api/auth/login",
        json={"email": "f27@example.com", "password": "a-secure-password-15"},
    )
    assert login.status_code == 200
    token = login.cookies.get("auth_token")
    assert token is not None
    assert client.get("/api/workout-preferences", headers=_headers(token)).json() == {
        "automatic_set_start_delay_seconds": 10
    }


# ────────────────── workout snapshot ──────────────────


def _ready_two_set_plan(
    client: TestClient, token: str, rest_after_first_set: int | None = 60
) -> tuple[int, int]:
    routine = _create_routine(client, token, "F27 Plan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_multi_sets(client, token, routine["id"], day["id"], 2, rest_after_first_set)
    _activate(client, token, routine["id"])
    return routine["id"], day["id"]


def test_workout_snapshots_preference_and_stays_immutable(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 10)
    _, day_id = _ready_two_set_plan(client, token)

    workout = _start(client, token, day_id)
    assert workout["automatic_set_start_delay_seconds"] == 10

    # A later preference edit must not rewrite the in-progress workout snapshot.
    _set_preference(client, token, 30)
    fetched = client.get(f"/api/workouts/{workout['id']}", headers=_headers(token)).json()
    assert fetched["automatic_set_start_delay_seconds"] == 10


def test_workout_defaults_to_manual_snapshot(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_two_set_plan(client, token)
    workout = _start(client, token, day_id)
    assert workout["automatic_set_start_delay_seconds"] == 0


# ────────────────── automatic start boundary ──────────────────


def test_auto_start_success_records_boundary_and_provenance(
    client: TestClient, test_session_factory: Any
) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout = _start(client, token, day_id)
    workout_id = workout["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    completed_at = _backdate_completed_at(test_session_factory, workout_id, 1, 65)
    boundary = completed_at + datetime.timedelta(seconds=65)

    response = _auto_start(client, token, workout_id, 2)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current_set_phase"] == "set_in_progress"
    assert body["current_set_start_mode"] == "automatic"

    auto_event = next(e for e in body["events"] if e["event_type"] == "set_auto_started")
    assert datetime.datetime.fromisoformat(auto_event["occurred_at"]) == boundary
    assert auto_event["exercise_position"] == 1
    assert auto_event["set_position"] == 2

    # No performed set is created by an automatic start.
    assert body["completed_set_count"] == 1
    current_set = body["exercises"][0]["planned_sets"][1]
    assert current_set["performance"] is None


def test_auto_start_early_is_not_due(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    response = _auto_start(client, token, workout_id, 2)
    assert response.status_code == 409
    assert response.json()["detail"] == "Automatic set start is not due"


def test_auto_start_expired_window(client: TestClient, test_session_factory: Any) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)
    _backdate_completed_at(test_session_factory, workout_id, 1, 75)

    response = _auto_start(client, token, workout_id, 2)
    assert response.status_code == 409
    assert response.json()["detail"] == "Automatic set start window expired"


def test_auto_start_delayed_within_window_succeeds(
    client: TestClient, test_session_factory: Any
) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)
    # Boundary lands four seconds in the past, inside the five-second window.
    completed_at = _backdate_completed_at(test_session_factory, workout_id, 1, 69)
    boundary = completed_at + datetime.timedelta(seconds=65)

    response = _auto_start(client, token, workout_id, 2)
    assert response.status_code == 200, response.text
    auto_event = next(e for e in response.json()["events"] if e["event_type"] == "set_auto_started")
    assert datetime.datetime.fromisoformat(auto_event["occurred_at"]) == boundary


def test_auto_start_disabled_for_manual_snapshot(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    response = _auto_start(client, token, workout_id, 2)
    assert response.status_code == 409
    assert response.json()["detail"] == "Automatic set start is not enabled"


def test_auto_start_null_rest_is_not_enabled(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 10)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=None)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    response = _auto_start(client, token, workout_id, 2)
    assert response.status_code == 409
    assert response.json()["detail"] == "Automatic set start is not enabled"


def test_auto_start_first_set_is_not_enabled(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 10)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    # Mark set 1 incomplete so it returns to awaiting state with no previous set.
    assert (
        client.delete(
            f"/api/workouts/{workout_id}/exercises/1/sets/1/performance",
            headers=_headers(token),
        ).status_code
        == 200
    )

    response = _auto_start(client, token, workout_id, 1)
    assert response.status_code == 409
    assert response.json()["detail"] == "Automatic set start is not enabled"


def test_auto_start_wrong_current_set(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    routine = _create_routine(client, token, "F27 Plan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_multi_sets(client, token, routine["id"], day["id"], 3, 60)
    _activate(client, token, routine["id"])

    workout_id = _start(client, token, day["id"])["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    # Set 2 is the earliest unresolved set; set 3 is unresolved but not current.
    response = _auto_start(client, token, workout_id, 3)
    assert response.status_code == 409
    assert response.json()["detail"] == "Workout set is not current"


def test_auto_start_already_started_after_manual(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    manual = client.post(
        f"/api/workouts/{workout_id}/exercises/1/sets/2/start",
        headers=_headers(token),
    )
    assert manual.status_code == 200
    assert manual.json()["current_set_start_mode"] == "manual"

    response = _auto_start(client, token, workout_id, 2)
    assert response.status_code == 409
    assert response.json()["detail"] == "Workout set is already started"


def test_auto_start_duplicate_is_already_started(
    client: TestClient, test_session_factory: Any
) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)
    _backdate_completed_at(test_session_factory, workout_id, 1, 65)

    assert _auto_start(client, token, workout_id, 2).status_code == 200
    duplicate = _auto_start(client, token, workout_id, 2)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Workout set is already started"


def test_auto_start_then_manual_start_has_one_effective_start(
    client: TestClient, test_session_factory: Any
) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)
    _backdate_completed_at(test_session_factory, workout_id, 1, 65)

    assert _auto_start(client, token, workout_id, 2).status_code == 200
    manual = client.post(
        f"/api/workouts/{workout_id}/exercises/1/sets/2/start",
        headers=_headers(token),
    )
    assert manual.status_code == 409
    assert manual.json()["detail"] == "Workout set is already started"

    body = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    starts = [
        event
        for event in body["events"]
        if event["set_position"] == 2 and event["event_type"] in {"set_started", "set_auto_started"}
    ]
    assert [event["event_type"] for event in starts] == ["set_auto_started"]
    assert [event["sequence"] for event in body["events"]] == list(
        range(1, len(body["events"]) + 1)
    )


def test_auto_start_then_skip_closes_one_effective_start(
    client: TestClient, test_session_factory: Any
) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)
    _backdate_completed_at(test_session_factory, workout_id, 1, 65)

    assert _auto_start(client, token, workout_id, 2).status_code == 200
    skipped = client.post(
        f"/api/workouts/{workout_id}/exercises/1/sets/2/skip",
        json={"reason_code": "too_fatigued"},
        headers=_headers(token),
    )
    assert skipped.status_code == 200, skipped.text

    events = skipped.json()["events"]
    starts = [
        event
        for event in events
        if event["set_position"] == 2 and event["event_type"] in {"set_started", "set_auto_started"}
    ]
    assert [event["event_type"] for event in starts] == ["set_auto_started"]
    assert [event["event_type"] for event in events[-2:]] == [
        "set_auto_started",
        "set_skipped",
    ]
    assert [event["sequence"] for event in events] == list(range(1, len(events) + 1))


def test_competing_mutation_commit_losers_are_normalized(
    client: TestClient, test_session_factory: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    token, user_id = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)
    _backdate_completed_at(test_session_factory, workout_id, 1, 65)

    actions: list[tuple[Any, type[Exception], str]] = [
        (
            lambda session: workout_service.start_set(session, user_id, workout_id, 1, 2),
            workout_service.ExecutionError,
            "Workout set is already started",
        ),
        (
            lambda session: workout_service.auto_start_set(session, user_id, workout_id, 1, 2),
            workout_service.ExecutionError,
            "Workout set is already started",
        ),
        (
            lambda session: workout_service.skip_set(session, user_id, workout_id, 1, 2),
            workout_service.ExecutionError,
            "Workout set is already skipped",
        ),
        (
            lambda session: workout_service.skip_exercise(session, user_id, workout_id, 1),
            workout_service.ExecutionError,
            "Exercise is already skipped",
        ),
        (
            lambda session: workout_service.cancel_workout(session, user_id, workout_id),
            ValueError,
            "Workout is not in progress",
        ),
    ]

    for action, error_type, detail in actions:
        with test_session_factory() as session:

            def fail_commit() -> None:
                raise IntegrityError("commit", {}, Exception("sequence winner committed"))

            monkeypatch.setattr(session, "commit", fail_commit)
            with pytest.raises(error_type, match=detail):
                action(session)

    body = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert body["current_set_phase"] == "awaiting_set_start"
    assert [event["sequence"] for event in body["events"]] == list(
        range(1, len(body["events"]) + 1)
    )


class _CommitFailureSession:
    def __init__(self, error: Exception) -> None:
        self.error = error
        self.rolled_back = False

    def commit(self) -> None:
        raise self.error

    def rollback(self) -> None:
        self.rolled_back = True


def test_commit_normalization_only_converts_sqlite_write_conflicts() -> None:
    locked = OperationalError(
        "commit",
        {},
        sqlite3.OperationalError("database is locked"),
    )
    locked_session = _CommitFailureSession(locked)
    with pytest.raises(workout_service.ExecutionError, match="Workout set is already started"):
        workout_service._commit_normalizing_conflict(  # type: ignore[arg-type]
            locked_session,
            "Workout set is already started",
        )
    assert locked_session.rolled_back is True

    unexpected = OperationalError(
        "commit",
        {},
        sqlite3.OperationalError("disk I/O error"),
    )
    unexpected_session = _CommitFailureSession(unexpected)
    with pytest.raises(OperationalError, match="disk I/O error"):
        workout_service._commit_normalizing_conflict(  # type: ignore[arg-type]
            unexpected_session,
            "Workout set is already started",
        )
    assert unexpected_session.rolled_back is True


def test_auto_start_terminal_workout_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)
    assert (
        client.post(
            f"/api/workouts/{workout_id}/exercises/1/sets/2/start", headers=_headers(token)
        ).status_code
        == 200
    )
    _complete_set(client, token, workout_id, 2)
    assert (
        client.post(f"/api/workouts/{workout_id}/complete", headers=_headers(token)).status_code
        == 200
    )

    response = _auto_start(client, token, workout_id, 2)
    assert response.status_code == 409
    assert response.json()["detail"] == "Workout is not active"


def test_auto_start_ownership_and_invalid_path(client: TestClient) -> None:
    token, _ = _register(client)
    other_token, _ = _register(client, "other@example.com")
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    assert _auto_start(client, other_token, workout_id, 2).status_code == 404
    assert _auto_start(client, token, workout_id, 0).status_code == 422
    assert _auto_start(client, token, 0, 2).status_code == 422
    assert _auto_start(client, token, workout_id, 2).status_code == 409  # not due (fresh)


def test_auto_start_request_body_contract(client: TestClient, test_session_factory: Any) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    url = f"/api/workouts/{workout_id}/exercises/1/sets/2/auto-start"

    # An object JSON body is rejected.
    response = client.post(
        url, json={"automatic_set_start_delay_seconds": 10}, headers=_headers(token)
    )
    assert response.status_code == 422

    # A null JSON body is rejected.
    response = client.post(
        url,
        content=b"null",
        headers={**_headers(token), "Content-Type": "application/json"},
    )
    assert response.status_code == 422

    # A whitespace-only body is rejected.
    response = client.post(
        url,
        content=b"   ",
        headers={**_headers(token), "Content-Type": "application/json"},
    )
    assert response.status_code == 422

    # An empty body reaches domain logic: a fresh boundary is not yet due.
    response = client.post(url, headers=_headers(token))
    assert response.status_code == 409
    assert response.json()["detail"] == "Automatic set start is not due"

    # And a due boundary succeeds with an empty body.
    _backdate_completed_at(test_session_factory, workout_id, 1, 65)
    response = client.post(url, headers=_headers(token))
    assert response.status_code == 200, response.text


def test_auto_start_completed_set_is_not_current(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    response = _auto_start(client, token, workout_id, 1)
    assert response.status_code == 409
    assert response.json()["detail"] == "Workout set is not current"


def test_auto_start_skipped_set_is_not_current(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)
    assert (
        client.post(
            f"/api/workouts/{workout_id}/exercises/1/sets/2/skip",
            json={"reason_code": "too_fatigued"},
            headers=_headers(token),
        ).status_code
        == 200
    )

    response = _auto_start(client, token, workout_id, 2)
    assert response.status_code == 409
    assert response.json()["detail"] == "Workout set is not current"


# ────────────────── start provenance ──────────────────


def test_performed_projection_set_start_mode(client: TestClient) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)

    body = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    first_performance = body["exercises"][0]["planned_sets"][0]["performance"]
    assert first_performance["set_start_mode"] == "manual"


def test_mark_incomplete_then_auto_start_provenance(
    client: TestClient, test_session_factory: Any
) -> None:
    token, _ = _register(client)
    _set_preference(client, token, 5)
    _, day_id = _ready_two_set_plan(client, token, rest_after_first_set=60)

    workout_id = _start(client, token, day_id)["id"]
    _start_exercise(client, token, workout_id)
    _complete_set(client, token, workout_id, 1)
    _backdate_completed_at(test_session_factory, workout_id, 1, 65)

    assert _auto_start(client, token, workout_id, 2).status_code == 200
    _complete_set(client, token, workout_id, 2)

    body = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    second_performance = body["exercises"][0]["planned_sets"][1]["performance"]
    assert second_performance["set_start_mode"] == "automatic"
    assert second_performance["set_started_at"] is not None


# ────────────────── migration validation ──────────────────


def _run_alembic(database_url: str, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["DATABASE_URL"] = database_url
    return subprocess.run(
        [sys.executable, "-m", "alembic", *arguments],
        cwd=BACKEND_ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


def test_f27_migration_fresh_and_rerun(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f27_fresh.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")
    _run_alembic(database_url, "upgrade", "head")
    assert "f27_auto_start" in _run_alembic(database_url, "current").stdout

    engine = create_engine(database_url)
    schema = inspect(engine)
    assert "workout_preferences" in schema.get_table_names()

    pref_checks = {c["name"] for c in schema.get_check_constraints("workout_preferences")}
    assert "ck_workout_preferences_delay" in pref_checks

    workout_columns = {c["name"] for c in schema.get_columns("workout_sessions")}
    assert "automatic_set_start_delay_seconds" in workout_columns

    event_checks = {c["name"] for c in schema.get_check_constraints("workout_events")}
    assert "ck_workout_events_event_type" in event_checks

    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        # The snapshot column enforces its allowed values.
        try:
            connection.execute(
                text(
                    "INSERT INTO workout_sessions (id, user_id, routine_name, local_date, "
                    "scheduled_week_position, scheduled_slot_was_rest, scheduled_training_day_id, "
                    "scheduled_training_day_name, selected_training_day_id, "
                    "selected_training_day_name, selected_week_position, selection_kind, status, "
                    "started_at, automatic_set_start_delay_seconds) VALUES "
                    "(9991, 1, 'X', '2026-08-01', 1, 0, 1, 'D', 1, 'D', 1, 'scheduled', "
                    "'in_progress', '2026-08-01 10:00:00', 7)"
                )
            )
            assert False, "expected CHECK constraint failure"
        except Exception as exc:
            assert "CHECK" in str(exc)
    engine.dispose()


def test_f27_migration_upgrade_preserves_legacy_workouts(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f27_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(9001, 'legacy@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        for status, cancelled_sql, completed_sql in (
            ("completed", "NULL", "'2026-08-01 11:00:00'"),
            ("cancelled", "'2026-08-02 11:00:00'", "NULL"),
            ("in_progress", "NULL", "NULL"),
        ):
            connection.execute(
                text(
                    "INSERT INTO workout_sessions (user_id, routine_name, local_date, "
                    "scheduled_week_position, scheduled_slot_was_rest, scheduled_training_day_id, "
                    "scheduled_training_day_name, selected_training_day_id, "
                    "selected_training_day_name, selected_week_position, selection_kind, status, "
                    f"started_at, cancelled_at, completed_at) VALUES "
                    f"(9001, 'Legacy', '2026-08-01', 1, 0, 1, 'Legacy Day', 1, 'Legacy Day', "
                    f"1, 'scheduled', '{status}', '2026-08-01 10:00:00', "
                    f"{cancelled_sql}, {completed_sql})"
                )
            )

        connection.execute(
            text(
                "INSERT INTO workout_events "
                "(workout_session_id, sequence, event_type, occurred_at) "
                "SELECT MIN(id), 1, 'workout_started', '2026-08-01 10:00:00' "
                "FROM workout_sessions WHERE user_id = 9001"
            )
        )

    legacy_schema = inspect(engine)
    legacy_event_columns = [
        (column["name"], str(column["type"]), column["nullable"], column["primary_key"])
        for column in legacy_schema.get_columns("workout_events")
    ]
    with engine.connect() as connection:
        legacy_event_foreign_keys = sorted(
            tuple(row)
            for row in connection.execute(text("PRAGMA foreign_key_list(workout_events)"))
        )
    legacy_event_uniques = sorted(
        (constraint["name"], tuple(constraint["column_names"]))
        for constraint in legacy_schema.get_unique_constraints("workout_events")
    )
    legacy_event_indexes = sorted(
        (index["name"], tuple(index["column_names"]), index["unique"])
        for index in legacy_schema.get_indexes("workout_events")
    )
    legacy_event_check_names = {
        constraint["name"] for constraint in legacy_schema.get_check_constraints("workout_events")
    }
    engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    upgraded_schema = inspect(engine)
    assert [
        (column["name"], str(column["type"]), column["nullable"], column["primary_key"])
        for column in upgraded_schema.get_columns("workout_events")
    ] == legacy_event_columns
    with engine.connect() as connection:
        assert (
            sorted(
                tuple(row)
                for row in connection.execute(text("PRAGMA foreign_key_list(workout_events)"))
            )
            == legacy_event_foreign_keys
        )
    assert (
        sorted(
            (constraint["name"], tuple(constraint["column_names"]))
            for constraint in upgraded_schema.get_unique_constraints("workout_events")
        )
        == legacy_event_uniques
    )
    assert (
        sorted(
            (index["name"], tuple(index["column_names"]), index["unique"])
            for index in upgraded_schema.get_indexes("workout_events")
        )
        == legacy_event_indexes
    )
    upgraded_event_checks = upgraded_schema.get_check_constraints("workout_events")
    assert {constraint["name"] for constraint in upgraded_event_checks} == legacy_event_check_names
    event_type_check = next(
        constraint
        for constraint in upgraded_event_checks
        if constraint["name"] == "ck_workout_events_event_type"
    )
    assert "set_auto_started" in event_type_check["sqltext"]

    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT automatic_set_start_delay_seconds FROM workout_sessions "
                "WHERE user_id = 9001"
            )
        ).all()
        assert rows == [(0,), (0,), (0,)]
        assert (
            connection.execute(
                text("SELECT COUNT(*) FROM workout_events WHERE event_type = 'set_auto_started'")
            ).scalar_one()
            == 0
        )
        assert connection.execute(
            text(
                "SELECT sequence, event_type FROM workout_events "
                "WHERE workout_session_id IN "
                "(SELECT id FROM workout_sessions WHERE user_id = 9001)"
            )
        ).all() == [(1, "workout_started")]

    # Exercise a real authenticated flow against the migrated database.
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with session_factory() as seed_session:
        seed_session.add(
            Exercise(
                slug="f27-bench-press",
                name="F27 Bench Press",
                primary_muscle="chest",
                secondary_muscles=["triceps"],
                equipment="barbell",
                movement_pattern="horizontal_push",
                execution_type="bilateral",
                instructions="Press the bar with control.",
            )
        )
        seed_session.commit()

    def override_get_session() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(app) as migrated_client:
            token, _ = _register(migrated_client, "migration-f27@example.com")
            _set_preference(migrated_client, token, 10)
            assert migrated_client.get(
                "/api/workout-preferences", headers=_headers(token)
            ).json() == {"automatic_set_start_delay_seconds": 10}
            _, day_id = _ready_two_set_plan(migrated_client, token)
            workout = _start(migrated_client, token, day_id)
            assert workout["automatic_set_start_delay_seconds"] == 10
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
