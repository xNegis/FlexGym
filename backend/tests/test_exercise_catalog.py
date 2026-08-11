"""Tests for F05 exercise catalog."""

import json
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session


@pytest.fixture(autouse=True)
def seed_exercises(
    test_session_factory: Callable[..., Session],
) -> None:
    session = test_session_factory()
    count: int | None = session.execute(text("SELECT COUNT(*) FROM exercises")).scalar()
    if count is not None and count > 0:
        session.close()
        return

    from app.exercise_data import EXERCISE_SEED_DATA

    for (
        slug,
        name,
        primary_muscle,
        sec_muscles,
        equipment,
        movement_pattern,
        execution_type,
        instructions,
    ) in EXERCISE_SEED_DATA:  # noqa: E501
        session.execute(
            text(
                "INSERT OR IGNORE INTO exercises "
                "(slug, name, primary_muscle, secondary_muscles, equipment, "
                "movement_pattern, execution_type, instructions) "
                "VALUES (:slug, :name, :primary_muscle, :secondary_muscles, "
                ":equipment, :movement_pattern, :execution_type, :instructions)"
            ),
            {
                "slug": slug,
                "name": name,
                "primary_muscle": primary_muscle,
                "secondary_muscles": json.dumps(sec_muscles),
                "equipment": equipment,
                "movement_pattern": movement_pattern,
                "execution_type": execution_type,
                "instructions": instructions,
            },
        )
    session.commit()
    session.close()


def _register(client: TestClient, email: str = "catalog@example.com") -> tuple[str, int]:
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


