"""Tests for F13 Start Workout and F14.2 Explicit Set Start Timing."""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Generator
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_session
from app.main import app
from app.models import Exercise

BACKEND_ROOT = Path(__file__).resolve().parents[1]
F13_REVISION = "5f6392b90798"
F14_REVISION = "693e3945d24a"
PREVIOUS_REVISION = "f11a1b2c3d4e"


@pytest.fixture(autouse=True)
def seed_test_exercises(test_session_factory: Any) -> None:
    with test_session_factory() as session:
        session.add_all(
            [
                Exercise(
                    slug="audit-bench-press",
                    name="Audit Bench Press",
                    primary_muscle="chest",
                    secondary_muscles=["triceps"],
                    equipment="barbell",
                    movement_pattern="horizontal_push",
                    execution_type="bilateral",
                    instructions="Press the bar with control.",
                ),
                Exercise(
                    slug="audit-row",
                    name="Audit Row",
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


def _register(client: TestClient, email: str = "workout@example.com") -> tuple[str, int]:
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
    client: TestClient, token: str, routine_id: int, day_id: int, exercise_index: int = 0
) -> dict[str, Any]:
    catalog = client.get("/api/exercises", headers=_headers(token)).json()
    exercise = catalog[exercise_index]
    response = client.post(
        f"/api/routines/{routine_id}/days/{day_id}/exercises",
        headers=_headers(token),
        json={
            "exercise_slug": exercise["slug"],
            "target_type": "repetitions",
            "rest_after_exercise_seconds": 120,
            "notes": "Keep the setup stable",
            "sets": [
                {
                    "target_value": 10,
                    "target_weight_kg": 42.5,
                    "target_rir": 2,
                    "tempo": {
                        "eccentric_seconds": 3,
                        "stretched_pause_seconds": 1,
                        "concentric_seconds": 1,
                        "peak_contraction_seconds": 0,
                    },
                    "rest_after_set_seconds": 90,
                    "notes": "Working set",
                }
            ],
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


def _ready_plan(client: TestClient, token: str, name: str = "Workout Plan") -> tuple[int, int]:
    routine = _create_routine(client, token, name)
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day(client, token, routine["id"], day["id"])
    _activate(client, token, routine["id"])
    return routine["id"], day["id"]


def _start(client: TestClient, token: str, day_id: int, local_date: str = "2026-08-10") -> Any:
    return client.post(
        "/api/workouts",
        json={"training_day_id": day_id, "local_date": local_date},
        headers=_headers(token),
    )


def _start_set(client: TestClient, token: str, workout_id: int, ex_pos: int, set_pos: int) -> Any:
    return client.post(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/start",
        headers=_headers(token),
    )


def _complete(
    client: TestClient,
    token: str,
    workout_id: int,
    ex_pos: int,
    set_pos: int,
    entry_mode: str = "as_planned",
    value: float | None = None,
    weight: float | None = None,
    rir: int | None = None,
) -> Any:
    body: dict[str, Any] = {"entry_mode": entry_mode}
    if entry_mode == "adjusted":
        body["performed_value"] = value
        body["performed_weight_kg"] = weight
        body["performed_rir"] = rir
    return client.put(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/performance",
        json=body,
        headers=_headers(token),
    )


def _start_exercise(client: TestClient, token: str, workout_id: int, ex_pos: int) -> Any:
    return client.post(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/start",
        headers=_headers(token),
    )


def _mark_incomplete(
    client: TestClient, token: str, workout_id: int, ex_pos: int, set_pos: int
) -> Any:
    return client.delete(
        f"/api/workouts/{workout_id}/exercises/{ex_pos}/sets/{set_pos}/performance",
        headers=_headers(token),
    )


# ────────────────── F13 tests ──────────────────


def test_start_context_states_and_strict_date_query(client: TestClient) -> None:
    token, _ = _register(client)
    no_active = client.get(
        "/api/workouts/start-context?local_date=2026-08-10", headers=_headers(token)
    )
    assert no_active.status_code == 200
    assert no_active.json() == {"state": "no_active_routine"}

    routine = _create_routine(client, token, "Context Plan")
    day = _create_day(client, token, routine["id"], "Empty")
    _activate(client, token, routine["id"])

    scheduled = client.get(
        "/api/workouts/start-context?local_date=2026-08-10", headers=_headers(token)
    ).json()
    assert scheduled["state"] == "scheduled_session"
    assert scheduled["session"]["id"] == day["id"]
    assert scheduled["session"]["can_start"] is False

    rest = client.get(
        "/api/workouts/start-context?local_date=2026-08-11", headers=_headers(token)
    ).json()
    assert rest["state"] == "rest_day"
    assert rest["week_position"] == 2

    repeated = client.get(
        "/api/workouts/start-context?local_date=2026-08-10&local_date=2026-08-11",
        headers=_headers(token),
    )
    assert repeated.status_code == 422
    unknown = client.get(
        "/api/workouts/start-context?local_date=2026-08-10&weekday=1",
        headers=_headers(token),
    )
    assert unknown.status_code == 422
    malformed = client.get(
        "/api/workouts/start-context?local_date=2026-8-10", headers=_headers(token)
    )
    assert malformed.status_code == 422


def test_scheduled_start_snapshots_complete_prescription_and_resumes(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)

    response = _start(client, token, day_id)
    assert response.status_code == 201, response.text
    workout = response.json()
    assert workout["selection_kind"] == "scheduled"
    assert workout["scheduled_training_day_id"] == day_id
    assert workout["selected_training_day_id"] == day_id
    assert workout["status"] == "in_progress"
    assert workout["cancelled_at"] is None
    exercise = workout["exercises"][0]
    assert exercise["position"] == 1
    assert exercise["rest_after_exercise_seconds"] == 120
    assert exercise["notes"] == "Keep the setup stable"
    planned_set = exercise["planned_sets"][0]
    assert planned_set == {
        "position": 1,
        "target_value": 10.0,
        "target_weight_kg": 42.5,
        "target_rir": 2,
        "tempo": {
            "eccentric_seconds": 3,
            "stretched_pause_seconds": 1,
            "concentric_seconds": 1,
            "peak_contraction_seconds": 0,
        },
        "rest_after_set_seconds": 90,
        "notes": "Working set",
        "performance": None,
        "exception": None,
    }

    assert workout["current_set_phase"] is None
    assert workout["current_set_started_at"] is None

    active = client.get("/api/workouts/active", headers=_headers(token))
    assert active.status_code == 200
    active_json = active.json()
    assert active_json["id"] == workout["id"]
    assert active_json["exercises"] == workout["exercises"]
    assert active_json["events"] == workout["events"]
    direct = client.get(f"/api/workouts/{workout['id']}", headers=_headers(token))
    assert direct.status_code == 200
    direct_json = direct.json()
    assert direct_json["id"] == workout["id"]
    assert direct_json["exercises"] == workout["exercises"]
    assert direct_json["events"] == workout["events"]


def test_alternate_start_records_schedule_choice_without_mutating_plan(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Alternate Plan")
    scheduled = _create_day(client, token, routine["id"], "Push")
    alternate = _create_day(client, token, routine["id"], "Pull")
    _configure_day(client, token, routine["id"], scheduled["id"])
    _configure_day(client, token, routine["id"], alternate["id"], exercise_index=1)
    _activate(client, token, routine["id"])
    before = client.get(f"/api/routines/{routine['id']}", headers=_headers(token)).json()

    response = _start(client, token, alternate["id"], "2026-08-10")
    assert response.status_code == 201
    workout = response.json()
    assert workout["selection_kind"] == "alternate"
    assert workout["scheduled_training_day_id"] == scheduled["id"]
    assert workout["scheduled_training_day_name"] == "Push"
    assert workout["selected_training_day_id"] == alternate["id"]
    assert workout["selected_training_day_name"] == "Pull"
    after = client.get(f"/api/routines/{routine['id']}", headers=_headers(token)).json()
    assert after["updated_at"] == before["updated_at"]


def test_rest_day_alternate_and_start_rejections_are_atomic(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Rest Plan")
    executable = _create_day(client, token, routine["id"], "Push")
    empty = _create_day(client, token, routine["id"], "Empty")
    _configure_day(client, token, routine["id"], executable["id"])
    _activate(client, token, routine["id"])

    empty_response = _start(client, token, empty["id"], "2026-08-11")
    assert empty_response.status_code == 409
    assert client.get("/api/workouts/active", headers=_headers(token)).json() is None

    rest_response = _start(client, token, executable["id"], "2026-08-12")
    assert rest_response.status_code == 201
    workout = rest_response.json()
    assert workout["scheduled_slot_was_rest"] is True
    assert workout["scheduled_training_day_id"] is None
    assert workout["selection_kind"] == "alternate"


def test_duplicate_start_returns_typed_active_workout_conflict(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    first = _start(client, token, day_id)
    assert first.status_code == 201

    duplicate = _start(client, token, day_id)
    assert duplicate.status_code == 409
    assert duplicate.json() == {
        "detail": "A workout is already in progress",
        "active_workout": {
            "id": first.json()["id"],
            "routine_name": "Workout Plan",
            "selected_training_day_name": "Push",
            "local_date": "2026-08-10",
            "started_at": first.json()["started_at"],
            "status": "in_progress",
            "selection_kind": "scheduled",
            "resume_url": f"/workouts/{first.json()['id']}",
        },
    }


def test_cancel_retains_snapshot_and_clears_active_selection(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout = _start(client, token, day_id).json()

    cancelled = client.post(f"/api/workouts/{workout['id']}/cancel", headers=_headers(token))
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["cancelled_at"] is not None
    assert cancelled.json()["exercises"] == workout["exercises"]
    assert client.get("/api/workouts/active", headers=_headers(token)).json() is None
    assert (
        client.post(f"/api/workouts/{workout['id']}/cancel", headers=_headers(token)).status_code
        == 409
    )


def test_snapshot_survives_source_routine_deletion(client: TestClient) -> None:
    token, _ = _register(client)
    routine_id, day_id = _ready_plan(client, token)
    workout = _start(client, token, day_id).json()

    deleted = client.delete(f"/api/routines/{routine_id}", headers=_headers(token))
    assert deleted.status_code == 204
    retrieved = client.get(f"/api/workouts/{workout['id']}", headers=_headers(token))
    assert retrieved.status_code == 200
    assert retrieved.json()["routine_name"] == "Workout Plan"
    assert retrieved.json()["selected_training_day_name"] == "Push"
    assert retrieved.json()["exercises"] == workout["exercises"]


def test_workout_ownership_and_authentication(client: TestClient) -> None:
    owner, _ = _register(client, "workout-owner@example.com")
    other, _ = _register(client, "workout-other@example.com")
    _, day_id = _ready_plan(client, owner)
    workout_id = _start(client, owner, day_id).json()["id"]

    assert client.get(f"/api/workouts/{workout_id}", headers=_headers(other)).status_code == 404
    assert (
        client.post(f"/api/workouts/{workout_id}/cancel", headers=_headers(other)).status_code
        == 404
    )
    client.cookies.clear()
    assert client.get("/api/workouts/start-context?local_date=2026-08-10").status_code == 401
    assert client.post("/api/workouts", json={}).status_code == 401
    assert client.get("/api/workouts/active").status_code == 401
    assert client.get(f"/api/workouts/{workout_id}").status_code == 401
    assert client.post(f"/api/workouts/{workout_id}/cancel").status_code == 401


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


def test_f13_migration_fresh_schema_and_safe_rerun(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f13_fresh.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")
    _run_alembic(database_url, "upgrade", "head")
    assert "f17_completion" in _run_alembic(database_url, "current").stdout

    engine = create_engine(database_url)
    schema = inspect(engine)
    assert {
        "workout_sessions",
        "workout_exercises",
        "workout_planned_sets",
        "active_workouts",
        "performed_sets",
        "workout_events",
    }.issubset(schema.get_table_names())
    workout_checks = {c["name"] for c in schema.get_check_constraints("workout_sessions")}
    assert {
        "ck_workout_sessions_status",
        "ck_workout_sessions_status_timestamp",
        "ck_workout_sessions_scheduled_slot_was_rest",
        "ck_workout_sessions_scheduled_slot",
        "ck_workout_sessions_scheduled_selection",
    }.issubset(workout_checks)
    exercise_checks = {c["name"] for c in schema.get_check_constraints("workout_exercises")}
    set_checks = {c["name"] for c in schema.get_check_constraints("workout_planned_sets")}
    assert "ck_workout_exercises_position" in exercise_checks
    assert "ck_workout_planned_sets_position" in set_checks
    perf_checks = {c["name"] for c in schema.get_check_constraints("performed_sets")}
    event_checks = {c["name"] for c in schema.get_check_constraints("workout_events")}
    assert "ck_performed_sets_entry_mode" in perf_checks
    assert "ck_workout_events_sequence" in event_checks
    assert "ck_workout_events_event_type" in event_checks
    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()


def test_f13_migration_upgrade_and_real_api_flow(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f13_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)
    previous_engine = create_engine(database_url)
    with previous_engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(9001, 'preserved@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
    previous_engine.dispose()

    _run_alembic(database_url, "upgrade", "head")
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT email FROM users WHERE id = 9001")).scalar_one()
            == "preserved@example.com"
        )

    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_session() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(app) as migrated_client:
            token, _ = _register(migrated_client, "migration-f13@example.com")
            _, day_id = _ready_plan(migrated_client, token, "Migrated Workout Plan")
            started = _start(migrated_client, token, day_id)
            assert started.status_code == 201
            workout_id = started.json()["id"]
            assert (
                migrated_client.get("/api/workouts/active", headers=_headers(token)).json()["id"]
                == workout_id
            )
            assert (
                migrated_client.post(
                    f"/api/workouts/{workout_id}/cancel", headers=_headers(token)
                ).status_code
                == 200
            )
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


# ────────────────── F14.2 helpers ──────────────────


def _configure_day_multi_sets(
    client: TestClient,
    token: str,
    routine_id: int,
    day_id: int,
    set_count: int = 3,
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
                "tempo": {
                    "eccentric_seconds": 3,
                    "stretched_pause_seconds": 1,
                    "concentric_seconds": 1,
                    "peak_contraction_seconds": 0,
                },
                "rest_after_set_seconds": 90,
                "notes": f"Working set {i + 1}",
            }
        )
    response = client.post(
        f"/api/routines/{routine_id}/days/{day_id}/exercises",
        headers=_headers(token),
        json={
            "exercise_slug": exercise["slug"],
            "target_type": "repetitions",
            "rest_after_exercise_seconds": 120,
            "notes": "Keep the setup stable",
            "sets": sets,
        },
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _ready_plan_two_exercises(
    client: TestClient, token: str, name: str = "Two-Ex Plan"
) -> tuple[int, int]:
    routine = _create_routine(client, token, name)
    day = _create_day(client, token, routine["id"], "Full Body")
    _configure_day(client, token, routine["id"], day["id"], exercise_index=0)
    _configure_day(client, token, routine["id"], day["id"], exercise_index=1)
    _activate(client, token, routine["id"])
    return routine["id"], day["id"]


# ────────────────── F14.2 execution tests ──────────────────


def test_workout_start_records_event_and_instructions_snapshot(
    client: TestClient,
) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)

    workout = _start(client, token, day_id).json()
    events = workout["events"]
    assert len(events) >= 1
    assert events[0]["event_type"] == "workout_started"
    assert events[0]["sequence"] == 1
    assert events[0]["occurred_at"] == workout["started_at"]
    assert events[0]["exercise_position"] is None
    assert events[0]["set_position"] is None

    exercise = workout["exercises"][0]
    assert exercise["instructions"] == "Press the bar with control."
    assert exercise["started_at"] is None
    assert exercise["latest_completed_at"] is None
    assert exercise["completed_set_count"] == 0
    assert exercise["total_set_count"] == 1
    assert exercise["is_complete"] is False

    assert workout["completed_set_count"] == 0
    assert workout["total_set_count"] == 1
    assert workout["all_sets_recorded"] is False
    assert workout["current_exercise_position"] is None
    assert workout["current_set_position"] is None
    assert workout["current_set_phase"] is None
    assert workout["current_set_started_at"] is None
    assert "server_now" in workout
    assert "/workouts/" in workout["resume_url"]


def test_exercise_start_atomically_starts_first_set(client: TestClient) -> None:
    """Start exercise appends exercise_started + set_started with same timestamp."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    response = _start_exercise(client, token, workout_id, 1)
    assert response.status_code == 200, response.text
    workout = response.json()

    events = workout["events"]
    exercise_started = [e for e in events if e["event_type"] == "exercise_started"]
    set_started = [e for e in events if e["event_type"] == "set_started"]
    assert len(exercise_started) == 1
    assert len(set_started) == 1
    assert exercise_started[0]["occurred_at"] == set_started[0]["occurred_at"]
    assert set_started[0]["exercise_position"] == 1
    assert set_started[0]["set_position"] == 1
    assert exercise_started[0]["sequence"] < set_started[0]["sequence"]

    assert workout["current_exercise_position"] == 1
    assert workout["current_set_position"] == 1
    assert workout["current_set_phase"] == "set_in_progress"
    assert workout["current_set_started_at"] is not None

    duplicate = _start_exercise(client, token, workout_id, 1)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Exercise is already started"


def test_exercise_start_order_enforcement(client: TestClient) -> None:
    """Cannot start exercise 2 before exercise 1 is complete."""
    token, _ = _register(client)
    _, day_id = _ready_plan_two_exercises(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    start_ex1 = _start_exercise(client, token, workout_id, 1)
    assert start_ex1.status_code == 200

    start_ex2_too_soon = _start_exercise(client, token, workout_id, 2)
    assert start_ex2_too_soon.status_code == 409
    assert start_ex2_too_soon.json()["detail"] == "Exercise cannot be started yet"


def test_as_planned_completion_requires_set_started(client: TestClient) -> None:
    """Completing without a started set returns 409."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    _start_exercise(client, token, workout_id, 1)

    response = _complete(client, token, workout_id, 1, 1)
    assert response.status_code == 200, response.text
    workout = response.json()

    perf = workout["exercises"][0]["planned_sets"][0]["performance"]
    assert perf["performed_value"] == 10.0
    assert perf["performed_weight_kg"] == 42.5
    assert perf["performed_rir"] == 2
    assert perf["entry_mode"] == "as_planned"
    assert perf["set_started_at"] is not None
    assert "completed_at" in perf
    assert "updated_at" in perf
    assert isinstance(perf["observed_duration_seconds"], int)

    set_completed_events = [e for e in workout["events"] if e["event_type"] == "set_completed"]
    assert len(set_completed_events) == 1

    exercise_completed_events = [
        e for e in workout["events"] if e["event_type"] == "exercise_completed"
    ]
    assert len(exercise_completed_events) == 1

    assert workout["exercises"][0]["is_complete"] is True
    assert workout["completed_set_count"] == 1
    assert workout["total_set_count"] == 1
    assert workout["all_sets_recorded"] is True


def test_completion_before_start_rejected(client: TestClient) -> None:
    """Set cannot be completed before it is explicitly started."""
    token, _ = _register(client)
    routine = _create_routine(client, token, "Multi-Set Plan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=2)
    _activate(client, token, routine["id"])
    workout_id = _start(client, token, day["id"]).json()["id"]

    _start_exercise(client, token, workout_id, 1)

    # Complete set 1 (started atomically by exercise start)
    r1 = _complete(client, token, workout_id, 1, 1)
    assert r1.status_code == 200

    # Set 2 is now in awaiting_set_start — try completing without start
    r2 = _complete(client, token, workout_id, 1, 2)
    assert r2.status_code == 409
    assert r2.json()["detail"] == "Workout set has not been started"


def test_subsequent_set_start_and_complete(client: TestClient) -> None:
    """Start set 2, then complete it."""
    token, _ = _register(client)
    routine = _create_routine(client, token, "Subsequent Plan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=2)
    _activate(client, token, routine["id"])
    workout_id = _start(client, token, day["id"]).json()["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)

    workout = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert workout["current_set_phase"] == "awaiting_set_start"
    assert workout["current_set_position"] == 2

    r_start = _start_set(client, token, workout_id, 1, 2)
    assert r_start.status_code == 200, r_start.text
    assert r_start.json()["current_set_phase"] == "set_in_progress"
    assert r_start.json()["current_set_started_at"] is not None

    r_complete = _complete(client, token, workout_id, 1, 2)
    assert r_complete.status_code == 200
    assert r_complete.json()["all_sets_recorded"] is True


def test_duplicate_set_start_rejected(client: TestClient) -> None:
    """Starting an already started set returns 409."""
    token, _ = _register(client)
    routine = _create_routine(client, token, "DuplicateStart")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=2)
    _activate(client, token, routine["id"])
    workout_id = _start(client, token, day["id"]).json()["id"]

    _start_exercise(client, token, workout_id, 1)

    duplicate = _start_set(client, token, workout_id, 1, 1)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Workout set is already started"


def test_start_later_set_rejected(client: TestClient) -> None:
    """Starting set 2 before completing set 1 returns 409."""
    token, _ = _register(client)
    routine = _create_routine(client, token, "LaterSetPlan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=3)
    _activate(client, token, routine["id"])
    workout_id = _start(client, token, day["id"]).json()["id"]

    _start_exercise(client, token, workout_id, 1)

    r = _start_set(client, token, workout_id, 1, 2)
    assert r.status_code == 409
    assert r.json()["detail"] == "Workout set is not current"


def test_adjusted_completion(client: TestClient) -> None:
    """Adjusted completion works through start + complete cycle."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    _start_exercise(client, token, workout_id, 1)

    response = _complete(
        client,
        token,
        workout_id,
        1,
        1,
        entry_mode="adjusted",
        value=8,
        weight=40.0,
        rir=1,
    )
    assert response.status_code == 200, response.text
    workout = response.json()

    perf = workout["exercises"][0]["planned_sets"][0]["performance"]
    assert perf["performed_value"] == 8.0
    assert perf["performed_weight_kg"] == 40.0
    assert perf["performed_rir"] == 1
    assert perf["entry_mode"] == "adjusted"
    assert perf["set_started_at"] is not None
    assert isinstance(perf["observed_duration_seconds"], int)


def test_adjusted_completion_requires_explicit_nullable_fields_and_rejects_boolean(
    client: TestClient,
) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id).json()["id"]
    _start_exercise(client, token, workout_id, 1)

    missing_nullable_fields = client.put(
        f"/api/workouts/{workout_id}/exercises/1/sets/1/performance",
        json={"entry_mode": "adjusted", "performed_value": 8},
        headers=_headers(token),
    )
    boolean_value = client.put(
        f"/api/workouts/{workout_id}/exercises/1/sets/1/performance",
        json={
            "entry_mode": "adjusted",
            "performed_value": True,
            "performed_weight_kg": None,
            "performed_rir": None,
        },
        headers=_headers(token),
    )

    assert missing_nullable_fields.status_code == 422
    assert boolean_value.status_code == 422
    workout = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert workout["exercises"][0]["planned_sets"][0]["performance"] is None


def test_final_set_completes_exercise_atomically(client: TestClient) -> None:
    """Completing last set also appends exercise_completed event."""
    token, _ = _register(client)
    routine = _create_routine(client, token, "Multi-Set Plan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=3)
    _activate(client, token, routine["id"])
    workout_id = _start(client, token, day["id"]).json()["id"]

    _start_exercise(client, token, workout_id, 1)

    # Complete set 1
    _complete(client, token, workout_id, 1, 1)

    # Start and complete set 2
    _start_set(client, token, workout_id, 1, 2)
    _complete(client, token, workout_id, 1, 2)

    # Start and complete set 3 (final)
    _start_set(client, token, workout_id, 1, 3)
    r3 = _complete(client, token, workout_id, 1, 3)
    assert r3.status_code == 200, r3.text
    final_workout = r3.json()

    set_completed_events = [
        e for e in final_workout["events"] if e["event_type"] == "set_completed"
    ]
    assert len(set_completed_events) == 3
    exercise_completed_events = [
        e for e in final_workout["events"] if e["event_type"] == "exercise_completed"
    ]
    assert len(exercise_completed_events) == 1
    assert exercise_completed_events[0]["exercise_position"] == 1

    assert final_workout["exercises"][0]["is_complete"] is True
    assert final_workout["exercises"][0]["completed_set_count"] == 3
    assert final_workout["completed_set_count"] == 3
    assert final_workout["all_sets_recorded"] is True


def test_out_of_order_completion_returns_409(client: TestClient) -> None:
    """Cannot complete set 2 before set 1, returns 'Workout set is not current'."""
    token, _ = _register(client)
    routine = _create_routine(client, token, "Out-Of-Order Plan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=3)
    _activate(client, token, routine["id"])
    workout_id = _start(client, token, day["id"]).json()["id"]

    _start_exercise(client, token, workout_id, 1)

    response = _complete(client, token, workout_id, 1, 2)
    assert response.status_code == 409
    assert response.json()["detail"] == "Workout set is not current"


def test_unstarted_exercise_rejects_completion(client: TestClient) -> None:
    """Cannot complete set without starting exercise first."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    response = _complete(client, token, workout_id, 1, 1)
    assert response.status_code == 409
    assert response.json()["detail"] == "Exercise has not been started"


def test_set_edit_preserves_original_completed_at(client: TestClient) -> None:
    """Edit preserves completed_at, changes updated_at, appends set_updated."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)

    response = _complete(
        client,
        token,
        workout_id,
        1,
        1,
        entry_mode="adjusted",
        value=12,
        weight=45.0,
        rir=1,
    )
    assert response.status_code == 200, response.text
    workout = response.json()

    perf = workout["exercises"][0]["planned_sets"][0]["performance"]
    assert perf["performed_value"] == 12.0
    assert perf["performed_weight_kg"] == 45.0
    assert perf["performed_rir"] == 1
    assert perf["entry_mode"] == "adjusted"
    assert perf["completed_at"] != perf["updated_at"]

    set_updated_events = [e for e in workout["events"] if e["event_type"] == "set_updated"]
    assert len(set_updated_events) == 1
    assert set_updated_events[0]["exercise_position"] == 1
    assert set_updated_events[0]["set_position"] == 1


def test_mark_incomplete_and_reopen(client: TestClient) -> None:
    """Mark incomplete removes performance. Set goes to awaiting_set_start."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)

    response = _mark_incomplete(client, token, workout_id, 1, 1)
    assert response.status_code == 200, response.text
    workout = response.json()

    assert workout["exercises"][0]["planned_sets"][0]["performance"] is None
    assert workout["exercises"][0]["is_complete"] is False
    assert workout["completed_set_count"] == 0
    assert workout["current_set_phase"] == "awaiting_set_start"

    mark_incomplete_events = [
        e for e in workout["events"] if e["event_type"] == "set_marked_incomplete"
    ]
    assert len(mark_incomplete_events) == 1

    duplicate = _mark_incomplete(client, token, workout_id, 1, 1)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Workout set is already incomplete"


def test_mark_incomplete_requires_restart(client: TestClient) -> None:
    """After mark incomplete, the set requires a new start before completion."""
    token, _ = _register(client)
    routine = _create_routine(client, token, "RestartPlan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=2)
    _activate(client, token, routine["id"])
    workout_id = _start(client, token, day["id"]).json()["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    _mark_incomplete(client, token, workout_id, 1, 1)

    # Try completing without restart
    r = _complete(client, token, workout_id, 1, 1)
    assert r.status_code == 409
    assert r.json()["detail"] == "Workout set has not been started"

    # Start and complete again
    _start_set(client, token, workout_id, 1, 1)
    r2 = _complete(client, token, workout_id, 1, 1)
    assert r2.status_code == 200
    assert r2.json()["exercises"][0]["planned_sets"][0]["performance"] is not None


def test_resume_recalculation_after_undo(client: TestClient) -> None:
    """After marking incomplete, resume points to earliest incomplete set."""
    token, _ = _register(client)
    routine = _create_routine(client, token, "Resume Plan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=3)
    _activate(client, token, routine["id"])
    workout_id = _start(client, token, day["id"]).json()["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    _start_set(client, token, workout_id, 1, 2)
    _complete(client, token, workout_id, 1, 2)
    _mark_incomplete(client, token, workout_id, 1, 1)

    resume_workout = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert resume_workout["current_exercise_position"] == 1
    assert resume_workout["current_set_position"] == 1
    assert resume_workout["current_set_phase"] == "awaiting_set_start"
    assert f"/workouts/{workout_id}/exercises/1" in resume_workout["resume_url"]


def test_progress_counts_through_full_flow(client: TestClient) -> None:
    """Verify completed_set_count, phase, and positions."""
    token, _ = _register(client)
    routine = _create_routine(client, token, "Progress Plan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=2)
    _activate(client, token, routine["id"])
    workout_id = _start(client, token, day["id"]).json()["id"]

    w0 = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert w0["completed_set_count"] == 0
    assert w0["all_sets_recorded"] is False
    assert w0["current_exercise_position"] is None
    assert w0["current_set_phase"] is None

    _start_exercise(client, token, workout_id, 1)

    w1 = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert w1["completed_set_count"] == 0
    assert w1["current_exercise_position"] == 1
    assert w1["current_set_position"] == 1
    assert w1["current_set_phase"] == "set_in_progress"

    _complete(client, token, workout_id, 1, 1)

    w2 = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert w2["completed_set_count"] == 1
    assert w2["all_sets_recorded"] is False
    assert w2["current_exercise_position"] == 1
    assert w2["current_set_position"] == 2
    assert w2["current_set_phase"] == "awaiting_set_start"

    _start_set(client, token, workout_id, 1, 2)
    _complete(client, token, workout_id, 1, 2)

    w3 = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert w3["completed_set_count"] == 2
    assert w3["all_sets_recorded"] is True
    assert w3["current_exercise_position"] is None
    assert w3["current_set_phase"] is None


def test_transition_states(client: TestClient) -> None:
    """Exercise transition and atomic next exercise + set start."""
    token, _ = _register(client)
    _, day_id = _ready_plan_two_exercises(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)

    w_after_ex1 = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert w_after_ex1["transition_to_exercise_position"] == 2
    assert w_after_ex1["current_exercise_position"] is None
    assert w_after_ex1["current_set_phase"] is None
    assert w_after_ex1["resume_url"] == f"/workouts/{workout_id}/exercises/1"

    r_start = _start_exercise(client, token, workout_id, 2)
    assert r_start.status_code == 200, r_start.text

    w_after_ex2_start = r_start.json()
    assert w_after_ex2_start["transition_to_exercise_position"] is None
    assert w_after_ex2_start["current_exercise_position"] == 2
    assert w_after_ex2_start["current_set_position"] == 1
    assert w_after_ex2_start["current_set_phase"] == "set_in_progress"
    assert w_after_ex2_start["current_set_started_at"] is not None


def test_cancelled_workout_rejects_execution(client: TestClient) -> None:
    """Cancelled workout returns 409 for start, complete, update, mark incomplete."""
    token, _ = _register(client)
    _, day_id = _ready_plan_two_exercises(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)

    client.post(f"/api/workouts/{workout_id}/cancel", headers=_headers(token))

    start_resp = _start_exercise(client, token, workout_id, 2)
    assert start_resp.status_code == 409
    assert start_resp.json()["detail"] == "Workout is not active"

    set_start_resp = _start_set(client, token, workout_id, 1, 2)
    assert set_start_resp.status_code == 409

    complete_resp = _complete(client, token, workout_id, 2, 1)
    assert complete_resp.status_code == 409

    update_resp = _complete(
        client,
        token,
        workout_id,
        1,
        1,
        entry_mode="adjusted",
        value=5,
        weight=30.0,
        rir=0,
    )
    assert update_resp.status_code == 409

    mark_resp = _mark_incomplete(client, token, workout_id, 1, 1)
    assert mark_resp.status_code == 409

    cancelled = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert cancelled["status"] == "cancelled"
    assert cancelled["exercises"][0]["planned_sets"][0]["performance"] is not None
    cancelled_events = [e for e in cancelled["events"] if e["event_type"] == "workout_cancelled"]
    assert len(cancelled_events) == 1


def test_invalid_path_positions(client: TestClient) -> None:
    """Out-of-range exercise/set positions return 404."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout_id = _start(client, token, day_id).json()["id"]

    start_bad = _start_exercise(client, token, workout_id, 99)
    assert start_bad.status_code == 404
    assert start_bad.json()["detail"] == "Workout exercise not found"

    _start_exercise(client, token, workout_id, 1)

    set_start_bad = _start_set(client, token, workout_id, 1, 99)
    assert set_start_bad.status_code == 404

    complete_bad = _complete(client, token, workout_id, 1, 99)
    assert complete_bad.status_code == 404
    assert complete_bad.json()["detail"] == "Workout set not found"

    update_bad = _complete(
        client,
        token,
        workout_id,
        99,
        1,
        entry_mode="adjusted",
        value=5,
        weight=None,
        rir=None,
    )
    assert update_bad.status_code == 404

    mark_bad = _mark_incomplete(client, token, workout_id, 1, 99)
    assert mark_bad.status_code == 404


def test_ownership_isolation_for_execution(client: TestClient) -> None:
    """Other user cannot start exercise, start set, or mutate sets."""
    owner, _ = _register(client, "owner-f14-exec@example.com")
    other, _ = _register(client, "other-f14-exec@example.com")
    _, day_id = _ready_plan(client, owner)
    workout_id = _start(client, owner, day_id).json()["id"]

    start_resp = _start_exercise(client, other, workout_id, 1)
    assert start_resp.status_code == 404

    set_start_resp = _start_set(client, other, workout_id, 1, 1)
    assert set_start_resp.status_code == 404

    complete_resp = _complete(client, other, workout_id, 1, 1)
    assert complete_resp.status_code == 404

    update_resp = _complete(
        client,
        other,
        workout_id,
        1,
        1,
        entry_mode="adjusted",
        value=5,
        weight=None,
        rir=None,
    )
    assert update_resp.status_code == 404

    mark_resp = _mark_incomplete(client, other, workout_id, 1, 1)
    assert mark_resp.status_code == 404


def test_execution_requires_authentication(client: TestClient) -> None:
    """Unauthenticated access to new endpoints returns 401."""
    client.cookies.clear()

    assert client.post("/api/workouts/1/exercises/1/start").status_code == 401
    assert client.post("/api/workouts/1/exercises/1/sets/1/start").status_code == 401
    assert (
        client.put(
            "/api/workouts/1/exercises/1/sets/1/performance",
            json={"entry_mode": "as_planned"},
        ).status_code
        == 401
    )
    assert (
        client.put(
            "/api/workouts/1/exercises/1/sets/1/performance",
            json={
                "entry_mode": "adjusted",
                "performed_value": 5,
                "performed_weight_kg": None,
                "performed_rir": None,
            },
        ).status_code
        == 401
    )
    assert client.delete("/api/workouts/1/exercises/1/sets/1/performance").status_code == 401


# ────────────────── F14.2 migration validation ──────────────────


def test_f14_2_migration_upgrade_and_legacy_timing(tmp_path: Path) -> None:
    """Upgrade from F14 head preserves legacy performance with null timing."""
    database_url = f"sqlite:///{(tmp_path / 'f14_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", F14_REVISION)

    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(9001, 'legacy@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
    engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    engine2 = create_engine(database_url, connect_args={"check_same_thread": False})
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine2)

    def override_get_session() -> Generator[Session, None, None]:
        s = session_factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(app) as migrated_client:
            token, _ = _register(migrated_client, "legacy-user@example.com")
            _, day_id = _ready_plan(migrated_client, token, "Legacy Plan")
            workout_id = _start(migrated_client, token, day_id).json()["id"]

            _start_exercise(migrated_client, token, workout_id, 1)

            r = _complete(migrated_client, token, workout_id, 1, 1)
            assert r.status_code == 200, r.text
            workout = r.json()
            perf = workout["exercises"][0]["planned_sets"][0]["performance"]
            assert perf["set_started_at"] is not None
            assert isinstance(perf["observed_duration_seconds"], int)
            assert perf["observed_duration_seconds"] >= 0

            assert workout["current_set_phase"] is None
            assert workout["all_sets_recorded"] is True
    finally:
        app.dependency_overrides.clear()
        engine2.dispose()


def test_f14_2_migration_fresh_and_rerun(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f14_2_fresh.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")
    assert "f17_completion" in _run_alembic(database_url, "current").stdout
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    schema = inspect(engine)
    event_checks = {c["name"] for c in schema.get_check_constraints("workout_events")}
    assert "ck_workout_events_event_type" in event_checks
    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()


# ────────────────── F15 exception helpers ──────────────────


def _ready_plan_multi_sets(client: TestClient, token: str, set_count: int = 3) -> tuple[int, int]:
    routine = _create_routine(client, token, "Multi-Set Plan")
    day = _create_day(client, token, routine["id"], "Push")
    _configure_day_multi_sets(client, token, routine["id"], day["id"], set_count=set_count)
    _activate(client, token, routine["id"])
    return routine["id"], day["id"]


def _ready_plan_two_ex_two_sets(client: TestClient, token: str) -> tuple[int, int]:
    routine = _create_routine(client, token, "Two-Ex-Two-Set")
    day = _create_day(client, token, routine["id"], "Full Body")
    _configure_day_multi_sets(
        client, token, routine["id"], day["id"], set_count=2, exercise_index=0
    )
    _configure_day_multi_sets(
        client, token, routine["id"], day["id"], set_count=2, exercise_index=1
    )
    _activate(client, token, routine["id"])
    return routine["id"], day["id"]


def _skip_set(
    client: TestClient,
    token: str,
    workout_id: int,
    exercise_pos: int,
    set_pos: int,
    reason_code: str | None = None,
    note: str | None = None,
) -> Any:
    body: dict[str, str | None] = {}
    if reason_code is not None:
        body["reason_code"] = reason_code
    if note is not None:
        body["note"] = note
    return client.post(
        f"/api/workouts/{workout_id}/exercises/{exercise_pos}/sets/{set_pos}/skip",
        json=body if body else {},
        headers=_headers(token),
    )


def _undo_set_skip(
    client: TestClient,
    token: str,
    workout_id: int,
    exercise_pos: int,
    set_pos: int,
) -> Any:
    return client.delete(
        f"/api/workouts/{workout_id}/exercises/{exercise_pos}/sets/{set_pos}/skip",
        headers=_headers(token),
    )


def _skip_exercise(
    client: TestClient,
    token: str,
    workout_id: int,
    exercise_pos: int,
    reason_code: str | None = None,
    note: str | None = None,
) -> Any:
    body: dict[str, str | None] = {}
    if reason_code is not None:
        body["reason_code"] = reason_code
    if note is not None:
        body["note"] = note
    return client.post(
        f"/api/workouts/{workout_id}/exercises/{exercise_pos}/skip",
        json=body if body else {},
        headers=_headers(token),
    )


def _undo_exercise_skip(
    client: TestClient,
    token: str,
    workout_id: int,
    exercise_pos: int,
) -> Any:
    return client.delete(
        f"/api/workouts/{workout_id}/exercises/{exercise_pos}/skip",
        headers=_headers(token),
    )


# ────────────────── F15 set skip tests ──────────────────


def test_skip_awaiting_set_without_feedback(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    r = _skip_set(client, token, workout["id"], 1, 1)
    assert r.status_code == 200, r.text
    updated = r.json()

    assert updated["skipped_set_count"] == 1
    assert updated["completed_set_count"] == 0
    assert updated["all_sets_recorded"] is False
    assert updated["all_sets_resolved"] is False

    ps = updated["exercises"][0]["planned_sets"][0]
    assert ps["performance"] is None
    assert ps["exception"] is not None
    assert ps["exception"]["scope"] == "set"
    assert ps["exception"]["reason_code"] is None
    assert ps["exception"]["note"] is None

    events = updated["events"]
    assert events[-1]["event_type"] == "set_skipped"
    assert events[-1]["exception"]["scope"] == "set"


def test_skip_in_progress_set_closes_attempt(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)
    _start_set(client, token, workout["id"], 1, 1)

    r = _skip_set(client, token, workout["id"], 1, 1)
    assert r.status_code == 200, r.text
    updated = r.json()

    ps = updated["exercises"][0]["planned_sets"][0]
    assert ps["exception"] is not None
    assert ps["performance"] is None

    event_types = [e["event_type"] for e in updated["events"]]
    assert "set_started" in event_types
    assert "set_skipped" in event_types
    assert "set_completed" not in event_types


def test_skip_set_with_reason_and_note(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    r = _skip_set(client, token, workout["id"], 1, 1, reason_code="too_fatigued", note="Exhausted")
    assert r.status_code == 200, r.text
    updated = r.json()

    exc = updated["exercises"][0]["planned_sets"][0]["exception"]
    assert exc["reason_code"] == "too_fatigued"
    assert exc["note"] == "Exhausted"

    event = updated["events"][-1]
    assert event["exception"]["reason_code"] == "too_fatigued"
    assert event["exception"]["note"] == "Exhausted"


def test_skip_set_other_requires_note(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    r = _skip_set(client, token, workout["id"], 1, 1, reason_code="other")
    assert r.status_code == 422, r.text

    r2 = _skip_set(client, token, workout["id"], 1, 1, reason_code="other", note="Reason details")
    assert r2.status_code == 200, r2.text


def test_skip_exercise_with_pain_or_discomfort_reason(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()

    response = _skip_exercise(
        client,
        token,
        workout["id"],
        1,
        reason_code="pain_or_discomfort",
        note="Left shoulder felt uncomfortable",
    )

    assert response.status_code == 200, response.text
    updated = response.json()
    exception = updated["exercises"][0]["exception"]
    assert exception["reason_code"] == "pain_or_discomfort"
    assert exception["note"] == "Left shoulder felt uncomfortable"
    assert updated["events"][-1]["exception"] == {
        "scope": "exercise",
        "reason_code": "pain_or_discomfort",
        "note": "Left shoulder felt uncomfortable",
    }


def test_skip_set_advances_to_next_unresolved(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=3)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    r = _skip_set(client, token, workout["id"], 1, 1)
    assert r.status_code == 200
    updated = r.json()

    assert updated["current_set_position"] == 2
    assert updated["current_set_phase"] == "awaiting_set_start"


def test_skip_final_set_triggers_transition(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    _complete(client, token, workout["id"], 1, 1)
    r = _skip_set(client, token, workout["id"], 1, 2)
    assert r.status_code == 200
    updated = r.json()

    assert updated["transition_to_exercise_position"] == 2
    assert updated["exercises"][0]["execution_status"] == "partial"
    assert updated["exercises"][0]["is_resolved"] is True


def test_undo_set_skip_restores_work(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    _skip_set(client, token, workout["id"], 1, 1)
    r = _undo_set_skip(client, token, workout["id"], 1, 1)
    assert r.status_code == 200, r.text
    updated = r.json()

    ps = updated["exercises"][0]["planned_sets"][0]
    assert ps["exception"] is None
    assert ps["performance"] is None
    assert updated["skipped_set_count"] == 0

    event_types = [e["event_type"] for e in updated["events"]]
    assert "set_skipped" in event_types
    assert "set_skip_reverted" in event_types


def test_undo_set_skip_requires_restart(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    _skip_set(client, token, workout["id"], 1, 1)
    _undo_set_skip(client, token, workout["id"], 1, 1)

    r = _complete(client, token, workout["id"], 1, 1)
    assert r.status_code == 409, r.text
    assert "has not been started" in r.json()["detail"]


def test_progress_all_sets_resolved_after_all_skipped(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)
    _skip_set(client, token, workout["id"], 1, 1)
    _skip_set(client, token, workout["id"], 1, 2)

    updated = client.get(f"/api/workouts/{workout['id']}", headers=_headers(token)).json()
    assert updated["all_sets_resolved"] is True
    assert updated["all_sets_recorded"] is False
    assert updated["completed_set_count"] == 0
    assert updated["skipped_set_count"] == 2
    assert updated["resume_url"] == f"/workouts/{workout['id']}"


# ────────────────── F15 exercise skip tests ──────────────────


def test_skip_exercise_before_start(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()

    r = _skip_exercise(client, token, workout["id"], 1, reason_code="not_enough_time")
    assert r.status_code == 200, r.text
    updated = r.json()

    ex = updated["exercises"][0]
    assert ex["execution_status"] == "skipped"
    assert ex["is_resolved"] is True
    assert ex["completed_set_count"] == 0
    assert ex["skipped_set_count"] == 2

    for ps in ex["planned_sets"]:
        assert ps["exception"] is not None
        assert ps["exception"]["scope"] == "exercise"

    events = updated["events"]
    assert events[-1]["event_type"] == "exercise_skipped"


def test_skip_exercise_after_partial_preserves_performed(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)
    _complete(client, token, workout["id"], 1, 1)

    r = _skip_exercise(client, token, workout["id"], 1)
    assert r.status_code == 200, r.text
    updated = r.json()

    ex = updated["exercises"][0]
    assert ex["execution_status"] == "partial"
    assert ex["completed_set_count"] == 1
    assert ex["skipped_set_count"] == 1

    assert ex["planned_sets"][0]["performance"] is not None
    assert ex["planned_sets"][1]["exception"] is not None


def test_undo_exercise_skip_restores_remaining(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)
    _complete(client, token, workout["id"], 1, 1)
    _skip_exercise(client, token, workout["id"], 1)

    r = _undo_exercise_skip(client, token, workout["id"], 1)
    assert r.status_code == 200, r.text
    updated = r.json()

    ex = updated["exercises"][0]
    assert ex["exception"] is None
    assert ex["skipped_set_count"] == 0
    assert ex["is_resolved"] is False

    event_types = [e["event_type"] for e in updated["events"]]
    assert "exercise_skipped" in event_types
    assert "exercise_skip_reverted" in event_types


def test_undo_exercise_skip_closes_in_progress_set_and_requires_restart(
    client: TestClient,
) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    skipped = _skip_exercise(client, token, workout["id"], 1)
    assert skipped.status_code == 200, skipped.text

    reverted = _undo_exercise_skip(client, token, workout["id"], 1)
    assert reverted.status_code == 200, reverted.text
    restored = reverted.json()
    assert restored["current_set_position"] == 1
    assert restored["current_set_phase"] == "awaiting_set_start"
    assert restored["current_set_started_at"] is None

    completion = _complete(client, token, workout["id"], 1, 1)
    assert completion.status_code == 409
    assert "has not been started" in completion.json()["detail"]

    restarted = _start_set(client, token, workout["id"], 1, 1)
    assert restarted.status_code == 200, restarted.text
    assert restarted.json()["current_set_phase"] == "set_in_progress"


# ────────────────── F15 conflict / rejection tests ──────────────────


def test_skip_already_complete_set_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)
    _complete(client, token, workout["id"], 1, 1)

    r = _skip_set(client, token, workout["id"], 1, 1)
    assert r.status_code == 409
    assert "already complete" in r.json()["detail"]


def test_skip_already_skipped_set_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    _skip_set(client, token, workout["id"], 1, 1)
    r = _skip_set(client, token, workout["id"], 1, 1)
    assert r.status_code == 409


def test_skip_exercise_already_resolved_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)
    _complete(client, token, workout["id"], 1, 1)
    _start_set(client, token, workout["id"], 1, 2)
    _complete(client, token, workout["id"], 1, 2)

    r = _skip_exercise(client, token, workout["id"], 1)
    assert r.status_code == 409
    assert "already resolved" in r.json()["detail"]


def test_skip_exercise_already_skipped_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()

    _skip_exercise(client, token, workout["id"], 1)
    r = _skip_exercise(client, token, workout["id"], 1)
    assert r.status_code == 409
    assert "already skipped" in r.json()["detail"]


def test_undo_not_skipped_set_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    r = _undo_set_skip(client, token, workout["id"], 1, 1)
    assert r.status_code == 409
    assert "not skipped" in r.json()["detail"]


def test_skip_set_not_current_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=3)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    r = _skip_set(client, token, workout["id"], 1, 2)
    assert r.status_code == 409

    r2 = _skip_set(client, token, workout["id"], 1, 99)
    assert r2.status_code == 404


def test_skip_set_unstarted_exercise_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()

    r = _skip_set(client, token, workout["id"], 1, 1)
    assert r.status_code == 409
    assert "has not been started" in r.json()["detail"]


def test_skip_exercise_before_earlier_resolved_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    r = _skip_exercise(client, token, workout["id"], 2)
    assert r.status_code == 409
    assert "cannot be skipped yet" in r.json()["detail"]


def test_skip_set_covered_by_exercise_exception_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_ex_two_sets(client, token)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    _skip_exercise(client, token, workout["id"], 1)
    r = _skip_set(client, token, workout["id"], 1, 2)
    assert r.status_code == 409


# ────────────────── F15 other tests ──────────────────


def test_reverse_skip_after_later_progress_returns_earliest_unresolved(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)
    _skip_set(client, token, workout["id"], 1, 1)
    _start_set(client, token, workout["id"], 1, 2)
    _complete(client, token, workout["id"], 1, 2)

    r = _undo_set_skip(client, token, workout["id"], 1, 1)
    assert r.status_code == 200, r.text
    updated = r.json()

    assert updated["current_exercise_position"] == 1
    assert updated["current_set_position"] == 1
    assert updated["skipped_set_count"] == 0


def test_cancelled_workout_rejects_skip(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)
    client.post(f"/api/workouts/{workout['id']}/cancel", headers=_headers(token))

    r1 = _skip_set(client, token, workout["id"], 1, 1)
    assert r1.status_code == 409
    assert "not active" in r1.json()["detail"]

    r2 = _skip_exercise(client, token, workout["id"], 1)
    assert r2.status_code == 409
    assert "not active" in r2.json()["detail"]


def test_skip_note_trimmed(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    r = _skip_set(client, token, workout["id"], 1, 1, note="  trimmed example  ")
    assert r.status_code == 200
    updated = r.json()
    assert updated["exercises"][0]["planned_sets"][0]["exception"]["note"] == "trimmed example"


def test_skip_authentication_and_ownership(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    client.cookies.clear()
    assert (
        client.post(f"/api/workouts/{workout['id']}/exercises/1/sets/1/skip", json={}).status_code
        == 401
    )
    assert (
        client.delete(f"/api/workouts/{workout['id']}/exercises/1/sets/1/skip").status_code == 401
    )
    assert (
        client.post(f"/api/workouts/{workout['id']}/exercises/1/skip", json={}).status_code == 401
    )
    assert client.delete(f"/api/workouts/{workout['id']}/exercises/1/skip").status_code == 401

    other_token, _ = _register(client, "other-owner@example.com")
    assert _skip_set(client, other_token, workout["id"], 1, 1).status_code == 404
    assert _undo_set_skip(client, other_token, workout["id"], 1, 1).status_code == 404
    assert _skip_exercise(client, other_token, workout["id"], 1).status_code == 404
    assert _undo_exercise_skip(client, other_token, workout["id"], 1).status_code == 404


def test_skip_invalid_path_and_body(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    _start_exercise(client, token, workout["id"], 1)

    assert (
        client.post(
            f"/api/workouts/{workout['id']}/exercises/1/sets/0/skip",
            json={},
            headers=_headers(token),
        ).status_code
        == 422
    )

    assert (
        client.post(
            f"/api/workouts/{workout['id']}/exercises/1/sets/1/skip",
            json={"reason_code": "invalid"},
            headers=_headers(token),
        ).status_code
        == 422
    )

    assert (
        client.post(
            f"/api/workouts/{workout['id']}/exercises/0/skip",
            json={},
            headers=_headers(token),
        ).status_code
        == 422
    )


# ────────────────── F15 migration tests ──────────────────


def test_f15_migration_fresh_and_upgrade(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f15_fresh.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")
    _run_alembic(database_url, "upgrade", "head")

    assert "f17_completion" in _run_alembic(database_url, "current").stdout

    engine = create_engine(database_url)
    schema = inspect(engine)
    assert "workout_exceptions" in schema.get_table_names()
    exc_checks = {c["name"] for c in schema.get_check_constraints("workout_exceptions")}
    assert "ck_workout_exceptions_scope" in exc_checks
    assert "ck_workout_exceptions_reason_code" in exc_checks
    assert "ck_workout_exceptions_scope_refs" in exc_checks

    event_checks = {c["name"] for c in schema.get_check_constraints("workout_events")}
    assert "ck_workout_events_event_type" in event_checks

    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()

    upgrade_db = f"sqlite:///{(tmp_path / 'f15_upgrade.db').as_posix()}"
    _run_alembic(upgrade_db, "upgrade", "f14_2_set_started")

    upgrade_engine = create_engine(upgrade_db, connect_args={"check_same_thread": False})
    with upgrade_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(9001, 'upgrade@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
    upgrade_engine.dispose()

    _run_alembic(upgrade_db, "upgrade", "head")

    upgrade_engine2 = create_engine(upgrade_db, connect_args={"check_same_thread": False})
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=upgrade_engine2)

    def override_get_session() -> Generator[Session, None, None]:
        s = session_factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(app) as migrated_client:
            token, _ = _register(migrated_client, "upgrade-user@example.com")
            _, day_id = _ready_plan_two_ex_two_sets(migrated_client, token)
            workout_id = _start(migrated_client, token, day_id).json()["id"]

            _start_exercise(migrated_client, token, workout_id, 1)

            r = _skip_set(migrated_client, token, workout_id, 1, 1)
            assert r.status_code == 200, r.text
            updated = r.json()
            assert updated["skipped_set_count"] == 1
            assert updated["exercises"][0]["planned_sets"][0]["exception"] is not None

            r2 = _undo_set_skip(migrated_client, token, workout_id, 1, 1)
            assert r2.status_code == 200, r2.text

            _complete(migrated_client, token, workout_id, 1, 1)
            _complete(migrated_client, token, workout_id, 1, 2)

            migrated_client.post(f"/api/workouts/{workout_id}/cancel", headers=_headers(token))
    finally:
        app.dependency_overrides.clear()
        upgrade_engine2.dispose()


def test_f15_1_upgrade_preserves_exceptions_and_accepts_pain_reason(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f15_1_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "f15_exceptions")

    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(9001, 'legacy-exception@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO workout_sessions "
                "(id, user_id, source_routine_id, source_training_day_id, routine_name, "
                "local_date, scheduled_week_position, scheduled_slot_was_rest, "
                "scheduled_training_day_id, scheduled_training_day_name, "
                "selected_training_day_id, selected_training_day_name, selected_week_position, "
                "selection_kind, status, started_at, cancelled_at) VALUES "
                "(9001, 9001, NULL, NULL, 'Legacy Plan', '2026-08-10', 1, 0, 1, 'Push', "
                "1, 'Push', 1, 'scheduled', 'in_progress', '2026-08-10 09:00:00', NULL)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO workout_exercises "
                "(id, workout_session_id, position, source_exercise_id, exercise_slug, "
                "exercise_name, target_type, rest_after_exercise_seconds, notes, instructions) "
                "VALUES (9001, 9001, 1, NULL, 'legacy-ex', 'Legacy Exercise', 'repetitions', "
                "NULL, NULL, NULL)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO workout_planned_sets "
                "(id, workout_exercise_id, position, target_value, target_weight_kg, target_rir, "
                "eccentric_seconds, stretched_pause_seconds, concentric_seconds, "
                "peak_contraction_seconds, rest_after_set_seconds, notes) VALUES "
                "(9001, 9001, 1, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO workout_exceptions "
                "(id, workout_session_id, workout_exercise_id, workout_planned_set_id, scope, "
                "reason_code, note, occurred_at) VALUES "
                "(9001, 9001, 9001, 9001, 'set', 'too_fatigued', 'Existing fact', "
                "'2026-08-10 09:05:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO workout_events "
                "(id, workout_session_id, sequence, event_type, workout_exercise_id, "
                "workout_planned_set_id, workout_exception_id, occurred_at) VALUES "
                "(9001, 9001, 1, 'workout_started', NULL, NULL, NULL, '2026-08-10 09:00:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO workout_events "
                "(id, workout_session_id, sequence, event_type, workout_exercise_id, "
                "workout_planned_set_id, workout_exception_id, occurred_at) VALUES "
                "(9002, 9001, 2, 'set_skipped', 9001, 9001, 9001, '2026-08-10 09:05:00')"
            )
        )
    engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    engine2 = create_engine(database_url, connect_args={"check_same_thread": False})
    with engine2.connect() as connection:
        note = connection.execute(
            text("SELECT note FROM workout_exceptions WHERE id = 9001")
        ).scalar_one()
        assert note == "Existing fact"
        event_type, exception_id = connection.execute(
            text("SELECT event_type, workout_exception_id FROM workout_events WHERE id = 9002")
        ).one()
        assert event_type == "set_skipped"
        assert exception_id == 9001
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []

    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine2)

    def override_get_session() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(app) as migrated_client:
            token, _ = _register(migrated_client, "f15-1-upgrade@example.com")
            _, day_id = _ready_plan_multi_sets(migrated_client, token, set_count=2)
            workout = _start(migrated_client, token, day_id).json()
            _start_exercise(migrated_client, token, workout["id"], 1)
            pain = _skip_exercise(
                migrated_client,
                token,
                workout["id"],
                1,
                reason_code="pain_or_discomfort",
            )
            assert pain.status_code == 200, pain.text
            assert pain.json()["exercises"][0]["exception"]["reason_code"] == "pain_or_discomfort"
    finally:
        app.dependency_overrides.clear()
        engine2.dispose()


# ────────────────── F17 completion helpers ──────────────────


def _complete_workout(client: TestClient, token: str, workout_id: int) -> Any:
    return client.post(f"/api/workouts/{workout_id}/complete", headers=_headers(token))


# ────────────────── F17 completion tests ──────────────────


def test_complete_all_performed_workout(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout = _start(client, token, day_id).json()
    workout_id = workout["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)

    response = _complete_workout(client, token, workout_id)
    assert response.status_code == 200, response.text
    completed = response.json()

    assert completed["status"] == "completed"
    assert completed["completed_at"] is not None
    assert completed["cancelled_at"] is None
    assert completed["duration_seconds"] is not None
    assert completed["duration_seconds"] >= 0
    assert isinstance(completed["duration_seconds"], int)

    assert completed["resume_url"] is None
    assert completed["current_exercise_position"] is None
    assert completed["current_set_position"] is None
    assert completed["current_set_phase"] is None
    assert completed["current_set_started_at"] is None
    assert completed["transition_to_exercise_position"] is None

    assert completed["completed_set_count"] == 1
    assert completed["skipped_set_count"] == 0
    assert completed["all_sets_resolved"] is True
    assert completed["all_sets_recorded"] is True

    events = completed["events"]
    assert events[-1]["event_type"] == "workout_completed"
    assert events[-1]["occurred_at"] == completed["completed_at"]
    assert events[-1]["exercise_position"] is None
    assert events[-1]["set_position"] is None
    assert events[-1]["exception"] is None

    assert client.get("/api/workouts/active", headers=_headers(token)).json() is None


def test_complete_mixed_performed_and_skipped(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    workout_id = workout["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    _skip_set(client, token, workout_id, 1, 2)

    response = _complete_workout(client, token, workout_id)
    assert response.status_code == 200, response.text
    completed = response.json()

    assert completed["status"] == "completed"
    assert completed["completed_set_count"] == 1
    assert completed["skipped_set_count"] == 1
    assert completed["total_set_count"] == 2
    assert completed["all_sets_resolved"] is True
    assert completed["all_sets_recorded"] is False

    exercise = completed["exercises"][0]
    assert exercise["execution_status"] == "partial"
    assert exercise["planned_sets"][0]["performance"] is not None
    assert exercise["planned_sets"][1]["exception"] is not None


def test_complete_all_skipped_workout(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_multi_sets(client, token, set_count=2)
    workout = _start(client, token, day_id).json()
    workout_id = workout["id"]

    _start_exercise(client, token, workout_id, 1)
    _skip_set(client, token, workout_id, 1, 1)
    _skip_set(client, token, workout_id, 1, 2)

    response = _complete_workout(client, token, workout_id)
    assert response.status_code == 200, response.text
    completed = response.json()

    assert completed["status"] == "completed"
    assert completed["completed_set_count"] == 0
    assert completed["skipped_set_count"] == 2
    assert completed["all_sets_resolved"] is True
    assert completed["all_sets_recorded"] is False
    assert completed["exercises"][0]["execution_status"] == "skipped"


def test_complete_unresolved_workout_rejected_atomically(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout = _start(client, token, day_id).json()
    workout_id = workout["id"]

    response = _complete_workout(client, token, workout_id)
    assert response.status_code == 409
    assert response.json()["detail"] == "Workout has unresolved sets"

    preserved = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert preserved["status"] == "in_progress"
    assert preserved["completed_at"] is None
    assert preserved["duration_seconds"] is None
    assert client.get("/api/workouts/active", headers=_headers(token)).json()["id"] == workout_id
    assert all(e["event_type"] != "workout_completed" for e in preserved["events"])


def test_complete_rejects_cancelled_and_repeated(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout = _start(client, token, day_id).json()
    workout_id = workout["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    assert _complete_workout(client, token, workout_id).status_code == 200

    repeated = _complete_workout(client, token, workout_id)
    assert repeated.status_code == 409
    assert repeated.json()["detail"] == "Workout is not active"

    cancelled = _start(client, token, day_id).json()
    assert cancelled["selection_kind"] == "scheduled"
    client.post(f"/api/workouts/{cancelled['id']}/cancel", headers=_headers(token))
    assert _complete_workout(client, token, cancelled["id"]).status_code == 409


def test_completed_workout_rejects_all_live_mutations(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan_two_exercises(client, token)
    workout = _start(client, token, day_id).json()
    workout_id = workout["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    _start_exercise(client, token, workout_id, 2)
    _complete(client, token, workout_id, 2, 1)
    assert _complete_workout(client, token, workout_id).status_code == 200

    start_resp = _start_exercise(client, token, workout_id, 2)
    assert start_resp.status_code == 409
    assert start_resp.json()["detail"] == "Workout is not active"

    assert _start_set(client, token, workout_id, 1, 1).status_code == 409
    assert _complete(client, token, workout_id, 1, 1).status_code == 409
    assert _skip_set(client, token, workout_id, 1, 1).status_code == 409
    assert _skip_exercise(client, token, workout_id, 1).status_code == 409
    assert _undo_set_skip(client, token, workout_id, 1, 1).status_code == 409
    assert (
        client.post(f"/api/workouts/{workout_id}/cancel", headers=_headers(token)).status_code
        == 409
    )

    completed = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert completed["status"] == "completed"
    assert completed["exercises"][0]["planned_sets"][0]["performance"] is not None


def test_completion_releases_active_and_allows_new_start(client: TestClient) -> None:
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token)
    workout = _start(client, token, day_id).json()
    workout_id = workout["id"]

    _start_exercise(client, token, workout_id, 1)
    _complete(client, token, workout_id, 1, 1)
    assert _complete_workout(client, token, workout_id).status_code == 200

    context = client.get(
        "/api/workouts/start-context?local_date=2026-08-10", headers=_headers(token)
    ).json()
    assert context["state"] == "scheduled_session"

    second = _start(client, token, day_id)
    assert second.status_code == 201, second.text
    assert second.json()["id"] != workout_id


def test_complete_ownership_authentication_and_path(client: TestClient) -> None:
    owner, _ = _register(client, "complete-owner@example.com")
    other, _ = _register(client, "complete-other@example.com")
    _, day_id = _ready_plan(client, owner)
    workout = _start(client, owner, day_id).json()
    workout_id = workout["id"]
    _start_exercise(client, owner, workout_id, 1)
    _complete(client, owner, workout_id, 1, 1)

    assert _complete_workout(client, other, workout_id).status_code == 404

    assert client.post("/api/workouts/0/complete", headers=_headers(owner)).status_code == 422
    assert client.post("/api/workouts/9999/complete", headers=_headers(owner)).status_code == 404

    client.cookies.clear()
    assert client.post("/api/workouts/1/complete").status_code == 401


# ────────────────── F17 migration validation ──────────────────


def test_f17_migration_fresh_and_upgrade(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f17_fresh.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")
    assert "f17_completion" in _run_alembic(database_url, "current").stdout
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    schema = inspect(engine)
    workout_columns = {c["name"] for c in schema.get_columns("workout_sessions")}
    assert "completed_at" in workout_columns
    workout_checks = {c["name"] for c in schema.get_check_constraints("workout_sessions")}
    assert "ck_workout_sessions_status" in workout_checks
    assert "ck_workout_sessions_status_timestamp" in workout_checks
    event_checks = {c["name"] for c in schema.get_check_constraints("workout_events")}
    assert "ck_workout_events_event_type" in event_checks
    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()

    upgrade_db = f"sqlite:///{(tmp_path / 'f17_upgrade.db').as_posix()}"
    _run_alembic(upgrade_db, "upgrade", "f15_1_pain_reason")

    upgrade_engine = create_engine(upgrade_db, connect_args={"check_same_thread": False})
    with upgrade_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(9001, 'legacy-complete@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO workout_sessions "
                "(id, user_id, source_routine_id, source_training_day_id, routine_name, "
                "local_date, scheduled_week_position, scheduled_slot_was_rest, "
                "scheduled_training_day_id, scheduled_training_day_name, "
                "selected_training_day_id, selected_training_day_name, selected_week_position, "
                "selection_kind, status, started_at, cancelled_at) VALUES "
                "(9001, 9001, NULL, NULL, 'Legacy Plan', '2026-08-10', 1, 0, 1, 'Push', "
                "1, 'Push', 1, 'scheduled', 'in_progress', '2026-08-10 09:00:00', NULL)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO workout_sessions "
                "(id, user_id, source_routine_id, source_training_day_id, routine_name, "
                "local_date, scheduled_week_position, scheduled_slot_was_rest, "
                "scheduled_training_day_id, scheduled_training_day_name, "
                "selected_training_day_id, selected_training_day_name, selected_week_position, "
                "selection_kind, status, started_at, cancelled_at) VALUES "
                "(9002, 9001, NULL, NULL, 'Legacy Plan', '2026-08-11', 2, 1, NULL, NULL, "
                "1, 'Push', 1, 'alternate', 'cancelled', '2026-08-11 09:00:00', "
                "'2026-08-11 09:20:00')"
            )
        )
        conn.execute(
            text("INSERT INTO active_workouts (user_id, workout_session_id) VALUES (9001, 9001)")
        )
        conn.execute(
            text(
                "INSERT INTO workout_events "
                "(id, workout_session_id, sequence, event_type, workout_exercise_id, "
                "workout_planned_set_id, workout_exception_id, occurred_at) VALUES "
                "(9001, 9001, 1, 'workout_started', NULL, NULL, NULL, '2026-08-10 09:00:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO workout_events "
                "(id, workout_session_id, sequence, event_type, workout_exercise_id, "
                "workout_planned_set_id, workout_exception_id, occurred_at) VALUES "
                "(9002, 9002, 1, 'workout_started', NULL, NULL, NULL, '2026-08-11 09:00:00')"
            )
        )
    upgrade_engine.dispose()

    _run_alembic(upgrade_db, "upgrade", "head")

    upgrade_engine2 = create_engine(upgrade_db, connect_args={"check_same_thread": False})
    with upgrade_engine2.connect() as conn:
        rows = conn.execute(
            text("SELECT id, status, cancelled_at, completed_at FROM workout_sessions ORDER BY id")
        ).fetchall()
        assert len(rows) == 2
        by_id = {row[0]: row for row in rows}
        assert by_id[9001][1] == "in_progress"
        assert by_id[9001][2] is None
        assert by_id[9001][3] is None
        assert by_id[9002][1] == "cancelled"
        assert by_id[9002][2] is not None
        assert by_id[9002][3] is None
        active = conn.execute(
            text("SELECT workout_session_id FROM active_workouts WHERE user_id = 9001")
        ).scalar_one()
        assert active == 9001
        event_count = conn.execute(text("SELECT COUNT(*) FROM workout_events")).scalar_one()
        assert event_count == 2

    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=upgrade_engine2)

    def override_get_session() -> Generator[Session, None, None]:
        s = session_factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(app) as migrated_client:
            token, _ = _register(migrated_client, "migration-f17@example.com")
            _, day_id = _ready_plan(migrated_client, token, "Migrated Completion Plan")
            workout_id = _start(migrated_client, token, day_id).json()["id"]
            _start_exercise(migrated_client, token, workout_id, 1)
            _complete(migrated_client, token, workout_id, 1, 1)
            completed = _complete_workout(migrated_client, token, workout_id)
            assert completed.status_code == 200, completed.text
            assert completed.json()["status"] == "completed"
            assert completed.json()["duration_seconds"] is not None
    finally:
        app.dependency_overrides.clear()
        upgrade_engine2.dispose()
