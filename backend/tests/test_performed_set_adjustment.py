"""Tests for F25 — Performed Set Adjustment Reliability."""

from __future__ import annotations

from typing import Any, cast

import pytest
from fastapi.testclient import TestClient

from app.models import Exercise
from app.services import workout_service


@pytest.fixture(autouse=True)
def seed_f25_exercises(test_session_factory: Any) -> None:
    with test_session_factory() as session:
        session.add(
            Exercise(
                slug="f25-bench-press",
                name="F25 Bench Press",
                primary_muscle="chest",
                secondary_muscles=["triceps"],
                equipment="barbell",
                movement_pattern="horizontal_push",
                execution_type="bilateral",
                instructions="Press the bar with control.",
            )
        )
        session.commit()


def _register(client: TestClient, email: str = "f25@example.com") -> tuple[str, int]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-secure-password-15"},
    )
    assert response.status_code == 201
    token = response.cookies.get("auth_token")
    assert token is not None
    return token, response.json()["id"]


def _headers(token: str) -> dict[str, str]:
    return {"Cookie": f"auth_token={token}"}


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


def _configure(
    client: TestClient,
    token: str,
    routine_id: int,
    day_id: int,
    target_type: str = "repetitions",
    target_weight_kg: float | None = 42.5,
    target_value: float = 10,
) -> None:
    response = client.post(
        f"/api/routines/{routine_id}/days/{day_id}/exercises",
        headers=_headers(token),
        json={
            "exercise_slug": "f25-bench-press",
            "target_type": target_type,
            "rest_after_exercise_seconds": 120,
            "notes": None,
            "sets": [
                {
                    "target_value": target_value,
                    "target_weight_kg": target_weight_kg,
                    "target_rir": 2,
                    "tempo": None,
                    "rest_after_set_seconds": 90,
                    "notes": None,
                }
            ],
        },
    )
    assert response.status_code == 201, response.text


def _activate(client: TestClient, token: str, routine_id: int) -> None:
    response = client.put(
        "/api/active-routine",
        json={"routine_id": routine_id},
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _ready_plan(
    client: TestClient,
    token: str,
    name: str,
    target_type: str = "repetitions",
    target_weight_kg: float | None = 42.5,
    target_value: float = 10,
) -> tuple[int, int]:
    routine = _create_routine(client, token, name)
    day = _create_day(client, token, routine["id"], "Push")
    _configure(
        client,
        token,
        routine["id"],
        day["id"],
        target_type=target_type,
        target_weight_kg=target_weight_kg,
        target_value=target_value,
    )
    _activate(client, token, routine["id"])
    return routine["id"], day["id"]


def _start(client: TestClient, token: str, day_id: int) -> int:
    response = client.post(
        "/api/workouts",
        json={"training_day_id": day_id, "local_date": "2026-08-10"},
        headers=_headers(token),
    )
    assert response.status_code == 201, response.text
    return cast(int, response.json()["id"])


def _start_exercise(client: TestClient, token: str, workout_id: int) -> None:
    response = client.post(
        f"/api/workouts/{workout_id}/exercises/1/start",
        headers=_headers(token),
    )
    assert response.status_code == 200, response.text


def _performance(
    client: TestClient,
    token: str,
    workout_id: int,
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
        f"/api/workouts/{workout_id}/exercises/1/sets/1/performance",
        json=body,
        headers=_headers(token),
    )


def test_adjusted_completion_with_null_planned_weight_decimal(client: TestClient) -> None:
    """A null-planned-weight set records an adjusted positive decimal weight."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, "Null-Weight Plan", target_weight_kg=None)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id)

    response = _performance(
        client, token, workout_id, entry_mode="adjusted", value=10, weight=12.5, rir=1
    )
    assert response.status_code == 200, response.text
    perf = response.json()["exercises"][0]["planned_sets"][0]["performance"]
    assert perf["performed_value"] == 10.0
    assert perf["performed_weight_kg"] == 12.5
    assert perf["performed_rir"] == 1
    assert perf["entry_mode"] == "adjusted"


def test_adjusted_non_finite_and_invalid_rejection_preserves_state(client: TestClient) -> None:
    """Direct invalid adjusted bodies are rejected without mutating projection or timeline."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, "Reject Plan")
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id)

    before = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()

    # Invalid whole-number repetitions.
    fractional = _performance(
        client, token, workout_id, entry_mode="adjusted", value=10.5, weight=12.5, rir=1
    )
    assert fractional.status_code == 422

    # Over-precision weight.
    precision = _performance(
        client, token, workout_id, entry_mode="adjusted", value=10, weight=12.345, rir=1
    )
    assert precision.status_code == 422

    # Out-of-range weight and repetitions.
    range_weight = _performance(
        client, token, workout_id, entry_mode="adjusted", value=10, weight=5001, rir=1
    )
    assert range_weight.status_code == 422
    range_reps = _performance(
        client, token, workout_id, entry_mode="adjusted", value=1001, weight=12.5, rir=1
    )
    assert range_reps.status_code == 422

    # Invalid RIR.
    rir = _performance(
        client, token, workout_id, entry_mode="adjusted", value=10, weight=12.5, rir=11
    )
    assert rir.status_code == 422

    after = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert after["exercises"][0]["planned_sets"][0]["performance"] is None
    assert after["events"] == before["events"]


