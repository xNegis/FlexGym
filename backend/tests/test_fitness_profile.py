"""Basic behavioural tests for F03 fitness profile (creation + retrieval) and
F04 profile management (update + deletion)."""

from typing import cast

from fastapi.testclient import TestClient


def _register(client: TestClient, email: str = "profile@example.com") -> tuple[str, int]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-secure-password-15"},
    )
    assert response.status_code == 201
    token = response.cookies.get("flexgym_token")
    assert token is not None
    return token, response.json()["id"]


_VALID_PROFILE = {
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
    "physical_limitations": "Previous left shoulder irritation",
}


def _create_profile(client: TestClient, token: str) -> dict[str, object]:
    response = client.post(
        "/api/fitness-profile",
        json=_VALID_PROFILE,
        cookies={"flexgym_token": token},
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


# ---------------------------------------------------------------------------
# F03 tests (unchanged)
# ---------------------------------------------------------------------------


def test_create_and_retrieve_profile(client: TestClient) -> None:
    token, _user_id = _register(client)

    created = client.post(
        "/api/fitness-profile",
        json=_VALID_PROFILE,
        cookies={"flexgym_token": token},
    )
    assert created.status_code == 201
    data = created.json()
    assert data["biological_sex"] == "male"
    assert data["height_cm"] == 178.5
    assert data["weight_kg"] == 81.2
    assert data["body_fat_percentage"] == 17.5
    assert data["training_days_per_week"] == 4
    assert data["preferred_workout_duration_minutes"] == 60
    assert data["physical_limitations"] == "Previous left shoulder irritation"
    assert isinstance(data["id"], int)
    assert "created_at" in data
    assert "updated_at" in data
    assert "user_id" not in data

    retrieved = client.get(
        "/api/fitness-profile",
        cookies={"flexgym_token": token},
    )
    assert retrieved.status_code == 200
    assert retrieved.json() == data


def test_unauthenticated_access(client: TestClient) -> None:
    assert client.get("/api/fitness-profile").status_code == 401
    assert client.post("/api/fitness-profile", json=_VALID_PROFILE).status_code == 401


def test_missing_profile(client: TestClient) -> None:
    token, _user_id = _register(client)

    response = client.get("/api/fitness-profile", cookies={"flexgym_token": token})
    assert response.status_code == 404
    assert response.json() == {"detail": "Fitness profile not found"}


def test_duplicate_creation_preserves_original(client: TestClient) -> None:
    token, _user_id = _register(client)

    first = client.post(
        "/api/fitness-profile",
        json=_VALID_PROFILE,
        cookies={"flexgym_token": token},
    )
    assert first.status_code == 201
    first_data = first.json()

    second = client.post(
        "/api/fitness-profile",
        json={**_VALID_PROFILE, "height_cm": 180.0},
        cookies={"flexgym_token": token},
    )
    assert second.status_code == 409
    assert second.json() == {"detail": "Fitness profile already exists"}

    retrieved = client.get(
        "/api/fitness-profile",
        cookies={"flexgym_token": token},
    )
    assert retrieved.status_code == 200
    assert retrieved.json() == first_data


def test_invalid_payload_rejected_without_persistence(client: TestClient) -> None:
    token, _user_id = _register(client)

    response = client.post(
        "/api/fitness-profile",
        json={**_VALID_PROFILE, "height_cm": 999},
        cookies={"flexgym_token": token},
    )
    assert response.status_code == 422

    check = client.get(
        "/api/fitness-profile",
        cookies={"flexgym_token": token},
    )
    assert check.status_code == 404


# ---------------------------------------------------------------------------
# F04 tests
# ---------------------------------------------------------------------------


def test_update_and_retrieve_profile(client: TestClient) -> None:
    token, _user_id = _register(client)
    original = _create_profile(client, token)

    updated_payload = {
        **_VALID_PROFILE,
        "height_cm": 180.0,
        "weight_kg": 79.5,
        "body_fat_percentage": 15.0,
        "primary_goal": "lose_fat",
        "physical_limitations": None,
    }

    response = client.put(
        "/api/fitness-profile",
        json=updated_payload,
        cookies={"flexgym_token": token},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["id"] == original["id"]
    assert data["created_at"] == original["created_at"]
    assert data["updated_at"] != original["updated_at"]

    assert data["height_cm"] == 180.0
    assert data["weight_kg"] == 79.5
    assert data["body_fat_percentage"] == 15.0
    assert data["primary_goal"] == "lose_fat"
    assert data["physical_limitations"] is None

    retrieved = client.get(
        "/api/fitness-profile",
        cookies={"flexgym_token": token},
    )
    assert retrieved.status_code == 200
    assert retrieved.json() == data


def test_invalid_update_preserves_original(client: TestClient) -> None:
    token, _user_id = _register(client)
    original = _create_profile(client, token)

    response = client.put(
        "/api/fitness-profile",
        json={**_VALID_PROFILE, "height_cm": 999},
        cookies={"flexgym_token": token},
    )
    assert response.status_code == 422

    retrieved = client.get(
        "/api/fitness-profile",
        cookies={"flexgym_token": token},
    )
    assert retrieved.status_code == 200
    assert retrieved.json() == original


def test_delete_and_subsequent_missing_profile(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    delete_response = client.delete(
        "/api/fitness-profile",
        cookies={"flexgym_token": token},
    )
    assert delete_response.status_code == 204
    assert delete_response.content == b""

    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/fitness-profile").status_code == 401

    login_response = client.post(
        "/api/auth/login",
        json={"email": "profile@example.com", "password": "a-secure-password-15"},
    )
    assert login_response.status_code == 200

    create_response = client.post(
        "/api/fitness-profile",
        json=_VALID_PROFILE,
    )
    assert create_response.status_code == 201


def test_update_requires_explicit_optional_fields(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    payload = {**_VALID_PROFILE}
    del payload["body_fat_percentage"]
    response = client.put(
        "/api/fitness-profile",
        json=payload,
        cookies={"flexgym_token": token},
    )
    assert response.status_code == 422


def test_update_missing_profile(client: TestClient) -> None:
    token, _user_id = _register(client)

    response = client.put(
        "/api/fitness-profile",
        json=_VALID_PROFILE,
        cookies={"flexgym_token": token},
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Fitness profile not found"}


def test_delete_missing_profile(client: TestClient) -> None:
    token, _user_id = _register(client)

    response = client.delete(
        "/api/fitness-profile",
        cookies={"flexgym_token": token},
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Fitness profile not found"}


def test_unauthenticated_update_and_delete(client: TestClient) -> None:
    assert client.put("/api/fitness-profile", json=_VALID_PROFILE).status_code == 401
    assert client.delete("/api/fitness-profile").status_code == 401
