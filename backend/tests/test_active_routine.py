"""Tests for F11 Active Routine."""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Generator
from pathlib import Path
from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_session
from app.main import app

BACKEND_ROOT = Path(__file__).resolve().parents[1]
F11_REVISION = "f15_exceptions"
PREVIOUS_REVISION = "c31f5a8d2e04"


def _register(client: TestClient, email: str = "ar@example.com") -> tuple[str, int]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-secure-password-15"},
    )
    assert response.status_code == 201
    token = response.cookies.get("flexgym_token")
    assert token is not None
    return token, response.json()["id"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Cookie": f"flexgym_token={token}"}


def _create_routine(
    client: TestClient,
    token: str,
    name: str = "Test Routine",
    objective: str = "build_muscle",
) -> dict[str, Any]:
    response = client.post(
        "/api/routines",
        json={"name": name, "objective": objective},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _create_day(
    client: TestClient,
    token: str,
    routine_id: int,
    name: str = "Push",
) -> dict[str, Any]:
    response = client.post(
        f"/api/routines/{routine_id}/days",
        json={"name": name},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _get_active(client: TestClient, token: str) -> Any:
    response = client.get("/api/active-routine", headers=_auth_headers(token))
    assert response.status_code == 200
    return response.json()


def _activate(client: TestClient, token: str, routine_id: int) -> dict[str, Any]:
    response = client.put(
        "/api/active-routine",
        json={"routine_id": routine_id},
        headers=_auth_headers(token),
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


def _activate_expect(
    client: TestClient, token: str, routine_id: int, expected_status: int
) -> dict[str, Any]:
    response = client.put(
        "/api/active-routine",
        json={"routine_id": routine_id},
        headers=_auth_headers(token),
    )
    assert response.status_code == expected_status, response.text
    return cast(dict[str, Any], response.json())


def _deactivate(client: TestClient, token: str) -> None:
    response = client.delete("/api/active-routine", headers=_auth_headers(token))
    assert response.status_code == 204


# -- No active state ---------------------------------------------------------


def test_no_active_routine_returns_null(client: TestClient) -> None:
    token, _ = _register(client)
    assert _get_active(client, token) is None


# -- First activation --------------------------------------------------------


def test_first_activation_and_lookup(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "My Plan")
    _create_day(client, token, routine["id"], "Push")

    result = _activate(client, token, routine["id"])
    assert result["routine"]["id"] == routine["id"]
    assert result["routine"]["name"] == "My Plan"
    assert result["routine"]["is_active"] is True
    assert isinstance(result["activated_at"], str)

    active = _get_active(client, token)
    assert active["routine"]["id"] == routine["id"]
    assert active["routine"]["is_active"] is True


# -- is_active in list and detail --------------------------------------------


def test_is_active_in_list_and_detail(client: TestClient) -> None:
    token, _ = _register(client)
    r1 = _create_routine(client, token, "Active One")
    r2 = _create_routine(client, token, "Inactive")
    _create_day(client, token, r1["id"], "Push")
    _create_day(client, token, r2["id"], "Pull")

    _activate(client, token, r1["id"])

    routines = client.get("/api/routines", headers=_auth_headers(token)).json()
    a1 = next(r for r in routines if r["id"] == r1["id"])
    a2 = next(r for r in routines if r["id"] == r2["id"])
    assert a1["is_active"] is True
    assert a2["is_active"] is False

    detail = client.get(f"/api/routines/{r1['id']}", headers=_auth_headers(token)).json()
    assert detail["is_active"] is True

    detail2 = client.get(f"/api/routines/{r2['id']}", headers=_auth_headers(token)).json()
    assert detail2["is_active"] is False


def test_create_returns_is_active_false(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "New Routine")
    assert routine["is_active"] is False


# -- Activation does not change plan timestamps ------------------------------


def test_activation_preserves_plan_timestamps(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    _create_day(client, token, routine["id"], "Push")

    before = client.get(f"/api/routines/{routine['id']}", headers=_auth_headers(token)).json()

    _activate(client, token, routine["id"])

    after = client.get(f"/api/routines/{routine['id']}", headers=_auth_headers(token)).json()
    assert after["created_at"] == before["created_at"]
    assert after["updated_at"] == before["updated_at"]


# -- Idempotent reactivation -------------------------------------------------


def test_idempotent_reactivation_preserves_timestamp(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    _create_day(client, token, routine["id"], "Push")

    first = _activate(client, token, routine["id"])
    second = _activate(client, token, routine["id"])

    assert second["routine"]["id"] == routine["id"]
    assert second["activated_at"] == first["activated_at"]


# -- Deactivation ------------------------------------------------------------


def test_deactivation_and_null_lookup(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    _create_day(client, token, routine["id"], "Push")

    _activate(client, token, routine["id"])
    _deactivate(client, token)
    assert _get_active(client, token) is None


def test_deactivation_idempotent(client: TestClient) -> None:
    token, _ = _register(client)
    _deactivate(client, token)
    _deactivate(client, token)
    assert _get_active(client, token) is None


# -- Switching ---------------------------------------------------------------


def test_switch_changes_active_and_timestamp(client: TestClient) -> None:
    token, _ = _register(client)
    r1 = _create_routine(client, token, "First Plan")
    r2 = _create_routine(client, token, "Second Plan")
    _create_day(client, token, r1["id"], "A")
    _create_day(client, token, r2["id"], "B")

    first = _activate(client, token, r1["id"])
    switch = _activate(client, token, r2["id"])

    assert switch["routine"]["id"] == r2["id"]
    assert switch["routine"]["is_active"] is True
    assert switch["activated_at"] != first["activated_at"]

    routines = client.get("/api/routines", headers=_auth_headers(token)).json()
    a1 = next(r for r in routines if r["id"] == r1["id"])
    a2 = next(r for r in routines if r["id"] == r2["id"])
    assert a1["is_active"] is False
    assert a2["is_active"] is True


def test_failed_activation_preserves_previous_selection(client: TestClient) -> None:
    token, _ = _register(client)
    r1 = _create_routine(client, token, "Active")
    r2 = _create_routine(client, token, "Empty")  # no training days
    _create_day(client, token, r1["id"], "Push")

    first = _activate(client, token, r1["id"])
    _activate_expect(client, token, r2["id"], 409)

    routines = client.get("/api/routines", headers=_auth_headers(token)).json()
    a1 = next(r for r in routines if r["id"] == r1["id"])
    assert a1["is_active"] is True

    active = _get_active(client, token)
    assert active["routine"]["id"] == r1["id"]
    assert active["activated_at"] == first["activated_at"]


# -- Empty routine rejection -------------------------------------------------


def test_empty_routine_cannot_activate(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Empty")

    _activate_expect(client, token, routine["id"], 409)
    assert _get_active(client, token) is None


def test_routine_with_exercise_free_day_can_activate(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    _create_day(client, token, routine["id"], "Push")

    result = _activate(client, token, routine["id"])
    assert result["routine"]["id"] == routine["id"]


# -- Ownership isolation -----------------------------------------------------


def test_ownership_isolation(client: TestClient) -> None:
    token1, _ = _register(client, "user1@example.com")
    token2, _ = _register(client, "user2@example.com")

    r1 = _create_routine(client, token1, "User1 Routine")
    r2 = _create_routine(client, token2, "User2 Routine")
    _create_day(client, token1, r1["id"], "A")
    _create_day(client, token2, r2["id"], "B")

    _activate(client, token1, r1["id"])
    _activate(client, token2, r2["id"])

    assert _get_active(client, token1)["routine"]["id"] == r1["id"]
    assert _get_active(client, token2)["routine"]["id"] == r2["id"]


def test_other_user_routine_not_found_for_activation(client: TestClient) -> None:
    token1, _ = _register(client, "owner1@example.com")
    token2, _ = _register(client, "owner2@example.com")

    r1 = _create_routine(client, token1, "Owner1 Routine")
    _create_day(client, token1, r1["id"], "Push")

    response = client.put(
        "/api/active-routine",
        json={"routine_id": r1["id"]},
        headers=_auth_headers(token2),
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}

    response = client.put(
        "/api/active-routine",
        json={"routine_id": 99999},
        headers=_auth_headers(token1),
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


# -- Deletion effects --------------------------------------------------------


def test_deleting_active_routine_clears_selection(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Active")
    _create_day(client, token, routine["id"], "Push")

    _activate(client, token, routine["id"])
    client.delete(f"/api/routines/{routine['id']}", headers=_auth_headers(token))
    assert _get_active(client, token) is None


def test_deleting_inactive_routine_preserves_selection(client: TestClient) -> None:
    token, _ = _register(client)
    r1 = _create_routine(client, token, "Active")
    r2 = _create_routine(client, token, "Inactive")
    _create_day(client, token, r1["id"], "Push")
    _create_day(client, token, r2["id"], "Pull")

    _activate(client, token, r1["id"])
    client.delete(f"/api/routines/{r2['id']}", headers=_auth_headers(token))

    active = _get_active(client, token)
    assert active["routine"]["id"] == r1["id"]


def test_deleting_final_training_day_clears_active(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    day = _create_day(client, token, routine["id"], "Only Day")

    _activate(client, token, routine["id"])
    client.delete(
        f"/api/routines/{routine['id']}/days/{day['id']}",
        headers=_auth_headers(token),
    )
    assert _get_active(client, token) is None


def test_deleting_non_final_day_preserves_active(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    d1 = _create_day(client, token, routine["id"], "Day 1")
    _create_day(client, token, routine["id"], "Day 2")

    _activate(client, token, routine["id"])
    client.delete(
        f"/api/routines/{routine['id']}/days/{d1['id']}",
        headers=_auth_headers(token),
    )

    active = _get_active(client, token)
    assert active["routine"]["id"] == routine["id"]


# -- Profile deletion preserves active selection -----------------------------


def test_deleting_profile_preserves_active_selection(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    _create_day(client, token, routine["id"], "Push")

    _activate(client, token, routine["id"])

    client.post(
        "/api/fitness-profile",
        json={
            "date_of_birth": "1990-01-01",
            "biological_sex": "male",
            "height_cm": 180.0,
            "weight_kg": 80.0,
            "training_experience": "intermediate",
            "primary_goal": "build_muscle",
            "training_days_per_week": 4,
            "preferred_workout_duration_minutes": 60,
            "training_environment": "commercial_gym",
        },
        headers=_auth_headers(token),
    )
    client.delete("/api/fitness-profile", headers=_auth_headers(token))
    client.post(
        "/api/fitness-profile",
        json={
            "date_of_birth": "1990-01-01",
            "biological_sex": "male",
            "height_cm": 180.0,
            "weight_kg": 80.0,
            "training_experience": "intermediate",
            "primary_goal": "build_muscle",
            "training_days_per_week": 4,
            "preferred_workout_duration_minutes": 60,
            "training_environment": "commercial_gym",
        },
        headers=_auth_headers(token),
    )

    active = _get_active(client, token)
    assert active["routine"]["id"] == routine["id"]


# -- User deletion cascades active selection --------------------------------


def test_user_deletion_removes_active_selection(client: TestClient, test_engine: Any) -> None:
    token, user_id = _register(client, "cascade@example.com")
    routine = _create_routine(client, token, "Plan")
    _create_day(client, token, routine["id"], "Push")

    _activate(client, token, routine["id"])

    assert _get_active(client, token) is not None

    with test_engine.begin() as connection:
        connection.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": user_id})

    token2, _ = _register(client, "other@example.com")
    assert _get_active(client, token2) is None


# -- Unauthenticated ---------------------------------------------------------


def test_active_routine_endpoints_require_auth(client: TestClient) -> None:
    assert client.get("/api/active-routine").status_code == 401
    assert (
        client.put(
            "/api/active-routine",
            json={"routine_id": 1},
        ).status_code
        == 401
    )
    assert client.delete("/api/active-routine").status_code == 401


# -- Invalid request ---------------------------------------------------------


def test_invalid_activation_preserves_selection_and_timestamps(
    client: TestClient,
) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    _create_day(client, token, routine["id"], "Push")

    _activate(client, token, routine["id"])

    response = client.put(
        "/api/active-routine",
        json={"routine_id": 0},
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    boolean_response = client.put(
        "/api/active-routine",
        json={"routine_id": True},
        headers=_auth_headers(token),
    )
    assert boolean_response.status_code == 422

    active = _get_active(client, token)
    assert active["routine"]["id"] == routine["id"]


# -- Active routine is editable ----------------------------------------------


def test_active_routine_remains_editable(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Original")
    _create_day(client, token, routine["id"], "Push")

    _activate(client, token, routine["id"])

    response = client.put(
        f"/api/routines/{routine['id']}",
        json={
            "name": "Updated",
            "objective": "general_fitness",
            "description": None,
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated"
    assert response.json()["is_active"] is True


def test_active_routine_can_add_empty_training_day(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    _create_day(client, token, routine["id"], "Push")

    _activate(client, token, routine["id"])

    result = _create_day(client, token, routine["id"], "Pull")
    assert "detail" not in result

    active = _get_active(client, token)
    assert active["routine"]["id"] == routine["id"]


# -- Reactivation after deactivation sets new timestamp ----------------------


def test_reactivation_after_deactivation_sets_new_timestamp(
    client: TestClient,
) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token, "Plan")
    _create_day(client, token, routine["id"], "Push")

    first = _activate(client, token, routine["id"])
    _deactivate(client, token)
    second = _activate(client, token, routine["id"])

    assert second["activated_at"] != first["activated_at"]


# -- Migration validation ----------------------------------------------------


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


def test_f11_migration_fresh_database(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f11_fresh.db').as_posix()}"

    _run_alembic(database_url, "upgrade", "head")
    current = _run_alembic(database_url, "current").stdout
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    schema = inspect(engine)

    assert "active_routines" in schema.get_table_names()

    columns = {column["name"] for column in schema.get_columns("active_routines")}
    assert {"id", "user_id", "routine_id", "activated_at"} == columns

    unique_constraints = schema.get_unique_constraints("active_routines")
    constraint_names = {uc["name"] for uc in unique_constraints}
    assert "uq_active_routine_user" in constraint_names
    assert "uq_active_routine_routine" in constraint_names

    foreign_keys = schema.get_foreign_keys("active_routines")
    fk_names = {fk["name"] for fk in foreign_keys}
    assert "fk_active_routine_user" in fk_names
    assert "fk_active_routine_routine" in fk_names
    assert "fk_active_routine_routine_user" in fk_names

    fk_user = next(fk for fk in foreign_keys if fk["name"] == "fk_active_routine_user")
    assert fk_user["referred_table"] == "users"
    assert fk_user["options"].get("ondelete") == "CASCADE"

    fk_routine = next(fk for fk in foreign_keys if fk["name"] == "fk_active_routine_routine")
    assert fk_routine["referred_table"] == "routines"
    assert fk_routine["options"].get("ondelete") == "CASCADE"

    fk_composite = next(fk for fk in foreign_keys if fk["name"] == "fk_active_routine_routine_user")
    assert fk_composite["constrained_columns"] == ["routine_id", "user_id"]
    assert fk_composite["referred_columns"] == ["id", "user_id"]

    routine_unique = schema.get_unique_constraints("routines")
    routine_constraint_names = {uc["name"] for uc in routine_unique}
    assert "uq_routine_id_user_id" in routine_constraint_names

    assert F11_REVISION in current
    engine.dispose()


def test_f11_migration_upgrade_from_previous_head(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f11_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    engine = create_engine(database_url)
    with engine.begin() as connection:
        exercise_id = connection.execute(
            text("SELECT id FROM exercises ORDER BY id LIMIT 1")
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(1001, 'existing-one@example.com', 'hash', CURRENT_TIMESTAMP), "
                "(1002, 'existing-two@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO routines "
                "(id, user_id, name, normalized_name, objective, description, "
                "created_at, updated_at) "
                "VALUES "
                "(2001, 1001, 'Existing One', 'existing one', 'build_muscle', 'kept', "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), "
                "(2002, 1002, 'Existing Two', 'existing two', 'general_fitness', NULL, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO training_days (id, routine_id, name, created_at, updated_at) VALUES "
                "(3001, 2001, 'Push', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), "
                "(3002, 2002, 'Full Body', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO routine_schedule_assignments "
                "(id, routine_id, training_day_id, week_position) VALUES "
                "(4001, 2001, 3001, 1), (4002, 2002, 3002, 3)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO exercise_configurations "
                "(id, training_day_id, exercise_id, position, target_type, "
                "rest_after_exercise_seconds, notes, created_at, updated_at) VALUES "
                "(5001, 3001, :exercise_id, 1, 'repetitions', 90, 'keep me', "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"exercise_id": exercise_id},
        )
        connection.execute(
            text(
                "INSERT INTO configured_sets "
                "(id, exercise_configuration_id, position, target_value, target_weight_kg, "
                "target_rir, rest_after_set_seconds, notes) VALUES "
                "(6001, 5001, 1, 12, 42.5, 2, 120, 'working set')"
            )
        )

        before = {
            "users": connection.execute(
                text("SELECT id, email FROM users WHERE id IN (1001, 1002) ORDER BY id")
            ).all(),
            "routines": connection.execute(
                text(
                    "SELECT id, user_id, name, objective, description FROM routines "
                    "WHERE id IN (2001, 2002) ORDER BY id"
                )
            ).all(),
            "days": connection.execute(
                text(
                    "SELECT id, routine_id, name FROM training_days "
                    "WHERE id IN (3001, 3002) ORDER BY id"
                )
            ).all(),
            "schedule": connection.execute(
                text(
                    "SELECT id, routine_id, training_day_id, week_position "
                    "FROM routine_schedule_assignments WHERE id IN (4001, 4002) ORDER BY id"
                )
            ).all(),
            "config": connection.execute(
                text(
                    "SELECT id, training_day_id, exercise_id, position, target_type, notes "
                    "FROM exercise_configurations WHERE id = 5001"
                )
            ).all(),
            "sets": connection.execute(
                text(
                    "SELECT id, exercise_configuration_id, position, target_value, "
                    "target_weight_kg, target_rir, rest_after_set_seconds, notes "
                    "FROM configured_sets WHERE id = 6001"
                )
            ).all(),
        }
    engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    assert F11_REVISION in _run_alembic(database_url, "current").stdout

    upgraded_engine = create_engine(database_url)
    with upgraded_engine.connect() as connection:
        after = {
            "users": connection.execute(
                text("SELECT id, email FROM users WHERE id IN (1001, 1002) ORDER BY id")
            ).all(),
            "routines": connection.execute(
                text(
                    "SELECT id, user_id, name, objective, description FROM routines "
                    "WHERE id IN (2001, 2002) ORDER BY id"
                )
            ).all(),
            "days": connection.execute(
                text(
                    "SELECT id, routine_id, name FROM training_days "
                    "WHERE id IN (3001, 3002) ORDER BY id"
                )
            ).all(),
            "schedule": connection.execute(
                text(
                    "SELECT id, routine_id, training_day_id, week_position "
                    "FROM routine_schedule_assignments WHERE id IN (4001, 4002) ORDER BY id"
                )
            ).all(),
            "config": connection.execute(
                text(
                    "SELECT id, training_day_id, exercise_id, position, target_type, notes "
                    "FROM exercise_configurations WHERE id = 5001"
                )
            ).all(),
            "sets": connection.execute(
                text(
                    "SELECT id, exercise_configuration_id, position, target_value, "
                    "target_weight_kg, target_rir, rest_after_set_seconds, notes "
                    "FROM configured_sets WHERE id = 6001"
                )
            ).all(),
        }
        active_count = connection.execute(text("SELECT COUNT(*) FROM active_routines")).scalar_one()

    assert after == before
    assert active_count == 0
    upgraded_engine.dispose()


def test_f11_migration_with_real_api_flow(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f11_api_flow.db').as_posix()}"

    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    previous_engine = create_engine(database_url)
    assert "active_routines" not in inspect(previous_engine).get_table_names()
    previous_engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    assert "active_routines" in inspect(engine).get_table_names()

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
            token, _ = _register(migrated_client, "migration-f11@example.com")
            routine = _create_routine(migrated_client, token, "Migrated")
            _create_day(migrated_client, token, routine["id"], "Day 1")

            result = _activate(migrated_client, token, routine["id"])
            assert result["routine"]["id"] == routine["id"]
            assert result["routine"]["is_active"] is True

            active = _get_active(migrated_client, token)
            assert active is not None

            _deactivate(migrated_client, token)
            assert _get_active(migrated_client, token) is None

            _activate(migrated_client, token, routine["id"])
            migrated_client.delete(
                f"/api/routines/{routine['id']}",
                headers=_auth_headers(token),
            )
            assert _get_active(migrated_client, token) is None
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_f11_migration_no_automatic_activation(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f11_noauto.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    pre_engine = create_engine(database_url)
    with pre_engine.begin() as connection:
        user_id = connection.execute(
            text(
                "INSERT INTO users (email, password_hash, created_at) "
                "VALUES ('existing@example.com', 'x', CURRENT_TIMESTAMP)"
            )
        ).lastrowid
        connection.execute(
            text(
                "INSERT INTO routines "
                "(user_id, name, normalized_name, objective, created_at, updated_at) "
                "VALUES (:uid, 'Existing', 'existing', 'build_muscle', "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"uid": user_id},
        )
    pre_engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    post_engine = create_engine(database_url)
    with post_engine.connect() as connection:
        count = connection.execute(text("SELECT COUNT(*) FROM active_routines")).scalar_one()
    assert count == 0
    post_engine.dispose()


def test_f11_migration_downgrade(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f11_downgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")
    _run_alembic(database_url, "downgrade", PREVIOUS_REVISION)

    engine = create_engine(database_url)
    schema = inspect(engine)
    assert "active_routines" not in schema.get_table_names()

    routine_constraints = schema.get_unique_constraints("routines")
    assert "uq_routine_id_user_id" not in {uc["name"] for uc in routine_constraints}
    engine.dispose()
