"""Tests for F10 Routine Schedule."""

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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_session
from app.main import app

BACKEND_ROOT = Path(__file__).resolve().parents[1]
F10_INITIAL_REVISION = "aab110d57981"
F10_REVISION = "5f6392b90798"
PREVIOUS_REVISION = "273789964714"

WEEKDAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def _register(client: TestClient, email: str = "schedule@example.com") -> tuple[str, int]:
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
) -> dict[str, Any]:
    response = client.post(
        "/api/routines",
        json={"name": name, "objective": "build_muscle"},
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


def _get_schedule(client: TestClient, token: str, routine_id: int) -> list[dict[str, Any]]:
    response = client.get(
        f"/api/routines/{routine_id}/schedule",
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    return cast(list[dict[str, Any]], response.json())


def _move_day(
    client: TestClient,
    token: str,
    routine_id: int,
    training_day_id: int,
    week_position: int,
) -> list[dict[str, Any]]:
    response = client.put(
        f"/api/routines/{routine_id}/schedule",
        json={"training_day_id": training_day_id, "week_position": week_position},
        headers=_auth_headers(token),
    )
    assert response.status_code == 200, response.text
    return cast(list[dict[str, Any]], response.json())


# -- Empty schedule ---------------------------------------------------------


def test_empty_schedule_returns_seven_rest_slots(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    schedule = _get_schedule(client, token, routine["id"])
    assert len(schedule) == 7
    for i, slot in enumerate(schedule):
        assert slot["position"] == i + 1
        assert slot["weekday"] == WEEKDAY_NAMES[i]
        assert slot["type"] == "rest"
        assert "training_day" not in slot


# -- Creation assigns first free position -----------------------------------


def test_successive_creations_fill_monday_to_sunday(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    d1 = _create_day(client, token, routine["id"], "Push")
    d2 = _create_day(client, token, routine["id"], "Pull")

    assert d1["week_position"] == 1
    assert d2["week_position"] == 2

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "training"
    assert schedule[0]["training_day"]["name"] == "Push"
    assert schedule[1]["type"] == "training"
    assert schedule[1]["training_day"]["name"] == "Pull"
    for i in range(2, 7):
        assert schedule[i]["type"] == "rest"


def test_deletion_frees_position_for_reuse(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    _create_day(client, token, routine["id"], "Push")
    _create_day(client, token, routine["id"], "Pull")
    _create_day(client, token, routine["id"], "Legs")

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "training"
    assert schedule[0]["training_day"]["name"] == "Push"

    client.delete(
        f"/api/routines/{routine['id']}/days/{schedule[0]['training_day']['id']}",
        headers=_auth_headers(token),
    )

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "rest"

    d4 = _create_day(client, token, routine["id"], "New")
    assert d4["week_position"] == 1

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "training"
    assert schedule[0]["training_day"]["name"] == "New"


# -- Schedule response shapes -----------------------------------------------


def test_training_slot_contains_training_day(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    _create_day(client, token, routine["id"], "Push")

    schedule = _get_schedule(client, token, routine["id"])
    training = [s for s in schedule if s["type"] == "training"]
    assert len(training) == 1
    td = training[0]["training_day"]
    assert td["name"] == "Push"
    assert td["week_position"] == 1
    assert td["exercise_count"] == 0
    assert isinstance(td["id"], int)
    assert isinstance(td["created_at"], str)
    assert isinstance(td["updated_at"], str)

    rest = [s for s in schedule if s["type"] == "rest"]
    assert len(rest) == 6
    for slot in rest:
        assert "training_day" not in slot


# -- Move to rest ------------------------------------------------------------


def test_move_to_rest_preserves_day(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"], "Push")

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["training_day"]["id"] == day["id"]

    _move_day(client, token, routine["id"], day["id"], 4)

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "rest"
    assert schedule[3]["type"] == "training"
    assert schedule[3]["training_day"]["name"] == "Push"
    assert schedule[3]["training_day"]["id"] == day["id"]


# -- Swap --------------------------------------------------------------------


def test_move_to_occupied_swaps(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    d1 = _create_day(client, token, routine["id"], "Push")
    d2 = _create_day(client, token, routine["id"], "Pull")

    _move_day(client, token, routine["id"], d1["id"], 2)

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "training"
    assert schedule[0]["training_day"]["name"] == "Pull"
    assert schedule[0]["training_day"]["id"] == d2["id"]
    assert schedule[1]["type"] == "training"
    assert schedule[1]["training_day"]["name"] == "Push"
    assert schedule[1]["training_day"]["id"] == d1["id"]


def test_noop_move_succeeds(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"], "Push")

    schedule = _move_day(client, token, routine["id"], day["id"], 1)
    assert schedule[0]["type"] == "training"
    assert schedule[0]["training_day"]["name"] == "Push"


# -- Invalid moves -----------------------------------------------------------


def test_invalid_move_preserves_state(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"], "Push")

    response = client.put(
        f"/api/routines/{routine['id']}/schedule",
        json={"training_day_id": day["id"], "week_position": 0},
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    response = client.put(
        f"/api/routines/{routine['id']}/schedule",
        json={"training_day_id": day["id"], "week_position": 8},
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "training"
    assert schedule[0]["training_day"]["name"] == "Push"


def test_foreign_day_not_found(client: TestClient) -> None:
    token, _ = _register(client)
    routine1 = _create_routine(client, token, "R1")
    routine2 = _create_routine(client, token, "R2")
    day = _create_day(client, token, routine1["id"], "Push")

    response = client.put(
        f"/api/routines/{routine2['id']}/schedule",
        json={"training_day_id": day["id"], "week_position": 1},
        headers=_auth_headers(token),
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Training day not found"}


# -- Ownership isolation ----------------------------------------------------


def test_other_user_schedule_not_found(client: TestClient) -> None:
    token1, _ = _register(client, "a@example.com")
    token2, _ = _register(client, "b@example.com")
    routine2 = _create_routine(client, token2, "R2")

    response = client.get(
        f"/api/routines/{routine2['id']}/schedule",
        headers=_auth_headers(token1),
    )
    assert response.status_code == 404


# -- Cascade behaviour -------------------------------------------------------


def test_day_deletion_removes_assignment(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"], "Push")

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "training"

    client.delete(
        f"/api/routines/{routine['id']}/days/{day['id']}",
        headers=_auth_headers(token),
    )

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "rest"


def test_routine_deletion_cascades_schedule(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    _create_day(client, token, routine["id"], "Push")

    client.delete(f"/api/routines/{routine['id']}", headers=_auth_headers(token))

    response = client.get(
        f"/api/routines/{routine['id']}/schedule",
        headers=_auth_headers(token),
    )
    assert response.status_code == 404


# -- Seven-day limit atomically ----------------------------------------------


def test_seven_day_limit_atomic(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    for i in range(7):
        _create_day(client, token, routine["id"], f"Day {i + 1}")

    response = client.post(
        f"/api/routines/{routine['id']}/days",
        json={"name": "Day 8"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 409

    schedule = _get_schedule(client, token, routine["id"])
    training_count = sum(1 for s in schedule if s["type"] == "training")
    assert training_count == 7


# -- Unauthenticated ---------------------------------------------------------


def test_schedule_endpoints_require_auth(client: TestClient) -> None:
    assert client.get("/api/routines/1/schedule").status_code == 401
    assert (
        client.put(
            "/api/routines/1/schedule",
            json={"training_day_id": 1, "week_position": 1},
        ).status_code
        == 401
    )


# -- Timestamps --------------------------------------------------------------


def test_move_refreshes_timestamps(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"], "Push")

    original_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()

    _move_day(client, token, routine["id"], day["id"], 4)

    updated_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()
    assert updated_routine["updated_at"] != original_routine["updated_at"]


def test_swap_refreshes_both_days_timestamp(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    d1 = _create_day(client, token, routine["id"], "Push")
    d2 = _create_day(client, token, routine["id"], "Pull")

    _move_day(client, token, routine["id"], d1["id"], 2)

    schedule = _get_schedule(client, token, routine["id"])
    td2 = schedule[0]["training_day"]
    td1 = schedule[1]["training_day"]
    assert td1["updated_at"] != d1["updated_at"]
    assert td2["updated_at"] != d2["updated_at"]


# -- Rename preserves placement ----------------------------------------------


def test_rename_preserves_placement(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"], "Push")

    client.put(
        f"/api/routines/{routine['id']}/days/{day['id']}",
        json={"name": "Upper body"},
        headers=_auth_headers(token),
    )

    schedule = _get_schedule(client, token, routine["id"])
    assert schedule[0]["type"] == "training"
    assert schedule[0]["training_day"]["name"] == "Upper body"


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


def test_f10_migration_fresh_database(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f10_fresh.db').as_posix()}"

    _run_alembic(database_url, "upgrade", "head")
    current = _run_alembic(database_url, "current").stdout
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    schema = inspect(engine)

    assert "routine_schedule_assignments" in schema.get_table_names()

    assert "training_days" in schema.get_table_names()
    columns = {column["name"] for column in schema.get_columns("training_days")}
    assert "position" not in columns
    assert {"id", "routine_id", "name", "created_at", "updated_at"} == columns

    unique_constraints = schema.get_unique_constraints("routine_schedule_assignments")
    constraint_names = {uc["name"] for uc in unique_constraints}
    assert "uq_schedule_assignment_routine_pos" in constraint_names

    check_constraints = schema.get_check_constraints("routine_schedule_assignments")
    assert {constraint["name"] for constraint in check_constraints} >= {
        "ck_schedule_assignment_week_position"
    }

    foreign_keys = schema.get_foreign_keys("routine_schedule_assignments")
    fk_tables = {fk["referred_table"] for fk in foreign_keys}
    assert "routines" in fk_tables
    assert "training_days" in fk_tables

    fk_routines = next(fk for fk in foreign_keys if fk["referred_table"] == "routines")
    assert fk_routines["options"].get("ondelete") == "CASCADE"
    fk_days = next(fk for fk in foreign_keys if fk["referred_table"] == "training_days")
    assert fk_days["options"].get("ondelete") == "CASCADE"
    assert any(
        fk["name"] == "fk_schedule_assignment_day_routine"
        and fk["constrained_columns"] == ["training_day_id", "routine_id"]
        and fk["referred_columns"] == ["id", "routine_id"]
        for fk in foreign_keys
    )

    assert F10_REVISION in current
    engine.dispose()


def test_f10_migration_rejects_invalid_position_and_cross_routine_assignment(
    tmp_path: Path,
) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f10_constraints.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")
    engine = create_engine(database_url)

    with engine.begin() as connection:
        user_id = connection.execute(
            text(
                "INSERT INTO users (email, password_hash, created_at) "
                "VALUES ('constraints@example.com', 'x', CURRENT_TIMESTAMP)"
            )
        ).lastrowid
        first_routine_id = connection.execute(
            text(
                "INSERT INTO routines "
                "(user_id, name, normalized_name, objective, created_at, updated_at) "
                "VALUES (:user_id, 'First', 'first', 'build_muscle', "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"user_id": user_id},
        ).lastrowid
        second_routine_id = connection.execute(
            text(
                "INSERT INTO routines "
                "(user_id, name, normalized_name, objective, created_at, updated_at) "
                "VALUES (:user_id, 'Second', 'second', 'build_muscle', "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"user_id": user_id},
        ).lastrowid
        first_day_id = connection.execute(
            text(
                "INSERT INTO training_days (routine_id, name, created_at, updated_at) "
                "VALUES (:routine_id, 'Push', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"routine_id": first_routine_id},
        ).lastrowid
        second_day_id = connection.execute(
            text(
                "INSERT INTO training_days (routine_id, name, created_at, updated_at) "
                "VALUES (:routine_id, 'Pull', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"routine_id": second_routine_id},
        ).lastrowid

    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO routine_schedule_assignments "
                "(routine_id, training_day_id, week_position) VALUES (:routine, :day, 8)"
            ),
            {"routine": first_routine_id, "day": first_day_id},
        )

    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO routine_schedule_assignments "
                "(routine_id, training_day_id, week_position) VALUES (:routine, :day, 1)"
            ),
            {"routine": first_routine_id, "day": second_day_id},
        )

    engine.dispose()


def test_f10_integrity_migration_upgrades_initial_f10_head(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f10_integrity_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", F10_INITIAL_REVISION)
    _run_alembic(database_url, "upgrade", "head")
    assert F10_REVISION in _run_alembic(database_url, "current").stdout


def test_f10_downgrade_preserves_multiple_training_day_positions(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f10_downgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)
    engine = create_engine(database_url)

    with engine.begin() as connection:
        user_id = connection.execute(
            text(
                "INSERT INTO users (email, password_hash, created_at) "
                "VALUES ('downgrade@example.com', 'x', CURRENT_TIMESTAMP)"
            )
        ).lastrowid
        routine_id = connection.execute(
            text(
                "INSERT INTO routines "
                "(user_id, name, normalized_name, objective, created_at, updated_at) "
                "VALUES (:user_id, 'Downgrade', 'downgrade', 'build_muscle', "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"user_id": user_id},
        ).lastrowid
        connection.execute(
            text(
                "INSERT INTO training_days "
                "(routine_id, name, position, created_at, updated_at) VALUES "
                "(:routine_id, 'Push', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), "
                "(:routine_id, 'Pull', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"routine_id": routine_id},
        )
    engine.dispose()

    _run_alembic(database_url, "upgrade", "head")
    _run_alembic(database_url, "downgrade", PREVIOUS_REVISION)

    downgraded_engine = create_engine(database_url)
    with downgraded_engine.connect() as connection:
        positions = connection.execute(
            text("SELECT name, position FROM training_days ORDER BY position")
        ).all()
    assert positions == [("Push", 1), ("Pull", 2)]
    downgraded_engine.dispose()


def test_f10_migration_upgrade_and_real_api_flow(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f10_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    before_engine = create_engine(database_url)
    before_columns = {c["name"] for c in inspect(before_engine).get_columns("training_days")}
    assert "position" in before_columns
    assert "routine_schedule_assignments" not in inspect(before_engine).get_table_names()
    before_engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    migrated_engine = create_engine(database_url, connect_args={"check_same_thread": False})
    after_columns = {c["name"] for c in inspect(migrated_engine).get_columns("training_days")}
    assert "position" not in after_columns
    assert "routine_schedule_assignments" in inspect(migrated_engine).get_table_names()

    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=migrated_engine)

    def override_get_session() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(app) as migrated_client:
            token, _ = _register(migrated_client, "migration-f10@example.com")
            routine = _create_routine(migrated_client, token, "Migrated routine")

            schedule = _get_schedule(migrated_client, token, routine["id"])
            assert len(schedule) == 7
            assert all(s["type"] == "rest" for s in schedule)

            day = _create_day(migrated_client, token, routine["id"], "Push")
            assert day["week_position"] == 1

            schedule = _get_schedule(migrated_client, token, routine["id"])
            assert schedule[0]["type"] == "training"

            _move_day(migrated_client, token, routine["id"], day["id"], 3)
            schedule = _get_schedule(migrated_client, token, routine["id"])
            assert schedule[2]["type"] == "training"
            assert schedule[0]["type"] == "rest"
    finally:
        app.dependency_overrides.clear()
        migrated_engine.dispose()