def test_catalog_contains_74_exercises(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 74

    slugs = {e["slug"] for e in data}
    names = {e["name"] for e in data}
    assert len(slugs) == 74
    assert len(names) == 74


def test_catalog_returns_summary_shape(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.json()

    bench = next(e for e in data if e["slug"] == "barbell-bench-press")
    assert bench == {
        "slug": "barbell-bench-press",
        "name": "Barbell Bench Press",
        "primary_muscle": "chest",
        "secondary_muscles": ["triceps", "shoulders"],
        "equipment": "barbell",
        "movement_pattern": "horizontal_push",
        "execution_type": "bilateral",
    }
    assert "id" not in bench
    assert "instructions" not in bench


def test_catalog_alphabetical_order(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.json()

    names = [e["name"] for e in data]
    lower_names = [n.lower() for n in names]
    assert lower_names == sorted(lower_names)

    pull_idx = names.index("Pull-Up")
    push_idx = names.index("Push-Up")
    assert pull_idx < push_idx


def test_representative_records(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises", headers=_auth_headers(token))
    data = response.json()
    by_slug = {e["slug"]: e for e in data}

    bench = by_slug["barbell-bench-press"]
    assert bench["primary_muscle"] == "chest"
    assert bench["movement_pattern"] == "horizontal_push"

    pullup = by_slug["pull-up"]
    assert pullup["primary_muscle"] == "lats"
    assert "biceps" in pullup["secondary_muscles"]

    ohp = by_slug["barbell-overhead-press"]
    assert ohp["primary_muscle"] == "shoulders"
    assert ohp["movement_pattern"] == "vertical_push"

    curl = by_slug["dumbbell-curl"]
    assert curl["primary_muscle"] == "biceps"
    assert curl["movement_pattern"] == "elbow_flexion"

    pushdown = by_slug["cable-triceps-pushdown"]
    assert pushdown["primary_muscle"] == "triceps"

    squat = by_slug["barbell-back-squat"]
    assert squat["primary_muscle"] == "quadriceps"
    assert squat["movement_pattern"] == "squat"

    rdl = by_slug["barbell-romanian-deadlift"]
    assert rdl["primary_muscle"] == "hamstrings"
    assert rdl["movement_pattern"] == "hinge"

    deadlift = by_slug["conventional-deadlift"]
    assert deadlift["primary_muscle"] == "glutes"

    calf = by_slug["standing-calf-raise"]
    assert calf["primary_muscle"] == "calves"

    plank = by_slug["plank"]
    assert plank["primary_muscle"] == "core"
    assert plank["execution_type"] == "isometric"

    farmer = by_slug["farmers-carry"]
    assert farmer["primary_muscle"] == "full_body"
    assert farmer["movement_pattern"] == "carry"


def test_empty_secondary_muscles(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises", headers=_auth_headers(token))
    data = response.json()

    lateral = next(e for e in data if e["slug"] == "dumbbell-lateral-raise")
    assert lateral["secondary_muscles"] == []


def test_search_name_substring(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises?search=curl", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.json()

    for e in data:
        assert "curl" in e["name"].lower()


def test_search_case_insensitive(client: TestClient) -> None:
    token, _ = _register(client)

    lower = client.get("/api/exercises?search=SQUAT", headers=_auth_headers(token)).json()
    upper = client.get("/api/exercises?search=squat", headers=_auth_headers(token)).json()
    assert lower == upper


def test_search_trims_whitespace(client: TestClient) -> None:
    token, _ = _register(client)

    trimmed = client.get("/api/exercises?search=  squat  ", headers=_auth_headers(token)).json()
    untrimmed = client.get("/api/exercises?search=squat", headers=_auth_headers(token)).json()
    assert trimmed == untrimmed


def test_filter_by_primary_muscle(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises?primary_muscle=chest", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.json()

    for e in data:
        assert e["primary_muscle"] == "chest"


def test_filter_by_equipment(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises?equipment=dumbbell", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.json()

    for e in data:
        assert e["equipment"] == "dumbbell"


def test_combined_filters(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get(
        "/api/exercises?search=press&primary_muscle=chest&equipment=dumbbell",
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()

    for e in data:
        assert "press" in e["name"].lower()
        assert e["primary_muscle"] == "chest"
        assert e["equipment"] == "dumbbell"


def test_empty_list_for_no_match(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises?search=zzznotexistzzz", headers=_auth_headers(token))
    assert response.status_code == 200
    assert response.json() == []


def test_overlong_search_rejected(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises?search=" + "x" * 101, headers=_auth_headers(token))
    assert response.status_code == 422


def test_invalid_primary_muscle_rejected(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get(
        "/api/exercises?primary_muscle=invalid_muscle", headers=_auth_headers(token)
    )
    assert response.status_code == 422


def test_invalid_equipment_rejected(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises?equipment=invalid_eq", headers=_auth_headers(token))
    assert response.status_code == 422


def test_detail_returns_complete_record(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises/barbell-bench-press", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.json()

    assert data == {
        "slug": "barbell-bench-press",
        "name": "Barbell Bench Press",
        "primary_muscle": "chest",
        "secondary_muscles": ["triceps", "shoulders"],
        "equipment": "barbell",
        "movement_pattern": "horizontal_push",
        "execution_type": "bilateral",
        "instructions": (
            "Lie on a flat bench with the bar over the chest. "
            "Lower it under control, then press until the arms are extended."
        ),
    }


def test_detail_unknown_slug_returns_404(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises/non-existent-slug", headers=_auth_headers(token))
    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_unauthenticated_access(client: TestClient) -> None:
    assert client.get("/api/exercises").status_code == 401
    assert client.get("/api/exercises/barbell-bench-press").status_code == 401


def test_detail_no_database_ids_leaked(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises/barbell-bench-press", headers=_auth_headers(token))
    data = response.json()

    assert "id" not in data
    assert "user_id" not in data
    assert "created_at" not in data


def test_unknown_query_parameter_rejected(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get("/api/exercises?foo=bar", headers=_auth_headers(token))
    assert response.status_code == 422


def test_repeated_query_parameter_rejected(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.get(
        "/api/exercises?equipment=barbell&equipment=dumbbell",
        headers=_auth_headers(token),
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "query parameter must not be repeated: equipment"}


def test_catalog_is_read_only(client: TestClient) -> None:
    token, _ = _register(client)

    post = client.post("/api/exercises", headers=_auth_headers(token))
    assert post.status_code in (405, 404)
    put = client.put("/api/exercises/barbell-bench-press", headers=_auth_headers(token))
    assert put.status_code in (405, 404)
    delete = client.delete("/api/exercises/barbell-bench-press", headers=_auth_headers(token))
    assert delete.status_code in (405, 404)


def test_seeded_exercise_slugs_are_stable(client: TestClient) -> None:
    token, _ = _register(client)

    for slug in ["barbell-bench-press", "pull-up", "barbell-back-squat", "plank", "farmers-carry"]:
        response = client.get(f"/api/exercises/{slug}", headers=_auth_headers(token))
        msg = f"Expected 200 for slug '{slug}', got {response.status_code}"
        assert response.status_code == 200, msg
