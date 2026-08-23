"""Behavioural tests for F23 body weight progress (chart, comparison, filtered history)."""

from typing import Any, cast

from fastapi.testclient import TestClient


def _register(client: TestClient, email: str = "bwp@example.com") -> tuple[str, int]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-secure-password-15"},
    )
    assert response.status_code == 201
    token = response.cookies.get("auth_token")
    assert token is not None
    return token, cast(int, response.json()["id"])


def _profile_payload(current_local_date: str) -> dict[str, object]:
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


def _create_profile(client: TestClient, token: str, current_local_date: str) -> None:
    response = client.post(
        "/api/fitness-profile",
        json=_profile_payload(current_local_date),
        cookies={"auth_token": token},
    )
    assert response.status_code == 201


def _delete(client: TestClient, token: str, measurement_date: str) -> None:
    response = client.delete(
        f"/api/body-weight-measurements/{measurement_date}",
        cookies={"auth_token": token},
    )
    assert response.status_code == 204


def _upsert(
    client: TestClient,
    token: str,
    measurement_date: str,
    weight_kg: float,
    note: str | None = None,
    current_local_date: str = "2026-08-15",
) -> int:
    body: dict[str, object] = {"current_local_date": current_local_date, "weight_kg": weight_kg}
    if note is not None:
        body["note"] = note
    response = client.put(
        f"/api/body-weight-measurements/{measurement_date}",
        json=body,
        cookies={"auth_token": token},
    )
    status_code: int = response.status_code
    assert status_code in (200, 201)
    return status_code


def _chart(client: TestClient, token: str, period: str, local_date: str) -> dict[str, Any]:
    response = client.get(
        f"/api/progress/body-weight?period={period}&local_date={local_date}",
        cookies={"auth_token": token},
    )
    assert response.status_code == 200
    return cast(dict[str, Any], response.json())


def _list(client: TestClient, token: str, query: str = "") -> dict[str, Any]:
    response = client.get(
        f"/api/body-weight-measurements{query}",
        cookies={"auth_token": token},
    )
    assert response.status_code == 200
    return cast(dict[str, Any], response.json())


def _onboard_clean(client: TestClient, token: str, current_local_date: str = "2026-08-15") -> None:
    """Create a profile and remove its onboarding measurement for a clean slate."""
    _create_profile(client, token, current_local_date)
    _delete(client, token, current_local_date)


# ---------------------------------------------------------------------------
# chart projection
# ---------------------------------------------------------------------------


