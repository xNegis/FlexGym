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
F14_2_REVISION = "f14_2_set_started"
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


def _start_exercise(
    client: TestClient, token: str, workout_id: int, ex_pos: int
) -> Any:
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
    assert F14_2_REVISION in _run_alembic(database_url, "current").stdout

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
        client, token, workout_id, 1, 1,
        entry_mode="adjusted", value=8, weight=40.0, rir=1,
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
        client, token, workout_id, 1, 1,
        entry_mode="adjusted", value=12, weight=45.0, rir=1,
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
        client, token, workout_id, 1, 1,
        entry_mode="adjusted", value=5, weight=30.0, rir=0,
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
        client, token, workout_id, 99, 1,
        entry_mode="adjusted", value=5, weight=None, rir=None,
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
        client, other, workout_id, 1, 1,
        entry_mode="adjusted", value=5, weight=None, rir=None,
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
    assert F14_2_REVISION in _run_alembic(database_url, "current").stdout
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    schema = inspect(engine)
    event_checks = {c["name"] for c in schema.get_check_constraints("workout_events")}
    assert "ck_workout_events_event_type" in event_checks
    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()
