"""Behavioural tests for F22 body weight tracking."""

import os
import subprocess
import sys
from collections.abc import Generator
from pathlib import Path
from typing import cast

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_session
from app.main import app

BACKEND_ROOT = Path(__file__).resolve().parents[1]
F22_REVISION = "f22_body_weight"
PREVIOUS_REVISION = "f17_completion"


def _register(client: TestClient, email: str = "bw@example.com") -> tuple[str, int]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-secure-password-15"},
    )
    assert response.status_code == 201
    token = response.cookies.get("auth_token")
    assert token is not None
    return token, response.json()["id"]


def _profile_payload(current_local_date: str = "2026-08-14") -> dict[str, object]:
    return {
        "date_of_birth": "1990-06-15",
        "biological_sex": "male",
        "height_cm": 178.5,
        "weight_kg": 81.2,
        "body_fat_percentage": 17.5,
        "training_experience": "intermediate",
        "primary_goal": "build_muscle",
        "training_days_per_week": 4,
        "preferred_workout_duration_minutes": 60,
        "training_environment": "full_gym",
        "physical_limitations": None,
        "current_local_date": current_local_date,
    }


def _create_profile(client: TestClient, token: str, current_local_date: str = "2026-08-14") -> None:
    response = client.post(
        "/api/fitness-profile",
        json=_profile_payload(current_local_date),
        cookies={"auth_token": token},
    )
    assert response.status_code == 201


def _upsert(
    client: TestClient,
    token: str,
    measurement_date: str,
    weight_kg: float,
    note: str | None = None,
    current_local_date: str = "2026-08-14",
) -> tuple[int, dict[str, object]]:
    body: dict[str, object] = {
        "current_local_date": current_local_date,
        "weight_kg": weight_kg,
    }
    if note is not None:
        body["note"] = note
    response = client.put(
        f"/api/body-weight-measurements/{measurement_date}",
        json=body,
        cookies={"auth_token": token},
    )
    return response.status_code, cast(dict[str, object], response.json())


def _delete(client: TestClient, token: str, measurement_date: str) -> int:
    response = client.delete(
        f"/api/body-weight-measurements/{measurement_date}",
        cookies={"auth_token": token},
    )
    return response.status_code


def _list(client: TestClient, token: str, query: str = "") -> dict[str, object]:
    response = client.get(
        f"/api/body-weight-measurements{query}",
        cookies={"auth_token": token},
    )
    assert response.status_code == 200
    return cast(dict[str, object], response.json())


# ---------------------------------------------------------------------------
# onboarding and current-weight resolution
# ---------------------------------------------------------------------------