def test_chart_oldest_first_with_summary(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2026-06-01", 80.0)
    _upsert(client, token, "2026-07-01", 79.5)
    _upsert(client, token, "2026-08-14", 79.0, note="morning")

    data = _chart(client, token, "3m", "2026-08-15")

    assert data["period"] == "3m"
    assert data["range_start"] == "2026-05-15"
    assert data["range_end"] == "2026-08-15"
    assert [item["measurement_date"] for item in data["items"]] == [
        "2026-06-01",
        "2026-07-01",
        "2026-08-14",
    ]
    assert data["items"][2]["note"] == "morning"
    assert data["summary"] == {
        "latest": {"measurement_date": "2026-08-14", "weight_kg": 79.0},
        "previous": {"measurement_date": "2026-07-01", "weight_kg": 79.5},
        "change_kg": -0.5,
    }


def test_chart_period_bounds_and_end_of_month_clamp(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token, "2026-03-31")

    data = _chart(client, token, "1m", "2026-03-31")
    assert data["range_start"] == "2026-02-28"
    assert data["range_end"] == "2026-03-31"

    data = _chart(client, token, "1y", "2024-02-29")
    assert data["range_start"] == "2023-02-28"
    assert data["range_end"] == "2024-02-29"


def test_chart_includes_inclusive_range_boundaries(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    # 3m from 2026-08-15 -> lower bound 2026-05-15 and upper bound 2026-08-15 are inclusive.
    _upsert(client, token, "2026-05-15", 82.0)
    _upsert(client, token, "2026-08-15", 81.0)

    data = _chart(client, token, "3m", "2026-08-15")
    assert data["range_start"] == "2026-05-15"
    assert data["range_end"] == "2026-08-15"
    assert [item["measurement_date"] for item in data["items"]] == ["2026-05-15", "2026-08-15"]


def test_chart_all_has_null_start(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2024-01-01", 90.0)
    _upsert(client, token, "2026-08-14", 80.0)

    data = _chart(client, token, "all", "2026-08-15")
    assert data["range_start"] is None
    assert data["range_end"] == "2026-08-15"
    assert [item["measurement_date"] for item in data["items"]] == ["2024-01-01", "2026-08-14"]


def test_chart_single_measurement_and_empty(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2026-08-14", 80.0)

    data = _chart(client, token, "3m", "2026-08-15")
    assert len(data["items"]) == 1
    assert data["summary"]["latest"] == {"measurement_date": "2026-08-14", "weight_kg": 80.0}
    assert data["summary"]["previous"] is None
    assert data["summary"]["change_kg"] is None

    # A measurement older than the selected window yields an empty period.
    _upsert(client, token, "2026-05-01", 85.0)
    empty = _chart(client, token, "3m", "2026-08-15")
    assert [item["measurement_date"] for item in empty["items"]] == ["2026-08-14"]


def test_chart_empty_period_has_null_summary(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2026-05-01", 85.0)

    empty = _chart(client, token, "3m", "2026-08-15")
    assert empty["items"] == []
    assert empty["summary"] == {"latest": None, "previous": None, "change_kg": None}


def test_chart_global_current_weight_stays_out_of_period(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2024-01-01", 90.0)

    # 1M period is empty even though a global measurement exists.
    data = _chart(client, token, "1m", "2026-08-15")
    assert data["items"] == []

    # Current weight (from history) remains the global latest measurement.
    history = _list(client, token, "?period=1m&local_date=2026-08-15")
    assert history["current_weight"]["measurement_date"] == "2024-01-01"
    assert history["current_weight"]["weight_kg"] == 90.0


def test_chart_positive_difference(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2026-08-10", 80.0)
    _upsert(client, token, "2026-08-14", 80.6)

    data = _chart(client, token, "3m", "2026-08-15")
    assert data["summary"]["change_kg"] == 0.6


def test_chart_zero_difference(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2026-08-10", 80.0)
    _upsert(client, token, "2026-08-14", 80.0)

    data = _chart(client, token, "3m", "2026-08-15")
    assert data["summary"]["latest"]["measurement_date"] == "2026-08-14"
    assert data["summary"]["previous"]["measurement_date"] == "2026-08-10"
    assert data["summary"]["change_kg"] == 0.0


def test_chart_decimal_rounding_to_one_decimal(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2026-08-10", 80.4)
    _upsert(client, token, "2026-08-14", 80.0)

    data = _chart(client, token, "3m", "2026-08-15")
    assert data["summary"]["change_kg"] == -0.4


# ---------------------------------------------------------------------------
# filtered history and cursor binding
# ---------------------------------------------------------------------------


def test_filtered_history_newest_first(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)

    for day in range(1, 13):
        _upsert(client, token, f"2026-08-{day:02d}", 80.0 + day)

    _upsert(client, token, "2026-01-15", 70.0)
    _upsert(client, token, "2026-06-01", 75.0)

    data = _list(client, token, "?period=1m&local_date=2026-08-15")
    dates = [item["measurement_date"] for item in data["items"]]
    assert dates == [f"2026-08-{day:02d}" for day in range(12, 7, -1)]
    assert data["next_cursor"] is not None

    second = _list(client, token, f"?period=1m&local_date=2026-08-15&cursor={data['next_cursor']}")
    second_dates = [item["measurement_date"] for item in second["items"]]
    assert second_dates == [f"2026-08-{day:02d}" for day in range(7, 2, -1)]
    assert second["next_cursor"] is not None

    third = _list(client, token, f"?period=1m&local_date=2026-08-15&cursor={second['next_cursor']}")
    third_dates = [item["measurement_date"] for item in third["items"]]
    assert third_dates == [f"2026-08-{day:02d}" for day in range(2, 0, -1)]
    assert third["next_cursor"] is None

    combined = dates + second_dates + third_dates
    assert combined == sorted(combined, reverse=True)
    assert len(set(combined)) == 12


def test_filtered_history_requires_both_period_and_local_date(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token, "2026-08-15")

    assert (
        client.get(
            "/api/body-weight-measurements?period=3m", cookies={"auth_token": token}
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/body-weight-measurements?local_date=2026-08-15",
            cookies={"auth_token": token},
        ).status_code
        == 422
    )


def test_cursor_bound_to_period_and_local_date(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    for day in range(1, 13):
        _upsert(client, token, f"2026-08-{day:02d}", 80.0 + day)

    first = _list(client, token, "?period=1m&local_date=2026-08-15")
    cursor = first["next_cursor"]
    assert cursor is not None

    # Reuse across a different period or local date is rejected.
    assert (
        client.get(
            f"/api/body-weight-measurements?period=3m&local_date=2026-08-15&cursor={cursor}",
            cookies={"auth_token": token},
        ).status_code
        == 422
    )
    assert (
        client.get(
            f"/api/body-weight-measurements?period=1m&local_date=2026-08-14&cursor={cursor}",
            cookies={"auth_token": token},
        ).status_code
        == 422
    )
    # Reuse across a different user is rejected.
    token_b, _user_b = _register(client, "other-cursor@example.com")
    _onboard_clean(client, token_b)
    assert (
        client.get(
            f"/api/body-weight-measurements?period=1m&local_date=2026-08-15&cursor={cursor}",
            cookies={"auth_token": token_b},
        ).status_code
        == 422
    )


def test_same_date_replacement_changes_chart_point_without_duplicate(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2026-08-12", 82.5)
    _upsert(client, token, "2026-08-12", 83.0)

    data = _chart(client, token, "3m", "2026-08-15")
    dates = [item["measurement_date"] for item in data["items"]]
    assert dates == ["2026-08-12"]
    assert data["items"][0]["weight_kg"] == 83.0
    assert len(data["items"]) == 1


def test_deletion_removes_chart_point(client: TestClient) -> None:
    token, _user_id = _register(client)
    _onboard_clean(client, token)
    _upsert(client, token, "2026-08-12", 80.0)
    _upsert(client, token, "2026-08-14", 79.0)

    _delete(client, token, "2026-08-14")

    data = _chart(client, token, "3m", "2026-08-15")
    assert [item["measurement_date"] for item in data["items"]] == ["2026-08-12"]
    assert data["summary"]["latest"] == {"measurement_date": "2026-08-12", "weight_kg": 80.0}
    assert data["summary"]["change_kg"] is None


# ---------------------------------------------------------------------------
# validation and ownership
# ---------------------------------------------------------------------------


def test_chart_strict_parameters(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token, "2026-08-15")

    for query in (
        "?period=3M&local_date=2026-08-15",
        "?period=3m&local_date=2026-08-15&local_date=2026-08-14",
        "?period=bogus&local_date=2026-08-15",
        "?period=3m&local_date=2026-08-32",
        "?period=3m",
        "?local_date=2026-08-15",
        "?period=3m&local_date=2026-08-15&extra=1",
    ):
        assert (
            client.get(
                f"/api/progress/body-weight{query}",
                cookies={"auth_token": token},
            ).status_code
            == 422
        )


def test_chart_requires_profile(client: TestClient) -> None:
    token, _user_id = _register(client)

    assert (
        client.get(
            "/api/progress/body-weight?period=3m&local_date=2026-08-15",
            cookies={"auth_token": token},
        ).status_code
        == 404
    )


def test_chart_unauthenticated(client: TestClient) -> None:
    assert (
        client.get("/api/progress/body-weight?period=3m&local_date=2026-08-15").status_code == 401
    )


def test_chart_is_user_owned(client: TestClient) -> None:
    token_a, _user_a = _register(client, "chart-owner@example.com")
    _onboard_clean(client, token_a)
    _upsert(client, token_a, "2026-08-12", 80.0)

    token_b, _user_b = _register(client, "chart-other@example.com")
    _onboard_clean(client, token_b)
    _upsert(client, token_b, "2026-08-13", 70.0)

    data_a = _chart(client, token_a, "3m", "2026-08-15")
    assert [item["measurement_date"] for item in data_a["items"]] == ["2026-08-12"]

    data_b = _chart(client, token_b, "3m", "2026-08-15")
    assert [item["measurement_date"] for item in data_b["items"]] == ["2026-08-13"]
