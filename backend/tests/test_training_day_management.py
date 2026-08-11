"""Tests for F08 training day management (updated for F10 schedule positions)."""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Generator
from pathlib import Path
from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_session
from app.main import app

BACKEND_ROOT = Path(__file__).resolve().parents[1]
F08_REVISION = "b61961abf6a5"
PREVIOUS_REVISION = "a7b2c3d4e5f6"


def _register(client: TestClient, email: str = "td@example.com") -> tuple[str, int]:
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
    name: str = "Push Pull Legs",
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


# -- Creation and listing ---------------------------------------------------


def test_create_and_list_training_days(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    d1 = _create_day(client, token, routine["id"], "  Push  ")
    d2 = _create_day(client, token, routine["id"], "Pull")
    d3 = _create_day(client, token, routine["id"], "Legs")

    assert d1["name"] == "Push"
    assert d1["week_position"] == 1
    assert d1["id"] > 0
    assert "routine_id" not in d1
    assert d1["created_at"] == d1["updated_at"]

    assert d2["week_position"] == 2
    assert d3["week_position"] == 3

    response = client.get(f"/api/routines/{routine['id']}/days", headers=_auth_headers(token))
    assert response.status_code == 200
    days = response.json()
    assert len(days) == 3
    positions = [d["week_position"] for d in days]
    assert positions == [1, 2, 3]
    names = [d["name"] for d in days]
    assert names == ["Push", "Pull", "Legs"]


def test_empty_training_days_list(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    response = client.get(f"/api/routines/{routine['id']}/days", headers=_auth_headers(token))
    assert response.status_code == 200
    assert response.json() == []


def test_duplicate_names_accepted(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    d1 = _create_day(client, token, routine["id"], "Full Body")
    d2 = _create_day(client, token, routine["id"], "Full Body")

    assert d2["name"] == "Full Body"
    assert d2["id"] != d1["id"]
    response = client.get(f"/api/routines/{routine['id']}/days", headers=_auth_headers(token))
    days = response.json()
    assert len(days) == 2
    assert {d["id"] for d in days} == {d1["id"], d2["id"]}


# -- Seven-day limit --------------------------------------------------------


def test_seven_day_limit(client: TestClient) -> None:
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
    assert response.json() == {"detail": "Routine already has 7 training days"}

    days = client.get(f"/api/routines/{routine['id']}/days", headers=_auth_headers(token)).json()
    assert len(days) == 7


def test_limit_resets_after_delete(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    for i in range(7):
        _create_day(client, token, routine["id"], f"Day {i + 1}")

    days = client.get(f"/api/routines/{routine['id']}/days", headers=_auth_headers(token)).json()
    client.delete(
        f"/api/routines/{routine['id']}/days/{days[0]['id']}",
        headers=_auth_headers(token),
    )

    response = client.post(
        f"/api/routines/{routine['id']}/days",
        json={"name": "New Day"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201


# -- Training day count in routines -----------------------------------------


def test_training_day_count_in_routine_output(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    detail = client.get(f"/api/routines/{routine['id']}", headers=_auth_headers(token)).json()
    assert detail["training_day_count"] == 0

    _create_day(client, token, routine["id"], "Push")
    _create_day(client, token, routine["id"], "Pull")

    detail = client.get(f"/api/routines/{routine['id']}", headers=_auth_headers(token)).json()
    assert detail["training_day_count"] == 2

    routines = client.get("/api/routines", headers=_auth_headers(token)).json()
    assert routines[0]["training_day_count"] == 2


# -- Rename -----------------------------------------------------------------


def test_rename_training_day(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"], "Push")

    response = client.put(
        f"/api/routines/{routine['id']}/days/{day['id']}",
        json={"name": "Upper body"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == day["id"]
    assert data["name"] == "Upper body"
    assert data["week_position"] == 1
    assert data["created_at"] == day["created_at"]
    assert data["updated_at"] != day["updated_at"]

    days = client.get(f"/api/routines/{routine['id']}/days", headers=_auth_headers(token)).json()
    assert days[0]["name"] == "Upper body"


def test_rename_preserves_routine_timestamp(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    original_updated_at = routine["updated_at"]
    day = _create_day(client, token, routine["id"], "Push")

    response = client.put(
        f"/api/routines/{routine['id']}/days/{day['id']}",
        json={"name": "Lower body"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 200

    updated_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()
    assert updated_routine["updated_at"] != original_updated_at


# -- Deletion ---------------------------------------------------------------


def test_delete_training_day(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    d1 = _create_day(client, token, routine["id"], "Push")
    d2 = _create_day(client, token, routine["id"], "Pull")
    d3 = _create_day(client, token, routine["id"], "Legs")

    response = client.delete(
        f"/api/routines/{routine['id']}/days/{d2['id']}",
        headers=_auth_headers(token),
    )
    assert response.status_code == 204

    days = client.get(f"/api/routines/{routine['id']}/days", headers=_auth_headers(token)).json()
    assert len(days) == 2
    remaining_ids = {d["id"] for d in days}
    assert remaining_ids == {d1["id"], d3["id"]}


def test_delete_updates_count(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    d = _create_day(client, token, routine["id"], "Push")

    before = client.get(f"/api/routines/{routine['id']}", headers=_auth_headers(token)).json()
    assert before["training_day_count"] == 1

    client.delete(
        f"/api/routines/{routine['id']}/days/{d['id']}",
        headers=_auth_headers(token),
    )

    after = client.get(f"/api/routines/{routine['id']}", headers=_auth_headers(token)).json()
    assert after["training_day_count"] == 0


# -- Ownership isolation ----------------------------------------------------


def test_list_only_returns_owned_routine_days(client: TestClient) -> None:
    token1, _ = _register(client, "owner1@example.com")
    token2, _ = _register(client, "owner2@example.com")
    routine1 = _create_routine(client, token1, "R1")
    routine2 = _create_routine(client, token2, "R2")
    _create_day(client, token1, routine1["id"], "Push")
    _create_day(client, token2, routine2["id"], "Pull")

    response = client.get(f"/api/routines/{routine1['id']}/days", headers=_auth_headers(token2))
    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


def test_cross_routine_day_not_found(client: TestClient) -> None:
    token, _ = _register(client)
    routine1 = _create_routine(client, token, "R1")
    routine2 = _create_routine(client, token, "R2")
    day = _create_day(client, token, routine1["id"], "Push")

    response = client.put(
        f"/api/routines/{routine2['id']}/days/{day['id']}",
        json={"name": "Hijack"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Training day not found"}


def test_other_user_routine_not_found(client: TestClient) -> None:
    token1, _ = _register(client, "a@example.com")
    token2, _ = _register(client, "b@example.com")
    routine2 = _create_routine(client, token2, "R2")
    day = _create_day(client, token2, routine2["id"], "Pull")

    response = client.get(f"/api/routines/{routine2['id']}/days", headers=_auth_headers(token1))
    assert response.status_code == 404

    response = client.post(
        f"/api/routines/{routine2['id']}/days",
        json={"name": "Push"},
        headers=_auth_headers(token1),
    )
    assert response.status_code == 404

    response = client.put(
        f"/api/routines/{routine2['id']}/days/{day['id']}",
        json={"name": "X"},
        headers=_auth_headers(token1),
    )
    assert response.status_code == 404

    response = client.delete(
        f"/api/routines/{routine2['id']}/days/{day['id']}",
        headers=_auth_headers(token1),
    )
    assert response.status_code == 404


# -- Routine deletion cascades ----------------------------------------------


def test_routine_deletion_cascades_to_days(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    _create_day(client, token, routine["id"], "Push")

    client.delete(f"/api/routines/{routine['id']}", headers=_auth_headers(token))

    response = client.get(f"/api/routines/{routine['id']}/days", headers=_auth_headers(token))
    assert response.status_code == 404


# -- Invalid input ----------------------------------------------------------


def test_invalid_name_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    for body in [{"name": ""}, {"name": "   "}]:
        response = client.post(
            f"/api/routines/{routine['id']}/days",
            json=body,
            headers=_auth_headers(token),
        )
        assert response.status_code == 422

    days = client.get(f"/api/routines/{routine['id']}/days", headers=_auth_headers(token)).json()
    assert len(days) == 0


def test_unknown_fields_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)

    response = client.post(
        f"/api/routines/{routine['id']}/days",
        json={"name": "Push", "extra": "bad"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 422


def test_invalid_routine_id_returns_422(client: TestClient) -> None:
    token, _ = _register(client)

    get_paths = [
        "/api/routines/abc/days",
        "/api/routines/-1/days",
        "/api/routines/0/days",
    ]
    for path in get_paths:
        response = client.get(path, headers=_auth_headers(token))
        assert response.status_code == 422, f"GET {path} should be 422"

    response = client.put(
        "/api/routines/abc/days/1",
        json={"name": "X"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    response = client.delete(
        "/api/routines/abc/days/1",
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    response = client.delete(
        "/api/routines/1/days/abc",
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    response = client.delete(
        "/api/routines/-1/days/1",
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    response = client.delete(
        "/api/routines/1/days/-1",
        headers=_auth_headers(token),
    )
    assert response.status_code == 422


# -- Unauthenticated --------------------------------------------------------


def test_training_day_endpoints_require_auth(client: TestClient) -> None:
    assert client.get("/api/routines/1/days").status_code == 401
    assert client.post("/api/routines/1/days", json={"name": "Push"}).status_code == 401
    assert client.put("/api/routines/1/days/1", json={"name": "Upper"}).status_code == 401
    assert client.delete("/api/routines/1/days/1").status_code == 401


# -- Routine timestamp updates on mutations ---------------------------------


def test_create_day_refreshes_routine_timestamp(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    original_updated_at = routine["updated_at"]

    _create_day(client, token, routine["id"], "Push")

    updated = client.get(f"/api/routines/{routine['id']}", headers=_auth_headers(token)).json()
    assert updated["updated_at"] != original_updated_at


def test_delete_day_refreshes_routine_timestamp(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"], "Push")

    original = client.get(f"/api/routines/{routine['id']}", headers=_auth_headers(token)).json()

    client.delete(
        f"/api/routines/{routine['id']}/days/{day['id']}",
        headers=_auth_headers(token),
    )

    updated = client.get(f"/api/routines/{routine['id']}", headers=_auth_headers(token)).json()
    assert updated["updated_at"] != original["updated_at"]


# -- Migration tests --------------------------------------------------------


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


def test_f08_migration_fresh_database(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'fresh.db').as_posix()}"

    _run_alembic(database_url, "upgrade", F08_REVISION)
    current = _run_alembic(database_url, "current").stdout
    _run_alembic(database_url, "upgrade", F08_REVISION)

    engine = create_engine(database_url)
    schema = inspect(engine)
    assert "training_days" in schema.get_table_names()
    columns = {column["name"] for column in schema.get_columns("training_days")}
    assert {"id", "routine_id", "name", "position", "created_at", "updated_at"} == columns
    assert any(
        constraint.get("name") == "uq_training_day_routine_position"
        and set(constraint["column_names"]) == {"routine_id", "position"}
        for constraint in schema.get_unique_constraints("training_days")
    )
    foreign_keys = schema.get_foreign_keys("training_days")
    assert len(foreign_keys) == 1
    assert foreign_keys[0]["referred_table"] == "routines"
    assert foreign_keys[0]["options"].get("ondelete") == "CASCADE"
    assert F08_REVISION in current
    engine.dispose()


def test_f08_migration_upgrade_and_real_api_flow(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    before_engine = create_engine(database_url)
    assert "training_days" not in inspect(before_engine).get_table_names()
    before_engine.dispose()

    _run_alembic(database_url, "upgrade", "head")
    migrated_engine = create_engine(database_url, connect_args={"check_same_thread": False})
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
            token, _ = _register(migrated_client, "migration@example.com")
            routine = _create_routine(migrated_client, token, "Migrated routine")
            day = _create_day(migrated_client, token, routine["id"], "Push")
            response = migrated_client.get(
                f"/api/routines/{routine['id']}/days", headers=_auth_headers(token)
            )
            assert response.status_code == 200
            assert response.json() == [day]
    finally:
        app.dependency_overrides.clear()
        migrated_engine.dispose()