def test_valid_two_decimal_values_and_invalid_third_decimal(client: TestClient) -> None:
    """Binary-float artifacts do not reject valid distance/weight precision."""
    token, _ = _register(client)
    _, day_id = _ready_plan(
        client,
        token,
        "Decimal Precision Plan",
        target_type="distance_meters",
        target_weight_kg=None,
        target_value=1,
    )
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id)

    valid = _performance(
        client, token, workout_id, entry_mode="adjusted", value=0.29, weight=2.55, rir=1
    )
    assert valid.status_code == 200, valid.text
    performance = valid.json()["exercises"][0]["planned_sets"][0]["performance"]
    assert performance["performed_value"] == 0.29
    assert performance["performed_weight_kg"] == 2.55

    before_invalid = valid.json()
    invalid_distance = _performance(
        client, token, workout_id, entry_mode="adjusted", value=0.291, weight=2.55, rir=1
    )
    assert invalid_distance.status_code == 422
    invalid_weight = _performance(
        client, token, workout_id, entry_mode="adjusted", value=0.29, weight=2.555, rir=1
    )
    assert invalid_weight.status_code == 422

    after_invalid = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert after_invalid["exercises"][0]["planned_sets"][0]["performance"] == performance
    assert after_invalid["events"] == before_invalid["events"]


def test_non_finite_json_is_rejected_at_endpoint_without_mutation(client: TestClient) -> None:
    """The public endpoint rejects non-standard non-finite JSON numeric values safely."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, "Non-finite Plan")
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id)
    before = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()

    response = client.put(
        f"/api/workouts/{workout_id}/exercises/1/sets/1/performance",
        content=(
            '{"entry_mode":"adjusted","performed_value":NaN,'
            '"performed_weight_kg":Infinity,"performed_rir":1}'
        ),
        headers={**_headers(token), "Content-Type": "application/json"},
    )
    assert response.status_code == 422

    after = client.get(f"/api/workouts/{workout_id}", headers=_headers(token)).json()
    assert after["exercises"][0]["planned_sets"][0]["performance"] is None
    assert after["events"] == before["events"]


def test_service_finite_validation_rejects_non_finite() -> None:
    """The domain validation layer rejects non-finite performed values before persistence."""
    with pytest.raises(workout_service.ExecutionError):
        workout_service._validate_performed_value("repetitions", float("inf"))
    with pytest.raises(workout_service.ExecutionError):
        workout_service._validate_performed_value("repetitions", float("nan"))
    with pytest.raises(workout_service.ExecutionError):
        workout_service._validate_performed_weight(float("inf"))
    with pytest.raises(workout_service.ExecutionError):
        workout_service._validate_performed_weight(float("nan"))


def test_nullable_optional_and_zero_remain_valid_facts(client: TestClient) -> None:
    """Null optional weight/RIR and explicit zero are both valid performed facts."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, "Nullable Plan")
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id)

    nulls = _performance(
        client, token, workout_id, entry_mode="adjusted", value=10, weight=None, rir=None
    )
    assert nulls.status_code == 200, nulls.text
    perf = nulls.json()["exercises"][0]["planned_sets"][0]["performance"]
    assert perf["performed_weight_kg"] is None
    assert perf["performed_rir"] is None

    zeros = _performance(client, token, workout_id, entry_mode="adjusted", value=8, weight=0, rir=0)
    assert zeros.status_code == 200, zeros.text
    perf2 = zeros.json()["exercises"][0]["planned_sets"][0]["performance"]
    assert perf2["performed_weight_kg"] == 0.0
    assert perf2["performed_rir"] == 0


def test_completed_set_update_preserves_timestamps_and_appends_set_updated(
    client: TestClient,
) -> None:
    """Editing a completed set keeps start/completion timestamps and appends set_updated."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, "Update Plan")
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id)

    first = _performance(client, token, workout_id, entry_mode="as_planned")
    assert first.status_code == 200, first.text
    original = first.json()["exercises"][0]["planned_sets"][0]["performance"]

    update = _performance(
        client, token, workout_id, entry_mode="adjusted", value=12, weight=45.5, rir=0
    )
    assert update.status_code == 200, update.text
    updated = update.json()["exercises"][0]["planned_sets"][0]["performance"]

    assert updated["performed_weight_kg"] == 45.5
    assert updated["set_started_at"] == original["set_started_at"]
    assert updated["completed_at"] == original["completed_at"]
    assert updated["updated_at"] != original["updated_at"]

    set_updated = [e for e in update.json()["events"] if e["event_type"] == "set_updated"]
    assert len(set_updated) == 1
    assert set_updated[0]["exercise_position"] == 1
    assert set_updated[0]["set_position"] == 1


def test_progress_exposes_confirmed_decimal_weight(client: TestClient) -> None:
    """A terminal positive-weight repetition set appears in Progress history and chart."""
    token, _ = _register(client)
    _, day_id = _ready_plan(client, token, "Progress Plan", target_weight_kg=None)
    workout_id = _start(client, token, day_id)
    _start_exercise(client, token, workout_id)

    done = _performance(
        client, token, workout_id, entry_mode="adjusted", value=10, weight=12.5, rir=1
    )
    assert done.status_code == 200, done.text
    completed = client.post(f"/api/workouts/{workout_id}/complete", headers=_headers(token))
    assert completed.status_code == 200, completed.text

    history = client.get(
        "/api/progress/exercises/f25-bench-press/history?period=all&local_date=2026-08-31",
        headers=_headers(token),
    )
    assert history.status_code == 200, history.text
    session = history.json()["items"][0]
    assert session["sets"][0]["performed_weight_kg"] == 12.5
    assert session["sets"][0]["performed_reps"] == 10
    assert session["heaviest_weight_kg"] == 12.5

    chart = client.get(
        "/api/progress/exercises/f25-bench-press/chart?period=all&local_date=2026-08-31",
        headers=_headers(token),
    )
    assert chart.status_code == 200, chart.text
    point = chart.json()["items"][0]
    assert point["heaviest_weight_kg"] == 12.5
    assert abs(point["estimated_1rm_kg"] - 12.5 * (1 + 10 / 30)) <= 0.005001
