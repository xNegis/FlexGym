"""Tests for F09 routine exercise configuration."""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Callable, Generator, Iterator
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Numeric, create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_session
from app.main import app
from app.models import Exercise

BACKEND_ROOT = Path(__file__).resolve().parents[1]
F09_REVISION = "273789964714"
LATEST_REVISION = "f14_2_set_started"
PREVIOUS_REVISION = "b61961abf6a5"


@pytest.fixture(autouse=True)
def seed_exercises(
    test_session_factory: Callable[..., Session],
) -> Iterator[None]:
    session = test_session_factory()
    try:
        count = session.execute(text("SELECT COUNT(*) FROM exercises")).scalar()
        if count and count > 0:
            yield
            return
    finally:
        session.close()

    from app.exercise_data import EXERCISE_SEED_DATA

    session = test_session_factory()
    try:
        for row in EXERCISE_SEED_DATA:
            (
                slug,
                name,
                primary_muscle,
                secondary_muscles,
                equipment,
                movement_pattern,
                execution_type,
                instructions,
            ) = row
            exercise = Exercise(
                slug=slug,
                name=name,
                primary_muscle=primary_muscle,
                secondary_muscles=secondary_muscles,
                equipment=equipment,
                movement_pattern=movement_pattern,
                execution_type=execution_type,
                instructions=instructions,
            )
            session.add(exercise)
        session.commit()
        yield
    finally:
        session.close()


def _register(client: TestClient, email: str = "ec@example.com") -> tuple[str, int]:
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


