"""Tests for F30 — System Roles and Admin Overview."""

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
from app.models import User
from app.services.admin_service import AdminNotFoundError, promote_to_admin

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "f27_auto_start"
F30_REVISION = "f30_system_roles"


def _register(client: TestClient, email: str = "admin@example.com") -> tuple[str, dict[str, Any]]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-secure-password-15"},
    )
    assert response.status_code == 201, response.text
    token = response.cookies.get("auth_token")
    assert token is not None
    return token, response.json()


def _headers(token: str) -> dict[str, str]:
    return {"Cookie": f"auth_token={token}"}


def _create_routine(client: TestClient, token: str, name: str) -> None:
    response = client.post(
        "/api/routines",
        json={"name": name, "objective": "build_muscle"},
        headers=_headers(token),
    )
    assert response.status_code == 201, response.text


# ────────────────── role projection ──────────────────


def test_register_login_and_me_return_role(client: TestClient) -> None:
    token, body = _register(client, "user@example.com")
    assert body == {"id": 1, "email": "user@example.com", "role": "user"}

    client.post("/api/auth/logout")
    logged_in = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "a-secure-password-15"},
    )
    assert logged_in.status_code == 200
    assert logged_in.json()["role"] == "user"

    current = client.get("/api/auth/me", headers=_headers(token))
    assert current.status_code == 200
    assert current.json()["role"] == "user"


def test_registration_ignores_client_supplied_role(client: TestClient) -> None:
    _, body = _register(client, "owner@example.com")
    assert body["role"] == "user"

    response = client.post(
        "/api/auth/register",
        json={
            "email": "sneaky@example.com",
            "password": "a-secure-password-15",
            "role": "admin",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "user"


# ────────────────── authorization boundary ──────────────────


def test_overview_unauthenticated_and_normal_user(client: TestClient) -> None:
    assert client.get("/api/admin/overview").status_code == 401

    token, _ = _register(client, "normal@example.com")
    denied = client.get("/api/admin/overview", headers=_headers(token))
    assert denied.status_code == 403
    assert denied.json() == {"detail": "Administrator access required"}


def test_admin_overview_count_includes_admins(
    client: TestClient, test_session_factory: Any
) -> None:
    _register(client, "first@example.com")
    admin_token, admin_body = _register(client, "owner@example.com")

    with test_session_factory() as session:
        promote_to_admin(session, "owner@example.com")

    overview = client.get("/api/admin/overview", headers=_headers(admin_token))
    assert overview.status_code == 200
    assert overview.json() == {"registered_user_count": 2}
    assert admin_body["id"] == 2


def test_admin_does_not_bypass_ownership(client: TestClient, test_session_factory: Any) -> None:
    user_token, _ = _register(client, "user@example.com")
    _create_routine(client, user_token, "User routine")

    admin_token, _ = _register(client, "owner@example.com")
    with test_session_factory() as session:
        promote_to_admin(session, "owner@example.com")

    own_routines = client.get("/api/routines", headers=_headers(user_token))
    assert own_routines.status_code == 200
    assert [routine["name"] for routine in own_routines.json()] == ["User routine"]

    admin_routines = client.get("/api/routines", headers=_headers(admin_token))
    assert admin_routines.status_code == 200
    assert admin_routines.json() == []


# ────────────────── promotion operation ──────────────────


def test_promote_to_admin_idempotent_and_isolated(
    client: TestClient, test_session_factory: Any
) -> None:
    _register(client, "owner@example.com")
    _register(client, "other@example.com")

    with test_session_factory() as session:
        promoted = promote_to_admin(session, " OWNER@example.COM ")
        assert promoted.role == "admin"

        promoted_again = promote_to_admin(session, "owner@example.com")
        assert promoted_again.role == "admin"

        with pytest.raises(AdminNotFoundError):
            promote_to_admin(session, "missing@example.com")

    with test_session_factory() as session:
        owner = session.query(User).filter(User.email == "owner@example.com").one()
        other = session.query(User).filter(User.email == "other@example.com").one()
        assert owner.role == "admin"
        assert other.role == "user"


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


def _run_promote(database_url: str, email: str) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["DATABASE_URL"] = database_url
    return subprocess.run(
        [sys.executable, "scripts/promote_admin.py", "--email", email],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
    )


def test_f30_migration_fresh_and_rerun(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f30_fresh.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")
    _run_alembic(database_url, "upgrade", "head")
    assert F30_REVISION in _run_alembic(database_url, "current").stdout

    engine = create_engine(database_url)
    schema = inspect(engine)
    columns = {column["name"]: column for column in schema.get_columns("users")}
    assert "role" in columns
    role_column = columns["role"]
    assert role_column["nullable"] is False
    assert "user" in (role_column["default"] or "")

    checks = schema.get_check_constraints("users")
    assert any("role" in (constraint["sqltext"] or "") for constraint in checks)

    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        try:
            connection.execute(
                text(
                    "INSERT INTO users (email, password_hash, role, created_at) VALUES "
                    "('bad@example.com', 'hash', 'superadmin', CURRENT_TIMESTAMP)"
                )
            )
            assert False, "expected CHECK constraint failure"
        except Exception as exc:
            assert "CHECK" in str(exc)
    engine.dispose()


def test_f30_migration_upgrade_existing_users(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f30_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (email, password_hash, created_at) VALUES "
                "('first@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO users (email, password_hash, created_at) VALUES "
                "('second@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
    engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    with engine.connect() as connection:
        roles = cast(
            "list[tuple[str, str]]",
            list(connection.execute(text("SELECT email, role FROM users ORDER BY id")).all()),
        )
        assert roles == [("first@example.com", "user"), ("second@example.com", "user")]
    engine.dispose()


def test_f30_migration_promotion_command(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f30_promote.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (email, password_hash, created_at) VALUES "
                "('owner@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO users (email, password_hash, created_at) VALUES "
                "('other@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )

    first = _run_promote(database_url, " OWNER@example.com ")
    assert first.returncode == 0
    assert "owner@example.com" in first.stdout
    assert "admin" in first.stdout

    second = _run_promote(database_url, "owner@example.com")
    assert second.returncode == 0

    missing = _run_promote(database_url, "missing@example.com")
    assert missing.returncode != 0
    assert "No account found" in missing.stderr

    with engine.connect() as connection:
        roles = cast(
            "list[tuple[str, str]]",
            list(connection.execute(text("SELECT email, role FROM users ORDER BY id")).all()),
        )
        assert roles == [("owner@example.com", "admin"), ("other@example.com", "user")]
    engine.dispose()


def test_f30_migration_real_api_flow(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f30_api.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
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
            user_token, user_body = _register(migrated_client, "user@example.com")
            assert user_body["role"] == "user"

            admin_token, admin_body = _register(migrated_client, "owner@example.com")
            assert admin_body["role"] == "user"

            with session_factory() as session:
                promote_to_admin(session, "owner@example.com")

            admin_me = migrated_client.get("/api/auth/me", headers=_headers(admin_token))
            assert admin_me.json()["role"] == "admin"

            admin_overview = migrated_client.get(
                "/api/admin/overview", headers=_headers(admin_token)
            )
            assert admin_overview.status_code == 200
            assert admin_overview.json() == {"registered_user_count": 2}

            user_me = migrated_client.get("/api/auth/me", headers=_headers(user_token))
            assert user_me.json()["role"] == "user"

            user_overview = migrated_client.get("/api/admin/overview", headers=_headers(user_token))
            assert user_overview.status_code == 403
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
