"""Tests for F13 Start Workout."""

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
    }

    active = client.get("/api/workouts/active", headers=_headers(token))
    assert active.status_code == 200
    assert active.json() == workout
    direct = client.get(f"/api/workouts/{workout['id']}", headers=_headers(token))
    assert direct.status_code == 200
    assert direct.json() == workout


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
    assert F13_REVISION in _run_alembic(database_url, "current").stdout

    engine = create_engine(database_url)
    schema = inspect(engine)
    assert {
        "workout_sessions",
        "workout_exercises",
        "workout_planned_sets",
        "active_workouts",
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
