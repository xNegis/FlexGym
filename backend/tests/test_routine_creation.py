"""Tests for F07 routine creation."""

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine


def test_sqlite_foreign_keys_are_enabled(test_engine: Engine) -> None:
    with test_engine.connect() as connection:
        assert connection.execute(text("PRAGMA foreign_keys")).scalar_one() == 1


def test_deleting_user_cascades_owned_routines(client: TestClient, test_engine: Engine) -> None:
    token, user_id = _register(client, "cascade@example.com")
    _create_routine(client, token, "Cascade Routine")

    with test_engine.begin() as connection:
        connection.execute(text("DELETE FROM users WHERE id = :user_id"), {"user_id": user_id})
        remaining = connection.execute(
            text("SELECT COUNT(*) FROM routines WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).scalar_one()

    assert remaining == 0


def _register(client: TestClient, email: str = "routines@example.com") -> tuple[str, int]:
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
    objective: str = "build_muscle",
    description: str | None = "A classic PPL split",
) -> dict:
    response = client.post(
        "/api/routines",
        json={"name": name, "objective": objective, "description": description},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


# -- Creation, listing, and detail ----------------------------------------


def test_create_and_list_routines(client: TestClient) -> None:
    token, _ = _register(client)

    r1 = _create_routine(client, token, "Push Pull Legs")
    r2 = _create_routine(client, token, "Upper Lower Split")

    assert r1["name"] == "Push Pull Legs"
    assert r1["objective"] == "build_muscle"
    assert r1["description"] == "A classic PPL split"
    assert isinstance(r1["id"], int)
    assert r1["id"] > 0
    assert "user_id" not in r1
    assert "normalized_name" not in r1
    assert r1["created_at"] == r1["updated_at"]

    assert r2["name"] == "Upper Lower Split"
    assert r2["id"] != r1["id"]

    response = client.get("/api/routines", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = [r["name"] for r in data]
    assert names == sorted(names, key=str.casefold)
    assert data[0]["name"] == "Push Pull Legs"
    assert data[1]["name"] == "Upper Lower Split"


def test_create_routine_trims_name(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.post(
        "/api/routines",
        json={"name": "  My Routine  ", "objective": "general_fitness"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201
    assert response.json()["name"] == "My Routine"


def test_create_routine_null_description(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.post(
        "/api/routines",
        json={"name": "Minimal Routine", "objective": "increase_strength", "description": None},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201
    assert response.json()["description"] is None


def test_create_routine_whitespace_description_becomes_null(
    client: TestClient,
) -> None:
    token, _ = _register(client)

    response = client.post(
        "/api/routines",
        json={"name": "WS Routine", "objective": "lose_fat", "description": "   "},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201
    assert response.json()["description"] is None


def test_empty_list_for_new_user(client: TestClient) -> None:
    token, _ = _register(client)
    response = client.get("/api/routines", headers=_auth_headers(token))
    assert response.status_code == 200
    assert response.json() == []


def test_get_routine_detail(client: TestClient) -> None:
    token, _ = _register(client)
    created = _create_routine(client, token, "My Routine")

    response = client.get(f"/api/routines/{created['id']}", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == created["id"]
    assert data["name"] == "My Routine"
    assert data["objective"] == "build_muscle"
    assert data["description"] == "A classic PPL split"
    assert "user_id" not in data
    assert "normalized_name" not in data


# -- Update ----------------------------------------------------------------


def test_update_routine(client: TestClient) -> None:
    token, _ = _register(client)
    created = _create_routine(client, token, "Original Name")

    response = client.put(
        f"/api/routines/{created['id']}",
        json={
            "name": "Updated Name",
            "objective": "lose_fat",
            "description": "Updated description",
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == created["id"]
    assert data["name"] == "Updated Name"
    assert data["objective"] == "lose_fat"
    assert data["description"] == "Updated description"
    assert data["created_at"] == created["created_at"]
    assert data["updated_at"] != created["updated_at"]

    # Verify via detail
    detail = client.get(f"/api/routines/{created['id']}", headers=_auth_headers(token))
    assert detail.status_code == 200
    assert detail.json()["name"] == "Updated Name"


# -- Duplicate name --------------------------------------------------------


def test_same_user_duplicate_name_on_create(client: TestClient) -> None:
    token, _ = _register(client)
    _create_routine(client, token, "My Routine")

    response = client.post(
        "/api/routines",
        json={"name": "  my routine  ", "objective": "general_fitness"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 409
    assert response.json() == {"detail": "Routine name already exists"}


def test_same_user_duplicate_name_on_update(client: TestClient) -> None:
    token, _ = _register(client)
    r1 = _create_routine(client, token, "Routine A")
    _create_routine(client, token, "Routine B")

    response = client.put(
        f"/api/routines/{r1['id']}",
        json={"name": "  routine b  ", "objective": "general_fitness"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 409
    assert response.json() == {"detail": "Routine name already exists"}


def test_different_users_same_name(client: TestClient) -> None:
    token1, _ = _register(client, "user1@example.com")
    token2, _ = _register(client, "user2@example.com")

    _create_routine(client, token1, "My Routine")
    response = client.post(
        "/api/routines",
        json={"name": "My Routine", "objective": "general_fitness"},
        headers=_auth_headers(token2),
    )
    assert response.status_code == 201


# -- Ownership isolation ---------------------------------------------------


def test_list_only_returns_own_routines(client: TestClient) -> None:
    token1, _ = _register(client, "owner1@example.com")
    token2, _ = _register(client, "owner2@example.com")

    _create_routine(client, token1, "Owner 1 Routine")
    _create_routine(client, token2, "Owner 2 Routine")

    list1 = client.get("/api/routines", headers=_auth_headers(token1)).json()
    list2 = client.get("/api/routines", headers=_auth_headers(token2)).json()

    assert len(list1) == 1
    assert list1[0]["name"] == "Owner 1 Routine"
    assert len(list2) == 1
    assert list2[0]["name"] == "Owner 2 Routine"


def test_other_user_routine_not_found_on_detail(client: TestClient) -> None:
    token1, _ = _register(client, "owner1@example.com")
    token2, _ = _register(client, "owner2@example.com")

    r1 = _create_routine(client, token1, "Owner 1 Routine")

    response = client.get(f"/api/routines/{r1['id']}", headers=_auth_headers(token2))
    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


def test_other_user_routine_not_found_on_update(client: TestClient) -> None:
    token1, _ = _register(client, "owner1@example.com")
    token2, _ = _register(client, "owner2@example.com")

    r1 = _create_routine(client, token1, "Owner 1 Routine")

    response = client.put(
        f"/api/routines/{r1['id']}",
        json={"name": "Hijack", "objective": "general_fitness"},
        headers=_auth_headers(token2),
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


def test_other_user_routine_not_found_on_delete(client: TestClient) -> None:
    token1, _ = _register(client, "owner1@example.com")
    token2, _ = _register(client, "owner2@example.com")

    r1 = _create_routine(client, token1, "Owner 1 Routine")

    response = client.delete(f"/api/routines/{r1['id']}", headers=_auth_headers(token2))
    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


# -- Deletion --------------------------------------------------------------


def test_delete_routine(client: TestClient) -> None:
    token, _ = _register(client)
    created = _create_routine(client, token, "To Delete")

    response = client.delete(f"/api/routines/{created['id']}", headers=_auth_headers(token))
    assert response.status_code == 204
    assert response.text == ""

    detail = client.get(f"/api/routines/{created['id']}", headers=_auth_headers(token))
    assert detail.status_code == 404


def test_delete_nonexistent_returns_404(client: TestClient) -> None:
    token, _ = _register(client)
    response = client.delete("/api/routines/9999", headers=_auth_headers(token))
    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


# -- Invalid input ---------------------------------------------------------


def test_post_invalid_objective_rejects_and_preserves_data(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.post(
        "/api/routines",
        json={"name": "Bad Routine", "objective": "invalid_objective"},
        headers=_auth_headers(token),
    )
    assert response.status_code == 422

    # Verify nothing was created
    routines = client.get("/api/routines", headers=_auth_headers(token)).json()
    assert len(routines) == 0


def test_invalid_routine_id_returns_422(client: TestClient) -> None:
    token, _ = _register(client)

    for path in ["/api/routines/abc", "/api/routines/-1", "/api/routines/0"]:
        response = client.get(path, headers=_auth_headers(token))
        assert response.status_code == 422, f"{path} should be 422"


# -- Unauthenticated -------------------------------------------------------


def test_routine_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get("/api/routines").status_code == 401
    assert (
        client.post(
            "/api/routines",
            json={"name": "R", "objective": "general_fitness"},
        ).status_code
        == 401
    )
    assert client.get("/api/routines/1").status_code == 401
    assert (
        client.put(
            "/api/routines/1",
            json={"name": "R", "objective": "general_fitness"},
        ).status_code
        == 401
    )
    assert client.delete("/api/routines/1").status_code == 401


# -- Unknown fields --------------------------------------------------------


def test_create_rejects_unknown_fields(client: TestClient) -> None:
    token, _ = _register(client)

    response = client.post(
        "/api/routines",
        json={
            "name": "R",
            "objective": "general_fitness",
            "owner": "someone else",
        },
        headers=_auth_headers(token),
    )
    assert response.status_code == 422


# -- Migration tests -------------------------------------------------------

# Tests above use Base.metadata.create_all() via conftest.py.
# Migration integrity is validated separately using alembic commands.
# This is documented per DEC-008 and the F07 spec migration gate.
