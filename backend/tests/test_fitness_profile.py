"""Basic behavioural tests for F03 fitness profile."""

from fastapi.testclient import TestClient


def _register(client: TestClient) -> tuple[str, int]:
    response = client.post(
        "/api/auth/register",
        json={"email": "profile@example.com", "password": "a-secure-password-15"},
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