def _create_routine(client: TestClient, token: str, name: str = "My Routine") -> dict[str, Any]:
    response = client.post(
        "/api/routines",
        json={"name": name, "objective": "build_muscle"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _create_day(
    client: TestClient, token: str, routine_id: int, name: str = "Push"
) -> dict[str, Any]:
    response = client.post(
        f"/api/routines/{routine_id}/days",
        json={"name": name},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _create_config(
    client: TestClient,
    token: str,
    routine_id: int,
    day_id: int,
    exercise_slug: str = "barbell-bench-press",
    target_type: str = "repetitions",
    **overrides: Any,
) -> dict[str, Any]:
    payload = {
        "exercise_slug": exercise_slug,
        "target_type": target_type,
        "sets": [
            {"target_value": 12},
            {"target_value": 10},
            {"target_value": 8},
        ],
        **overrides,
    }
    response = client.post(
        f"/api/routines/{routine_id}/days/{day_id}/exercises",
        json=payload,
        headers=_auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


# -- Create and list --------------------------------------------------------


def test_create_and_list_with_sets(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"], "Push")

    config = _create_config(
        client,
        token,
        routine["id"],
        day["id"],
        rest_after_exercise_seconds=180,
        notes="Use the middle rack height",
    )

    assert config["id"] > 0
    assert config["position"] == 1
    assert config["exercise"]["slug"] == "barbell-bench-press"
    assert config["exercise"]["name"] == "Barbell Bench Press"
    assert config["target_type"] == "repetitions"
    assert config["rest_after_exercise_seconds"] == 180
    assert config["notes"] == "Use the middle rack height"
    assert len(config["sets"]) == 3
    assert config["sets"][0]["target_value"] == 12
    assert config["sets"][1]["target_value"] == 10
    assert config["sets"][2]["target_value"] == 8
    assert config["created_at"] == config["updated_at"]

    response = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    configs = response.json()
    assert len(configs) == 1
    assert configs[0]["id"] == config["id"]

    # Verify exercise_count on training day
    days = client.get(
        f"/api/routines/{routine['id']}/days",
        headers=_auth_headers(token),
    ).json()
    assert days[0]["exercise_count"] == 1


def test_empty_exercise_list(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    response = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json() == []


# -- Per-set optional fields ------------------------------------------------


def test_per_set_optional_fields(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    payload = {
        "exercise_slug": "barbell-bench-press",
        "target_type": "repetitions",
        "sets": [
            {
                "target_value": 12,
                "target_weight_kg": 60,
                "target_rir": 3,
                "tempo": {
                    "eccentric_seconds": 3,
                    "stretched_pause_seconds": 1,
                    "concentric_seconds": 1,
                    "peak_contraction_seconds": 0,
                },
                "rest_after_set_seconds": 90,
                "notes": "Warm-up",
            },
            {
                "target_value": 8,
                "target_weight_kg": None,
                "target_rir": None,
                "tempo": None,
                "rest_after_set_seconds": None,
                "notes": None,
            },
        ],
    }
    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json=payload,
        headers=_auth_headers(token),
    )
    assert response.status_code == 201
    config = response.json()

    s1 = config["sets"][0]
    assert s1["target_weight_kg"] == 60
    assert s1["target_rir"] == 3
    assert s1["tempo"] == {
        "eccentric_seconds": 3,
        "stretched_pause_seconds": 1,
        "concentric_seconds": 1,
        "peak_contraction_seconds": 0,
    }
    assert s1["rest_after_set_seconds"] == 90
    assert s1["notes"] == "Warm-up"

    s2 = config["sets"][1]
    assert s2["target_weight_kg"] is None
    assert s2["target_rir"] is None
    assert s2["tempo"] is None
    assert s2["rest_after_set_seconds"] is None
    assert s2["notes"] is None


def test_nullable_exercise_level_fields(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    payload = {
        "exercise_slug": "barbell-bench-press",
        "target_type": "repetitions",
        "sets": [{"target_value": 10}],
    }
    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json=payload,
        headers=_auth_headers(token),
    )
    assert response.status_code == 201
    config = response.json()
    assert config["rest_after_exercise_seconds"] is None
    assert config["notes"] is None


# -- Target types -----------------------------------------------------------


def test_duration_target_type(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    payload = {
        "exercise_slug": "plank",
        "target_type": "duration_seconds",
        "sets": [{"target_value": 30}, {"target_value": 45}],
    }
    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json=payload,
        headers=_auth_headers(token),
    )
    assert response.status_code == 201
    config = response.json()
    assert config["target_type"] == "duration_seconds"
    assert config["sets"][0]["target_value"] == 30


def test_distance_target_type(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    payload = {
        "exercise_slug": "farmers-carry",
        "target_type": "distance_meters",
        "sets": [{"target_value": 20}, {"target_value": 20}, {"target_value": 15.5}],
    }
    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json=payload,
        headers=_auth_headers(token),
    )
    assert response.status_code == 201
    config = response.json()
    assert config["target_type"] == "distance_meters"
    assert config["sets"][2]["target_value"] == 15.5


def test_invalid_repetition_target(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    payload = {
        "exercise_slug": "barbell-bench-press",
        "target_type": "repetitions",
        "sets": [{"target_value": 12.5}],
    }
    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json=payload,
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    # Verify nothing persisted
    configs = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    assert len(configs) == 0


def test_target_weight_with_more_than_two_decimal_places_is_rejected(
    client: TestClient,
) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json={
            "exercise_slug": "barbell-bench-press",
            "target_type": "repetitions",
            "sets": [{"target_value": 10, "target_weight_kg": 1.234}],
        },
        headers=_auth_headers(token),
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Target weight must have at most two decimal places"}
    configs = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    assert configs == []


def test_invalid_update_preserves_configuration_and_parent_timestamps(
    client: TestClient,
) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])
    original_config = _create_config(client, token, routine["id"], day["id"])
    original_day = client.get(
        f"/api/routines/{routine['id']}/days", headers=_auth_headers(token)
    ).json()[0]
    original_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()

    response = client.put(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises/{original_config['id']}",
        json={
            "target_type": "repetitions",
            "sets": [{"target_value": 6, "target_weight_kg": 42.123}],
        },
        headers=_auth_headers(token),
    )

    assert response.status_code == 422
    persisted = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    assert persisted == [original_config]
    persisted_day = client.get(
        f"/api/routines/{routine['id']}/days", headers=_auth_headers(token)
    ).json()[0]
    persisted_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()
    assert persisted_day["updated_at"] == original_day["updated_at"]
    assert persisted_routine["updated_at"] == original_routine["updated_at"]


# -- Duplicate and limit ----------------------------------------------------


def test_same_day_duplicate_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    _create_config(client, token, routine["id"], day["id"])

    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json={
            "exercise_slug": "barbell-bench-press",
            "target_type": "repetitions",
            "sets": [{"target_value": 10}],
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 409
    assert response.json() == {"detail": "Exercise is already configured for this training day"}

    configs = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    assert len(configs) == 1


def test_same_exercise_different_day_allowed(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    d1 = _create_day(client, token, routine["id"], "Push")
    d2 = _create_day(client, token, routine["id"], "Pull")

    _create_config(client, token, routine["id"], d1["id"])
    _create_config(client, token, routine["id"], d2["id"])

    configs1 = client.get(
        f"/api/routines/{routine['id']}/days/{d1['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    configs2 = client.get(
        f"/api/routines/{routine['id']}/days/{d2['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    assert len(configs1) == 1
    assert len(configs2) == 1


def test_20_exercise_limit(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    # F05 seed data has ~30 exercises; use different slugs for all 20
    slugs = [
        "barbell-bench-press",
        "dumbbell-bench-press",
        "incline-barbell-bench-press",
        "incline-dumbbell-bench-press",
        "barbell-back-squat",
        "barbell-front-squat",
        "conventional-deadlift",
        "barbell-romanian-deadlift",
        "barbell-bent-over-row",
        "one-arm-dumbbell-row",
        "lat-pulldown",
        "pull-up",
        "chin-up",
        "barbell-overhead-press",
        "dumbbell-shoulder-press",
        "dumbbell-lateral-raise",
        "barbell-curl",
        "dumbbell-curl",
        "parallel-bar-dip",
        "cable-triceps-pushdown",
    ]

    for slug in slugs:
        client.post(
            f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
            json={
                "exercise_slug": slug,
                "target_type": "repetitions",
                "sets": [{"target_value": 10}],
            },
            headers=_auth_headers(token),
        )

    # 21st should fail
    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json={
            "exercise_slug": "hack-squat",
            "target_type": "repetitions",
            "sets": [{"target_value": 10}],
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 409
    assert "20" in response.json()["detail"]

    configs = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    assert len(configs) == 20


# -- Update -----------------------------------------------------------------


def test_full_update_atomic(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])
    config = _create_config(client, token, routine["id"], day["id"])

    original_created_at = config["created_at"]
    original_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()

    response = client.put(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises/{config['id']}",
        json={
            "target_type": "repetitions",
            "rest_after_exercise_seconds": 120,
            "notes": "Updated notes",
            "sets": [
                {
                    "target_value": 15,
                    "target_weight_kg": 50,
                    "target_rir": 2,
                    "tempo": None,
                    "rest_after_set_seconds": 60,
                    "notes": "First",
                },
                {"target_value": 12},
            ],
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["id"] == config["id"]
    assert updated["position"] == 1
    assert updated["exercise"]["slug"] == "barbell-bench-press"
    assert updated["created_at"] == original_created_at
    assert updated["updated_at"] != config["updated_at"]
    assert updated["rest_after_exercise_seconds"] == 120
    assert updated["notes"] == "Updated notes"
    assert len(updated["sets"]) == 2
    assert updated["sets"][0]["target_value"] == 15
    assert updated["sets"][0]["target_weight_kg"] == 50

    # Verify parent timestamps refreshed
    updated_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()
    assert updated_routine["updated_at"] != original_routine["updated_at"]


# -- Reorder ----------------------------------------------------------------


def test_successful_reorder(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    c1 = _create_config(client, token, routine["id"], day["id"], "barbell-bench-press")
    c2 = _create_config(client, token, routine["id"], day["id"], "barbell-back-squat")
    c3 = _create_config(client, token, routine["id"], day["id"], "conventional-deadlift")

    response = client.put(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises/order",
        json={"exercise_configuration_ids": [c3["id"], c1["id"], c2["id"]]},
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    configs = response.json()
    assert [c["id"] for c in configs] == [c3["id"], c1["id"], c2["id"]]
    assert [c["position"] for c in configs] == [1, 2, 3]


def test_reorder_invalid_preserves_order(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    c1 = _create_config(client, token, routine["id"], day["id"], "barbell-bench-press")
    _create_config(client, token, routine["id"], day["id"], "barbell-back-squat")

    # Missing config
    response = client.put(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises/order",
        json={"exercise_configuration_ids": [c1["id"]]},
        headers=_auth_headers(token),
    )
    assert response.status_code == 422
    assert "exactly once" in response.json()["detail"]

    # Verify order preserved
    configs = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    assert [c["position"] for c in configs] == [1, 2]


# -- Delete -----------------------------------------------------------------


def test_delete_cascades_sets_and_compacts_positions(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    c1 = _create_config(client, token, routine["id"], day["id"], "barbell-bench-press")
    c2 = _create_config(client, token, routine["id"], day["id"], "barbell-back-squat")
    _create_config(client, token, routine["id"], day["id"], "conventional-deadlift")

    # Delete middle config
    response = client.delete(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises/{c2['id']}",
        headers=_auth_headers(token),
    )
    assert response.status_code == 204

    configs = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    assert len(configs) == 2
    assert configs[0]["position"] == 1
    assert configs[1]["position"] == 2
    assert configs[0]["id"] == c1["id"]

    # Exercise count updated
    days = client.get(
        f"/api/routines/{routine['id']}/days",
        headers=_auth_headers(token),
    ).json()
    assert days[0]["exercise_count"] == 2


# -- Ownership isolation ----------------------------------------------------


def test_ownership_isolation_list(client: TestClient) -> None:
    token1, _ = _register(client, "a@example.com")
    token2, _ = _register(client, "b@example.com")
    r1 = _create_routine(client, token1, "R1")
    r2 = _create_routine(client, token2, "R2")
    d1 = _create_day(client, token1, r1["id"])
    _create_day(client, token2, r2["id"])
    _create_config(client, token1, r1["id"], d1["id"])

    response = client.get(
        f"/api/routines/{r1['id']}/days/{d1['id']}/exercises",
        headers=_auth_headers(token2),
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


def test_cross_day_config_not_found(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    d1 = _create_day(client, token, routine["id"], "Push")
    d2 = _create_day(client, token, routine["id"], "Pull")
    c1 = _create_config(client, token, routine["id"], d1["id"])

    # Access via wrong day
    response = client.put(
        f"/api/routines/{routine['id']}/days/{d2['id']}/exercises/{c1['id']}",
        json={
            "target_type": "repetitions",
            "sets": [{"target_value": 10}],
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Configured exercise not found"}


def test_other_user_config_isolated(client: TestClient) -> None:
    token1, _ = _register(client, "a@example.com")
    token2, _ = _register(client, "b@example.com")
    r2 = _create_routine(client, token2, "R2")
    d2 = _create_day(client, token2, r2["id"])
    c2 = _create_config(client, token2, r2["id"], d2["id"])

    # User 1 tries to edit User 2's config
    response = client.put(
        f"/api/routines/{r2['id']}/days/{d2['id']}/exercises/{c2['id']}",
        json={
            "target_type": "repetitions",
            "sets": [{"target_value": 5}],
        },
        headers=_auth_headers(token1),
    )
    assert response.status_code == 404

    response = client.delete(
        f"/api/routines/{r2['id']}/days/{d2['id']}/exercises/{c2['id']}",
        headers=_auth_headers(token1),
    )
    assert response.status_code == 404


# -- Cascade deletions ------------------------------------------------------


def test_training_day_deletion_cascades_to_configs(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])
    _create_config(client, token, routine["id"], day["id"])

    client.delete(
        f"/api/routines/{routine['id']}/days/{day['id']}",
        headers=_auth_headers(token),
    )

    response = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    )
    assert response.status_code == 404


def test_routine_deletion_cascades_through_configs(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])
    _create_config(client, token, routine["id"], day["id"])

    client.delete(f"/api/routines/{routine['id']}", headers=_auth_headers(token))

    response = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    )
    assert response.status_code == 404


def test_fitness_profile_deletion_leaves_routines_and_configs(client: TestClient) -> None:
    # First create a profile so we can delete it
    token, _ = _register(client)
    client.post(
        "/api/fitness-profile",
        json={
            "date_of_birth": "1990-01-01",
            "biological_sex": "male",
            "height_cm": 175,
            "weight_kg": 80,
            "training_experience": "intermediate",
            "primary_goal": "build_muscle",
            "training_days_per_week": 4,
            "preferred_workout_duration_minutes": 60,
            "training_environment": "gym",
        },
        headers=_auth_headers(token),
    )

    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])
    _create_config(client, token, routine["id"], day["id"])

    # Delete profile
    client.delete("/api/fitness-profile", headers=_auth_headers(token))

    # Routine and configs should still be accessible
    response = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    assert len(response.json()) == 1


# -- Invalid input preserves state ------------------------------------------


def test_invalid_target_type_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json={
            "exercise_slug": "barbell-bench-press",
            "target_type": "invalid_type",
            "sets": [{"target_value": 10}],
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    configs = client.get(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        headers=_auth_headers(token),
    ).json()
    assert len(configs) == 0


def test_unknown_fields_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json={
            "exercise_slug": "barbell-bench-press",
            "target_type": "repetitions",
            "sets": [{"target_value": 10}],
            "extra_field": "bad",
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 422


# -- Unauthenticated --------------------------------------------------------


def test_all_endpoints_require_auth(client: TestClient) -> None:
    assert client.get("/api/routines/1/days/1/exercises").status_code == 401
    assert (
        client.post(
            "/api/routines/1/days/1/exercises",
            json={
                "exercise_slug": "x",
                "target_type": "repetitions",
                "sets": [{"target_value": 1}],
            },
        ).status_code
        == 401
    )
    assert (
        client.put(
            "/api/routines/1/days/1/exercises/order",
            json={"exercise_configuration_ids": [1]},
        ).status_code
        == 401
    )
    assert (
        client.put(
            "/api/routines/1/days/1/exercises/1",
            json={"target_type": "repetitions", "sets": [{"target_value": 1}]},
        ).status_code
        == 401
    )
    assert client.delete("/api/routines/1/days/1/exercises/1").status_code == 401


# -- Timestamp refresh ------------------------------------------------------


def test_create_refreshes_parent_timestamps(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    original_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()

    _create_config(client, token, routine["id"], day["id"])

    updated_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()
    assert updated_routine["updated_at"] != original_routine["updated_at"]


def test_delete_refreshes_parent_timestamps(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])
    config = _create_config(client, token, routine["id"], day["id"])

    original_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()

    client.delete(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises/{config['id']}",
        headers=_auth_headers(token),
    )

    updated_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()
    assert updated_routine["updated_at"] != original_routine["updated_at"]


def test_reorder_refreshes_parent_timestamps(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])
    c1 = _create_config(client, token, routine["id"], day["id"], "barbell-bench-press")
    c2 = _create_config(client, token, routine["id"], day["id"], "barbell-back-squat")

    original_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()

    client.put(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises/order",
        json={"exercise_configuration_ids": [c2["id"], c1["id"]]},
        headers=_auth_headers(token),
    )

    updated_routine = client.get(
        f"/api/routines/{routine['id']}", headers=_auth_headers(token)
    ).json()
    assert updated_routine["updated_at"] != original_routine["updated_at"]


# -- Exercise not found ----------------------------------------------------


def test_unknown_exercise_slug_returns_404(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json={
            "exercise_slug": "nonexistent-exercise",
            "target_type": "repetitions",
            "sets": [{"target_value": 10}],
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


# -- Sets must be non-empty -------------------------------------------------


def test_zero_sets_rejected(client: TestClient) -> None:
    token, _ = _register(client)
    routine = _create_routine(client, token)
    day = _create_day(client, token, routine["id"])

    response = client.post(
        f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
        json={
            "exercise_slug": "barbell-bench-press",
            "target_type": "repetitions",
            "sets": [],
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 422


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


def test_f09_migration_fresh_database(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'fresh.db').as_posix()}"

    _run_alembic(database_url, "upgrade", "head")
    current = _run_alembic(database_url, "current").stdout
    heads = _run_alembic(database_url, "heads").stdout
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    schema = inspect(engine)

    assert "exercise_configurations" in schema.get_table_names()
    assert {col["name"] for col in schema.get_columns("exercise_configurations")} == {
        "id",
        "training_day_id",
        "exercise_id",
        "position",
        "target_type",
        "rest_after_exercise_seconds",
        "notes",
        "created_at",
        "updated_at",
    }
    assert any(
        c.get("name") == "uq_exercise_config_training_day_position"
        and set(c["column_names"]) == {"training_day_id", "position"}
        for c in schema.get_unique_constraints("exercise_configurations")
    )
    assert any(
        c.get("name") == "uq_exercise_config_training_day_exercise"
        and set(c["column_names"]) == {"training_day_id", "exercise_id"}
        for c in schema.get_unique_constraints("exercise_configurations")
    )
    foreign_keys = schema.get_foreign_keys("exercise_configurations")
    assert len(foreign_keys) == 2
    training_day_fk = next(fk for fk in foreign_keys if fk["referred_table"] == "training_days")
    assert training_day_fk["options"].get("ondelete") == "CASCADE"

    assert "configured_sets" in schema.get_table_names()
    assert {col["name"] for col in schema.get_columns("configured_sets")} == {
        "id",
        "exercise_configuration_id",
        "position",
        "target_value",
        "target_weight_kg",
        "target_rir",
        "eccentric_seconds",
        "stretched_pause_seconds",
        "concentric_seconds",
        "peak_contraction_seconds",
        "rest_after_set_seconds",
        "notes",
    }
    assert any(
        c.get("name") == "uq_configured_set_config_position"
        and set(c["column_names"]) == {"exercise_configuration_id", "position"}
        for c in schema.get_unique_constraints("configured_sets")
    )
    set_fks = schema.get_foreign_keys("configured_sets")
    assert len(set_fks) == 1
    assert set_fks[0]["options"].get("ondelete") == "CASCADE"

    set_columns = {column["name"]: column for column in schema.get_columns("configured_sets")}
    target_value_type = cast(Numeric[Any], set_columns["target_value"]["type"])
    target_weight_type = cast(Numeric[Any], set_columns["target_weight_kg"]["type"])
    assert target_value_type.precision == 8
    assert target_value_type.scale == 2
    assert target_weight_type.precision == 8
    assert target_weight_type.scale == 2

    # Exercise the database-level cascades directly, without ORM relationship handling.
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (email, password_hash, created_at) "
                "VALUES ('migration-cascade@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        user_id = connection.execute(
            text("SELECT id FROM users WHERE email = 'migration-cascade@example.com'")
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO routines "
                "(user_id, name, normalized_name, objective, description, created_at, updated_at) "
                "VALUES (:user_id, 'Cascade', 'cascade', 'build_muscle', NULL, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"user_id": user_id},
        )
        routine_id = connection.execute(
            text("SELECT id FROM routines WHERE normalized_name = 'cascade'")
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO training_days (routine_id, name, created_at, updated_at) "
                "VALUES (:routine_id, 'Push', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"routine_id": routine_id},
        )
        day_id = connection.execute(
            text("SELECT id FROM training_days WHERE routine_id = :routine_id"),
            {"routine_id": routine_id},
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO routine_schedule_assignments "
                "(routine_id, training_day_id, week_position) "
                "VALUES (:routine_id, :day_id, 1)"
            ),
            {"routine_id": routine_id, "day_id": day_id},
        )
        exercise_id = connection.execute(
            text("SELECT id FROM exercises WHERE slug = 'barbell-bench-press'")
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO exercise_configurations "
                "(training_day_id, exercise_id, position, target_type, created_at, updated_at) "
                "VALUES (:day_id, :exercise_id, 1, 'repetitions', CURRENT_TIMESTAMP, "
                "CURRENT_TIMESTAMP)"
            ),
            {"day_id": day_id, "exercise_id": exercise_id},
        )
        config_id = connection.execute(
            text("SELECT id FROM exercise_configurations WHERE training_day_id = :day_id"),
            {"day_id": day_id},
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO configured_sets "
                "(exercise_configuration_id, position, target_value) "
                "VALUES (:config_id, 1, 10)"
            ),
            {"config_id": config_id},
        )
        connection.execute(text("DELETE FROM training_days WHERE id = :day_id"), {"day_id": day_id})
        assert (
            connection.execute(
                text(
                    "SELECT COUNT(*) FROM exercise_configurations WHERE training_day_id = :day_id"
                ),
                {"day_id": day_id},
            ).scalar_one()
            == 0
        )
        assert (
            connection.execute(
                text(
                    "SELECT COUNT(*) FROM configured_sets "
                    "WHERE exercise_configuration_id = :config_id"
                ),
                {"config_id": config_id},
            ).scalar_one()
            == 0
        )

    assert LATEST_REVISION in current
    assert LATEST_REVISION in heads
    engine.dispose()


def test_f09_migration_upgrade_and_real_api_flow(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    before_engine = create_engine(database_url)
    assert "exercise_configurations" not in inspect(before_engine).get_table_names()
    assert "configured_sets" not in inspect(before_engine).get_table_names()
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
            routine = _create_routine(migrated_client, token, "Migrated")
            day = _create_day(migrated_client, token, routine["id"], "Push")

            config = _create_config(migrated_client, token, routine["id"], day["id"])
            assert config["exercise"]["slug"] == "barbell-bench-press"
            assert len(config["sets"]) == 3

            response = migrated_client.get(
                f"/api/routines/{routine['id']}/days/{day['id']}/exercises",
                headers=_auth_headers(token),
            )
            assert response.status_code == 200
            assert response.json() == [config]
    finally:
        app.dependency_overrides.clear()
        migrated_engine.dispose()