def test_onboarding_creates_initial_measurement(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    data = _list(client, token)
    assert data["current_weight"] == {
        "weight_kg": 81.2,
        "source": "measurement",
        "measurement_date": "2026-08-14",
    }
    assert len(data["items"]) == 1
    assert data["items"][0]["measurement_date"] == "2026-08-14"
    assert data["items"][0]["weight_kg"] == 81.2
    assert data["items"][0]["note"] is None
    assert data["next_cursor"] is None


def test_profile_resolves_latest_measurement(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token, current_local_date="2026-08-01")

    _upsert(client, token, "2026-08-10", 80.0, current_local_date="2026-08-13")
    status_code, saved = _upsert(
        client, token, "2026-08-13", 79.4, note="morning", current_local_date="2026-08-13"
    )
    assert status_code == 201
    assert saved["current_weight"] == {
        "weight_kg": 79.4,
        "source": "measurement",
        "measurement_date": "2026-08-13",
    }

    profile = client.get("/api/fitness-profile", cookies={"auth_token": token})
    assert profile.status_code == 200
    assert profile.json()["weight_kg"] == 79.4
    assert profile.json()["current_weight_measurement_date"] == "2026-08-13"


def test_delete_latest_falls_back_to_previous_then_profile(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token, current_local_date="2026-08-01")

    _upsert(client, token, "2026-08-10", 80.0, current_local_date="2026-08-13")
    _upsert(client, token, "2026-08-13", 79.4, current_local_date="2026-08-13")

    assert _list(client, token)["current_weight"]["weight_kg"] == 79.4

    assert _delete(client, token, "2026-08-13") == 204
    assert _list(client, token)["current_weight"] == {
        "weight_kg": 80.0,
        "source": "measurement",
        "measurement_date": "2026-08-10",
    }

    # Delete remaining measurements; fall back to the undated profile value.
    assert _delete(client, token, "2026-08-10") == 204
    assert _delete(client, token, "2026-08-01") == 204

    data = _list(client, token)
    assert data["items"] == []
    assert data["current_weight"] == {
        "weight_kg": 81.2,
        "source": "profile_fallback",
        "measurement_date": None,
    }


# ---------------------------------------------------------------------------
# creation and replacement
# ---------------------------------------------------------------------------


def test_create_then_replace_same_date(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token, current_local_date="2026-08-01")

    status_code, _saved = _upsert(
        client, token, "2026-08-12", 82.5, note="after lunch", current_local_date="2026-08-12"
    )
    assert status_code == 201

    status_code, saved = _upsert(client, token, "2026-08-12", 83.0, current_local_date="2026-08-12")
    assert status_code == 200

    data = _list(client, token)
    same_date = [item for item in data["items"] if item["measurement_date"] == "2026-08-12"]
    assert len(same_date) == 1
    assert same_date[0]["weight_kg"] == 83.0
    assert same_date[0]["note"] is None
    assert saved["current_weight"]["weight_kg"] == 83.0


# ---------------------------------------------------------------------------
# ordering and pagination
# ---------------------------------------------------------------------------


def test_history_newest_first_and_cursor_pagination(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token, current_local_date="2026-08-01")
    assert _delete(client, token, "2026-08-01") == 204

    for day in range(1, 13):
        _upsert(client, token, f"2026-08-{day:02d}", 80.0 + day, current_local_date="2026-08-13")

    first = _list(client, token)
    assert len(first["items"]) == 5
    dates = [item["measurement_date"] for item in first["items"]]
    assert dates == sorted(dates, reverse=True)
    assert first["next_cursor"] is not None

    second = _list(client, token, query=f"?cursor={first['next_cursor']}")
    assert len(second["items"]) == 5
    assert second["next_cursor"] is not None
    first_dates = {item["measurement_date"] for item in first["items"]}
    assert all(item["measurement_date"] not in first_dates for item in second["items"])

    third = _list(client, token, query=f"?cursor={second['next_cursor']}")
    assert len(third["items"]) == 2
    assert third["next_cursor"] is None

    all_dates = [
        item["measurement_date"] for item in (first["items"] + second["items"] + third["items"])
    ]
    assert all_dates == sorted(all_dates, reverse=True)
    assert len(set(all_dates)) == 12


# ---------------------------------------------------------------------------
# validation
# ---------------------------------------------------------------------------


def test_future_measurement_date_rejected(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    status_code, _body = _upsert(client, token, "2026-08-15", 80.0, current_local_date="2026-08-14")
    assert status_code == 422


def test_invalid_weight_values_rejected(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    for weight in (19.9, 500.1, 80.55, True, "80"):
        response = client.put(
            "/api/body-weight-measurements/2026-08-12",
            json={"current_local_date": "2026-08-14", "weight_kg": weight},
            cookies={"auth_token": token},
        )
        assert response.status_code == 422, f"weight {weight!r} should be rejected"


def test_note_length_and_unknown_field_rejected(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    response = client.put(
        "/api/body-weight-measurements/2026-08-12",
        json={
            "current_local_date": "2026-08-14",
            "weight_kg": 80.0,
            "note": "x" * 1001,
        },
        cookies={"auth_token": token},
    )
    assert response.status_code == 422

    response = client.put(
        "/api/body-weight-measurements/2026-08-12",
        json={
            "current_local_date": "2026-08-14",
            "weight_kg": 80.0,
            "surprise": "field",
        },
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


def test_malformed_measurement_date_path_rejected(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    response = client.put(
        "/api/body-weight-measurements/not-a-date",
        json={"current_local_date": "2026-08-14", "weight_kg": 80.0},
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


def test_query_parameter_validation(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    for query in (
        "?limit=0",
        "?limit=51",
        "?limit=abc",
        "?unknown=1",
        "?cursor=a&cursor=b",
    ):
        assert (
            client.get(
                f"/api/body-weight-measurements{query}",
                cookies={"auth_token": token},
            ).status_code
            == 422
        )


# ---------------------------------------------------------------------------
# ownership and profile requirements
# ---------------------------------------------------------------------------


def test_operations_require_profile(client: TestClient) -> None:
    token, _user_id = _register(client)

    assert (
        client.get("/api/body-weight-measurements", cookies={"auth_token": token}).status_code
        == 404
    )
    assert (
        client.put(
            "/api/body-weight-measurements/2026-08-12",
            json={"current_local_date": "2026-08-14", "weight_kg": 80.0},
            cookies={"auth_token": token},
        ).status_code
        == 404
    )
    assert (
        client.delete(
            "/api/body-weight-measurements/2026-08-12",
            cookies={"auth_token": token},
        ).status_code
        == 404
    )


def test_unauthenticated_operations(client: TestClient) -> None:
    assert client.get("/api/body-weight-measurements").status_code == 401
    assert (
        client.put(
            "/api/body-weight-measurements/2026-08-12",
            json={"current_local_date": "2026-08-14", "weight_kg": 80.0},
        ).status_code
        == 401
    )
    assert client.delete("/api/body-weight-measurements/2026-08-12").status_code == 401


def test_measurements_are_user_owned(client: TestClient) -> None:
    token_a, _user_a = _register(client, "owner@example.com")
    _create_profile(client, token_a)
    _upsert(client, token_a, "2026-08-12", 80.0)

    token_b, _user_b = _register(client, "other@example.com")
    _create_profile(client, token_b)

    other_list = _list(client, token_b)
    assert all(item["measurement_date"] != "2026-08-12" for item in other_list["items"])

    # Cannot see or delete the other user's measurement.
    assert _delete(client, token_b, "2026-08-12") == 404

    # The other user can create their own same-date measurement independently.
    status_code, saved = _upsert(client, token_b, "2026-08-12", 70.0)
    assert status_code == 201
    assert saved["item"]["measurement_date"] == "2026-08-12"
    assert saved["item"]["weight_kg"] == 70.0

    other_list = _list(client, token_b)
    same_date = [item for item in other_list["items"] if item["measurement_date"] == "2026-08-12"]
    assert same_date[0]["weight_kg"] == 70.0

    # Owner's data is untouched.
    owner_list = _list(client, token_a)
    owner_same = [item for item in owner_list["items"] if item["measurement_date"] == "2026-08-12"]
    assert owner_same[0]["weight_kg"] == 80.0


def test_delete_missing_measurement_returns_404(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    response = client.delete(
        "/api/body-weight-measurements/2026-08-01",
        cookies={"auth_token": token},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# profile deletion preserves measurements
# ---------------------------------------------------------------------------


def test_profile_deletion_preserves_measurements(client: TestClient) -> None:
    token, _user_id = _register(client, "retain@example.com")
    _create_profile(client, token)
    _upsert(client, token, "2026-08-12", 80.0)

    deleted = client.delete("/api/fitness-profile", cookies={"auth_token": token})
    assert deleted.status_code == 204

    # Re-onboard; the retained measurement still exists for this user.
    login = client.post(
        "/api/auth/login",
        json={"email": "retain@example.com", "password": "a-secure-password-15"},
    )
    assert login.status_code == 200
    token = login.cookies.get("auth_token")
    assert token is not None

    _create_profile(client, token)
    data = _list(client, token)
    dates = {item["measurement_date"] for item in data["items"]}
    assert "2026-08-12" in dates


# ---------------------------------------------------------------------------
# migration validation
# ---------------------------------------------------------------------------


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


def test_f22_migration_fresh_database(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f22_fresh.db').as_posix()}"

    _run_alembic(database_url, "upgrade", "head")
    assert F22_REVISION in _run_alembic(database_url, "current").stdout
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    schema = inspect(engine)

    assert "body_weight_measurements" in schema.get_table_names()
    columns = {column["name"] for column in schema.get_columns("body_weight_measurements")}
    assert columns == {
        "id",
        "user_id",
        "measurement_date",
        "weight_kg",
        "note",
        "created_at",
        "updated_at",
    }

    unique_constraints = {
        uc["name"] for uc in schema.get_unique_constraints("body_weight_measurements")
    }
    assert "uq_body_weight_measurement_user_date" in unique_constraints

    foreign_keys = schema.get_foreign_keys("body_weight_measurements")
    assert len(foreign_keys) == 1
    assert foreign_keys[0]["referred_table"] == "users"
    assert foreign_keys[0]["options"].get("ondelete") == "CASCADE"

    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        assert (
            connection.execute(text("SELECT COUNT(*) FROM body_weight_measurements")).scalar_one()
            == 0
        )

    engine.dispose()


def test_f22_migration_upgrade_from_f17_head(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f22_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(7001, 'legacy-bw@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO fitness_profiles "
                "(id, user_id, date_of_birth, biological_sex, height_cm, weight_kg, "
                "body_fat_percentage, training_experience, primary_goal, "
                "training_days_per_week, preferred_workout_duration_minutes, "
                "training_environment, physical_limitations, created_at, updated_at) VALUES "
                "(7001, 7001, '1990-01-01', 'male', 175.0, 77.5, NULL, 'intermediate', "
                "'build_muscle', 4, 60, 'full_gym', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
    engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    upgraded_engine = create_engine(database_url, connect_args={"check_same_thread": False})
    with upgraded_engine.connect() as conn:
        # No fictional historical measurement may be invented for pre-F22 profiles.
        assert conn.execute(text("SELECT COUNT(*) FROM body_weight_measurements")).scalar_one() == 0
        weight_kg = conn.execute(
            text("SELECT weight_kg FROM fitness_profiles WHERE user_id = 7001")
        ).scalar_one()
        assert float(weight_kg) == 77.5

    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=upgraded_engine)

    def override_get_session() -> Generator[Session, None, None]:
        s = session_factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(app) as migrated_client:
            token, _ = _register(migrated_client, "migration-f22@example.com")
            _create_profile(migrated_client, token)
            data = _list(migrated_client, token)
            assert len(data["items"]) == 1
            assert data["items"][0]["measurement_date"] == "2026-08-14"
            assert data["current_weight"]["source"] == "measurement"
    finally:
        app.dependency_overrides.clear()
        upgraded_engine.dispose()
