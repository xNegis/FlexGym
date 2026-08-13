import pytest
from fastapi.testclient import TestClient

import app.api.health as health_module
import app.config as config_module
from app.config import Config, ConfigurationError


def test_config_uses_safe_development_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ("APP_ENV", "DATABASE_URL", "ALLOWED_ORIGINS"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(config_module, "_load_local_settings", lambda: {})

    config = Config()

    assert config.app_env == "development"
    assert config.database_url == "sqlite:///../data/db/flexgym.db"
    assert config.allowed_origins == ["http://localhost:5173"]


def test_production_requires_explicit_database_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    monkeypatch.setattr(config_module, "_load_local_settings", lambda: {})

    try:
        Config()
    except ConfigurationError as error:
        assert str(error) == "Missing required configuration: DATABASE_URL"
    else:
        raise AssertionError("Production configuration must require DATABASE_URL")


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_unavailable(client: TestClient) -> None:
    def failing_check() -> None:
        raise RuntimeError("simulated database failure")

    original = health_module.check_database_connection
    health_module.check_database_connection = failing_check  # type: ignore[assignment]
    try:
        response = client.get("/api/health")
        assert response.status_code == 503
        assert response.json() == {"status": "unavailable"}
    finally:
        health_module.check_database_connection = original


def test_health_response_shape_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    data = response.json()
    assert set(data.keys()) == {"status"}
    assert data["status"] in ("ok", "unavailable")


def test_health_response_shape_unavailable(client: TestClient) -> None:
    def failing_check() -> None:
        raise RuntimeError("simulated database failure")

    original = health_module.check_database_connection
    health_module.check_database_connection = failing_check  # type: ignore[assignment]
    try:
        response = client.get("/api/health")
        data = response.json()
        assert set(data.keys()) == {"status"}
        assert data["status"] == "unavailable"
    finally:
        health_module.check_database_connection = original


def test_cors_allowed_origin(client: TestClient) -> None:
    response = client.get(
        "/api/health",
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_disallowed_origin(client: TestClient) -> None:
    response = client.get(
        "/api/health",
        headers={"Origin": "https://evil.example.com"},
    )
    assert "access-control-allow-origin" not in response.headers
