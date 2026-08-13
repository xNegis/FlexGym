"""Basic behavioural tests for F02 authentication."""

from fastapi.testclient import TestClient

from app.auth.jwt import create_token, decode_token
from app.auth.password import hash_password, verify_password


def test_password_hash_and_verification() -> None:
    password = "a-valid-password-15"
    first_hash = hash_password(password)
    second_hash = hash_password(password)

    assert first_hash != password
    assert first_hash != second_hash
    assert "argon2" in first_hash
    assert verify_password(password, first_hash)
    assert not verify_password("wrong-password-xx", first_hash)


def test_jwt_round_trip_and_invalid_token() -> None:
    assert decode_token(create_token(42)) == 42
    assert decode_token("not.a.valid.token") is None


def test_multi_account_registration_and_duplicate_email(client: TestClient) -> None:
    invalid = client.post(
        "/api/auth/register",
        json={"email": "user@example.com", "password": "too-short"},
    )
    assert invalid.status_code == 422

    registered = client.post(
        "/api/auth/register",
        json={"email": "  User@Example.COM  ", "password": "a-secure-password-15"},
    )
    assert registered.status_code == 201
    assert registered.json() == {"id": 1, "email": "user@example.com"}
    assert registered.cookies.get("auth_token") is not None

    second = client.post(
        "/api/auth/register",
        json={"email": "second@example.com", "password": "a-secure-password-15"},
    )
    assert second.status_code == 201
    assert second.json() == {"id": 2, "email": "second@example.com"}

    duplicate = client.post(
        "/api/auth/register",
        json={"email": " USER@example.com ", "password": "another-password-15"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json() == {"detail": "Email is already registered"}


def test_login_and_generic_credentials_error(client: TestClient) -> None:
    client.post(
        "/api/auth/register",
        json={"email": "Login@Example.com", "password": "a-secure-password-15"},
    )
    client.post("/api/auth/logout")

    logged_in = client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "a-secure-password-15"},
    )
    assert logged_in.status_code == 200
    assert logged_in.json()["email"] == "login@example.com"

    unknown = client.post(
        "/api/auth/login",
        json={"email": "unknown@example.com", "password": "a-secure-password-15"},
    )
    incorrect = client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "wrong-password-xxxxx"},
    )
    assert unknown.status_code == incorrect.status_code == 401
    assert unknown.json() == incorrect.json() == {"detail": "Invalid credentials"}


def test_authenticated_identity(client: TestClient) -> None:
    registered = client.post(
        "/api/auth/register",
        json={"email": "me@example.com", "password": "a-secure-password-15"},
    )
    token = registered.cookies.get("auth_token")

    current = client.get("/api/auth/me", cookies={"auth_token": token})
    assert current.status_code == 200
    assert current.json() == {"id": 1, "email": "me@example.com"}

    client.cookies.clear()
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.get("/api/auth/me", cookies={"auth_token": "not.a.valid.token"}).status_code == 401
    )


def test_logout_is_idempotent(client: TestClient) -> None:
    client.post(
        "/api/auth/register",
        json={"email": "logout@example.com", "password": "a-secure-password-15"},
    )

    first = client.post("/api/auth/logout")
    second = client.post("/api/auth/logout")

    assert first.status_code == second.status_code == 204
    assert "auth_token" in first.headers.get("set-cookie", "")
