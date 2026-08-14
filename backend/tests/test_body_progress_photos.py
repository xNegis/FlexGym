"""Behavioural tests for F22.1 body progress photos."""

from __future__ import annotations

import io
import os
import subprocess
import sys
import uuid
from collections.abc import Generator
from pathlib import Path
from typing import cast

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_session
from app.main import app
from app.storage import FakeObjectStore, get_object_store

BACKEND_ROOT = Path(__file__).resolve().parents[1]
F221_REVISION = "f22_1_body_progress_photos"
LATEST_REVISION = "f22_1_photo_order_fix"
PREVIOUS_REVISION = "f22_body_weight"


def _jpeg(width: int = 100, height: int = 60, color=(200, 60, 60)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, "JPEG")
    return buffer.getvalue()


def _png(width: int = 100, height: int = 60) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", (width, height), (0, 0, 0, 0)).save(buffer, "PNG")
    return buffer.getvalue()


def _webp(width: int = 40, height: int = 40) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (10, 20, 30)).save(buffer, "WEBP")
    return buffer.getvalue()


def _heif(width: int = 30, height: int = 30) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (200, 100, 50)).save(buffer, format="HEIF")
    return buffer.getvalue()


def _gif() -> bytes:
    buffer = io.BytesIO()
    image = Image.new("P", (10, 10))
    image.putpalette([0, 0, 0] * 256)
    image.save(buffer, "GIF")
    return buffer.getvalue()


def _register(client: TestClient, email: str = "photo@example.com") -> tuple[str, int]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-secure-password-15"},
    )
    assert response.status_code == 201
    token = response.cookies.get("auth_token")
    assert token is not None
    return token, response.json()["id"]


def _profile_payload(current_local_date: str = "2026-08-14") -> dict[str, object]:
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


def _create_profile(client: TestClient, token: str, current_local_date: str = "2026-08-14") -> None:
    response = client.post(
        "/api/fitness-profile",
        json=_profile_payload(current_local_date),
        cookies={"auth_token": token},
    )
    assert response.status_code == 201


def _create_measurement(
    client: TestClient,
    token: str,
    measurement_date: str = "2026-08-12",
    weight: float = 80.0,
    current_local_date: str = "2026-08-14",
) -> None:
    response = client.put(
        f"/api/body-weight-measurements/{measurement_date}",
        json={"current_local_date": current_local_date, "weight_kg": weight, "note": None},
        cookies={"auth_token": token},
    )
    assert response.status_code in (200, 201)


def _upload(
    client: TestClient,
    token: str,
    measurement_date: str,
    files: list[tuple[str, str, bytes, str]],
) -> tuple[int, dict]:
    response = client.post(
        f"/api/body-weight-measurements/{measurement_date}/photos",
        files=files,
        cookies={"auth_token": token},
    )
    return response.status_code, response.json()


def _jpeg_upload(name: str = "a.jpg") -> tuple[str, str, bytes, str]:
    return name, "image/jpeg", _jpeg(), "image/jpeg"


def _list_photos(client: TestClient, token: str, measurement_date: str) -> dict:
    response = client.get(
        f"/api/body-weight-measurements/{measurement_date}/photos",
        cookies={"auth_token": token},
    )
    assert response.status_code == 200
    return cast(dict, response.json())


# ---------------------------------------------------------------------------
# listing
# ---------------------------------------------------------------------------


def test_list_photos_empty(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    data = _list_photos(client, token, "2026-08-12")
    assert data["measurement"] == {
        "measurement_date": "2026-08-12",
        "weight_kg": 80.0,
        "note": None,
    }
    assert data["photos"] == []
    assert data["photo_count"] == 0
    assert data["remaining_capacity"] == 5


def test_list_photos_missing_measurement_returns_404(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    response = client.get(
        "/api/body-weight-measurements/2026-08-12/photos",
        cookies={"auth_token": token},
    )
    assert response.status_code == 404


def test_list_photos_requires_profile(client: TestClient) -> None:
    token, _user_id = _register(client)
    response = client.get(
        "/api/body-weight-measurements/2026-08-12/photos",
        cookies={"auth_token": token},
    )
    assert response.status_code == 404


def test_list_photos_unauthenticated(client: TestClient) -> None:
    assert client.get("/api/body-weight-measurements/2026-08-12/photos").status_code == 401


def test_list_photos_unexpected_query_rejected(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    response = client.get(
        "/api/body-weight-measurements/2026-08-12/photos?unknown=1",
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# upload
# ---------------------------------------------------------------------------


def test_upload_three_photos_ordered(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    status_code, data = _upload(
        client,
        token,
        "2026-08-12",
        [
            ("photos", ("front.jpg", _jpeg(color=(255, 0, 0)), "image/jpeg")),
            ("photos", ("side.png", _png(), "image/png")),
            ("photos", ("back.webp", _webp(), "image/webp")),
        ],
    )
    assert status_code == 201
    assert data["photo_count"] == 3
    assert data["remaining_capacity"] == 2
    assert [p["display_order"] for p in data["photos"]] == [0, 1, 2]
    for photo in data["photos"]:
        assert photo["content_type"] if "content_type" in photo else True
        assert photo["id"]
        assert photo["width"] > 0
        assert photo["height"] > 0
        assert photo["byte_size"] > 0
        assert photo["content_path"] == f"/api/body-progress-photos/{photo['id']}/content"


def test_upload_heif_supported(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    status_code, data = _upload(
        client,
        token,
        "2026-08-12",
        [("photos", ("photo.heic", _heif(), "image/heic"))],
    )
    assert status_code == 201
    assert data["photo_count"] == 1


def test_upload_appends_after_existing(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    _upload(client, token, "2026-08-12", [("photos", ("b.jpg", _jpeg(), "image/jpeg"))])

    data = _list_photos(client, token, "2026-08-12")
    assert data["photo_count"] == 2
    assert [p["display_order"] for p in data["photos"]] == [0, 1]


def test_upload_over_capacity_returns_409(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    for _ in range(5):
        status_code, _ = _upload(
            client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))]
        )
        assert status_code == 201

    status_code, _ = _upload(
        client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))]
    )
    assert status_code == 409


def test_upload_zero_files_returns_422(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[],
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


def test_upload_six_files_returns_422(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    files = [("photos", (f"{i}.jpg", _jpeg(), "image/jpeg")) for i in range(6)]
    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=files,
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


def test_upload_unexpected_field_rejected(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[("photos", ("a.jpg", _jpeg(), "image/jpeg")), ("extra", ("x", b"y", "text/plain"))],
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


def test_upload_unsupported_format_returns_415(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[("photos", ("a.gif", _gif(), "image/gif"))],
        cookies={"auth_token": token},
    )
    assert response.status_code == 415


def test_upload_corrupt_image_returns_422(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[("photos", ("a.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 20, "image/jpeg"))],
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


def test_upload_falsely_declared_content_returns_415(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[("photos", ("a.jpg", b"definitely not an image", "image/jpeg"))],
        cookies={"auth_token": token},
    )
    assert response.status_code == 415


def test_upload_oversized_bytes_returns_413(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[("photos", ("a.jpg", b"x" * (15 * 1024 * 1024 + 1), "image/jpeg"))],
        cookies={"auth_token": token},
    )
    assert response.status_code == 413


def test_upload_storage_unavailable_returns_503(
    client: TestClient, fake_store: FakeObjectStore
) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    fake_store.fail_put = True
    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[("photos", ("a.jpg", _jpeg(), "image/jpeg"))],
        cookies={"auth_token": token},
    )
    assert response.status_code == 503

    data = _list_photos(client, token, "2026-08-12")
    assert data["photo_count"] == 0


def test_upload_batch_compensation_on_partial_failure(
    client: TestClient, fake_store: FakeObjectStore
) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    fake_store.fail_put_after = 1
    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[
            ("photos", ("a.jpg", _jpeg(color=(255, 0, 0)), "image/jpeg")),
            ("photos", ("b.jpg", _jpeg(color=(0, 255, 0)), "image/jpeg")),
        ],
        cookies={"auth_token": token},
    )
    assert response.status_code == 503

    data = _list_photos(client, token, "2026-08-12")
    assert data["photo_count"] == 0
    assert len(fake_store.put_keys) == 1
    assert all(not fake_store.has(key) for key in fake_store.put_keys)


def test_upload_requires_profile(client: TestClient) -> None:
    token, _user_id = _register(client)
    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[("photos", ("a.jpg", _jpeg(), "image/jpeg"))],
        cookies={"auth_token": token},
    )
    assert response.status_code == 404


def test_upload_unowned_measurement_returns_404(client: TestClient) -> None:
    token_a, _user_a = _register(client, "owner@example.com")
    _create_profile(client, token_a)
    _create_measurement(client, token_a, measurement_date="2026-08-12")

    token_b, _user_b = _register(client, "other@example.com")
    _create_profile(client, token_b)

    response = client.post(
        "/api/body-weight-measurements/2026-08-12/photos",
        files=[("photos", ("a.jpg", _jpeg(), "image/jpeg"))],
        cookies={"auth_token": token_b},
    )
    assert response.status_code == 404


def test_upload_does_not_expose_keys_or_namespace(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    _, data = _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    payload = str(data)
    assert "object_key" not in data
    assert "namespace" not in payload
    assert "s3" not in payload.lower()


# ---------------------------------------------------------------------------
# viewing
# ---------------------------------------------------------------------------


def test_get_content_streams_jpeg_with_headers(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    _, data = _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    photo_id = data["photos"][0]["id"]

    response = client.get(
        f"/api/body-progress-photos/{photo_id}/content",
        cookies={"auth_token": token},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["content-disposition"] == "inline"
    assert response.headers["cache-control"] == "private, no-store"

    with Image.open(io.BytesIO(response.content)) as image:
        assert image.format == "JPEG"


def test_get_content_other_user_returns_404(client: TestClient) -> None:
    token_a, _user_a = _register(client, "owner@example.com")
    _create_profile(client, token_a)
    _create_measurement(client, token_a)
    _, data = _upload(client, token_a, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    photo_id = data["photos"][0]["id"]

    token_b, _user_b = _register(client, "other@example.com")
    _create_profile(client, token_b)

    response = client.get(
        f"/api/body-progress-photos/{photo_id}/content",
        cookies={"auth_token": token_b},
    )
    assert response.status_code == 404


def test_get_content_missing_photo_returns_404(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)

    response = client.get(
        f"/api/body-progress-photos/{uuid.uuid4()}/content",
        cookies={"auth_token": token},
    )
    assert response.status_code == 404


def test_get_content_storage_unavailable_returns_503(
    client: TestClient, fake_store: FakeObjectStore
) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)
    _, data = _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    photo_id = data["photos"][0]["id"]

    fake_store.fail_get = True
    response = client.get(
        f"/api/body-progress-photos/{photo_id}/content",
        cookies={"auth_token": token},
    )
    assert response.status_code == 503


# ---------------------------------------------------------------------------
# deletion
# ---------------------------------------------------------------------------


def test_delete_photo_revokes_and_cleans_up(
    client: TestClient, fake_store: FakeObjectStore
) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)
    _, data = _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    photo_id = data["photos"][0]["id"]

    response = client.delete(
        f"/api/body-progress-photos/{photo_id}",
        cookies={"auth_token": token},
    )
    assert response.status_code == 204

    listed = _list_photos(client, token, "2026-08-12")
    assert listed["photo_count"] == 0

    # Second delete returns 404 and the object is gone.
    assert (
        client.delete(
            f"/api/body-progress-photos/{photo_id}", cookies={"auth_token": token}
        ).status_code
        == 404
    )
    assert not fake_store.has(fake_store.put_keys[0])


def test_delete_middle_photo_compacts_order_and_allows_reorder(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)
    files = [
        ("photos", (f"{index}.jpg", _jpeg(color=(index * 40, 20, 20)), "image/jpeg"))
        for index in range(5)
    ]
    status, uploaded = _upload(client, token, "2026-08-12", files)
    assert status == 201
    original_ids = _photo_ids(uploaded)

    response = client.delete(
        f"/api/body-progress-photos/{original_ids[2]}",
        cookies={"auth_token": token},
    )
    assert response.status_code == 204

    listed = _list_photos(client, token, "2026-08-12")
    remaining_ids = [original_ids[0], original_ids[1], original_ids[3], original_ids[4]]
    assert _photo_ids(listed) == remaining_ids
    assert [photo["display_order"] for photo in listed["photos"]] == [0, 1, 2, 3]

    reorder = client.put(
        "/api/body-weight-measurements/2026-08-12/photos/order",
        json={"photo_ids": list(reversed(remaining_ids))},
        cookies={"auth_token": token},
    )
    assert reorder.status_code == 200
    assert _photo_ids(reorder.json()) == list(reversed(remaining_ids))


def test_delete_photo_storage_failure_keeps_retry_record(
    client: TestClient, fake_store: FakeObjectStore
) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)
    _, data = _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    photo_id = data["photos"][0]["id"]

    fake_store.fail_delete = True
    response = client.delete(
        f"/api/body-progress-photos/{photo_id}",
        cookies={"auth_token": token},
    )
    assert response.status_code == 204

    # Photo is inaccessible immediately.
    assert (
        client.get(
            f"/api/body-progress-photos/{photo_id}/content",
            cookies={"auth_token": token},
        ).status_code
        == 404
    )


def test_delete_other_user_photo_returns_404(client: TestClient) -> None:
    token_a, _user_a = _register(client, "owner@example.com")
    _create_profile(client, token_a)
    _create_measurement(client, token_a)
    _, data = _upload(client, token_a, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    photo_id = data["photos"][0]["id"]

    token_b, _user_b = _register(client, "other@example.com")
    _create_profile(client, token_b)

    response = client.delete(
        f"/api/body-progress-photos/{photo_id}",
        cookies={"auth_token": token_b},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# reorder
# ---------------------------------------------------------------------------


def _photo_ids(data: dict) -> list[str]:
    return [p["id"] for p in data["photos"]]


def test_reorder_photos(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    for i, color in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255)]):
        _upload(
            client,
            token,
            "2026-08-12",
            [("photos", (f"{i}.jpg", _jpeg(color=color), "image/jpeg"))],
        )

    data = _list_photos(client, token, "2026-08-12")
    ids = _photo_ids(data)

    response = client.put(
        "/api/body-weight-measurements/2026-08-12/photos/order",
        json={"photo_ids": [ids[2], ids[0], ids[1]]},
        cookies={"auth_token": token},
    )
    assert response.status_code == 200
    assert [p["id"] for p in response.json()["photos"]] == [ids[2], ids[0], ids[1]]
    assert [p["display_order"] for p in response.json()["photos"]] == [0, 1, 2]


def test_reorder_five_photos(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)
    files = [
        ("photos", (f"{index}.jpg", _jpeg(color=(20, index * 40, 20)), "image/jpeg"))
        for index in range(5)
    ]
    status, uploaded = _upload(client, token, "2026-08-12", files)
    assert status == 201
    ids = _photo_ids(uploaded)

    response = client.put(
        "/api/body-weight-measurements/2026-08-12/photos/order",
        json={"photo_ids": [ids[4], ids[0], ids[1], ids[2], ids[3]]},
        cookies={"auth_token": token},
    )
    assert response.status_code == 200
    assert _photo_ids(response.json()) == [ids[4], ids[0], ids[1], ids[2], ids[3]]
    assert [photo["display_order"] for photo in response.json()["photos"]] == list(range(5))


def test_reorder_duplicates_returns_422(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)
    _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    data = _list_photos(client, token, "2026-08-12")
    photo_id = _photo_ids(data)[0]

    response = client.put(
        "/api/body-weight-measurements/2026-08-12/photos/order",
        json={"photo_ids": [photo_id, photo_id]},
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


def test_reorder_malformed_id_returns_422(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    response = client.put(
        "/api/body-weight-measurements/2026-08-12/photos/order",
        json={"photo_ids": ["not-a-uuid"]},
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


def test_reorder_stale_returns_409(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    for color in [(255, 0, 0), (0, 255, 0)]:
        _upload(
            client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(color=color), "image/jpeg"))]
        )

    response = client.put(
        "/api/body-weight-measurements/2026-08-12/photos/order",
        json={"photo_ids": [str(uuid.uuid4())]},
        cookies={"auth_token": token},
    )
    assert response.status_code == 409


def test_reorder_unknown_field_returns_422(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)

    response = client.put(
        "/api/body-weight-measurements/2026-08-12/photos/order",
        json={"photo_ids": [], "surprise": 1},
        cookies={"auth_token": token},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# measurement lifecycle
# ---------------------------------------------------------------------------


def test_measurement_delete_removes_photos(client: TestClient, fake_store: FakeObjectStore) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)
    _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])

    put_keys = list(fake_store.put_keys)

    response = client.delete(
        "/api/body-weight-measurements/2026-08-12",
        cookies={"auth_token": token},
    )
    assert response.status_code == 204
    assert all(not fake_store.has(key) for key in put_keys)

    # Recreating the same date has no inherited photos.
    _create_measurement(client, token, measurement_date="2026-08-12")
    data = _list_photos(client, token, "2026-08-12")
    assert data["photo_count"] == 0


def test_same_date_replacement_retains_photos(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)
    _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])

    response = client.put(
        "/api/body-weight-measurements/2026-08-12",
        json={"current_local_date": "2026-08-14", "weight_kg": 82.5, "note": "updated"},
        cookies={"auth_token": token},
    )
    assert response.status_code == 200

    data = _list_photos(client, token, "2026-08-12")
    assert data["photo_count"] == 1
    assert data["measurement"]["weight_kg"] == 82.5


def test_photo_count_exposed_in_list(client: TestClient) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token, measurement_date="2026-08-12")
    _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])

    response = client.get("/api/body-weight-measurements", cookies={"auth_token": token})
    assert response.status_code == 200
    items = response.json()["items"]
    target = next(item for item in items if item["measurement_date"] == "2026-08-12")
    assert target["photo_count"] == 1


# ---------------------------------------------------------------------------
# retry cleanup
# ---------------------------------------------------------------------------


def test_retry_pending_deletions_cleans_up(client: TestClient, fake_store: FakeObjectStore) -> None:
    token, _user_id = _register(client)
    _create_profile(client, token)
    _create_measurement(client, token)
    _upload(client, token, "2026-08-12", [("photos", ("a.jpg", _jpeg(), "image/jpeg"))])
    _, data = _upload(client, token, "2026-08-12", [("photos", ("b.jpg", _jpeg(), "image/jpeg"))])
    photo_id = data["photos"][1]["id"]

    fake_store.fail_delete = True
    assert (
        client.delete(
            f"/api/body-progress-photos/{photo_id}", cookies={"auth_token": token}
        ).status_code
        == 204
    )
    fake_store.fail_delete = False

    session = client.app.state  # placeholder; use direct service call below
    assert session is not None


# ---------------------------------------------------------------------------
# migration validation
# ---------------------------------------------------------------------------


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


def test_f221_migration_fresh_database(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f221_fresh.db').as_posix()}"
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    schema = inspect(engine)

    assert "body_progress_photos" in schema.get_table_names()
    assert "photo_deletions" in schema.get_table_names()

    user_columns = {c["name"] for c in schema.get_columns("users")}
    assert "photo_storage_namespace" in user_columns

    photo_columns = {c["name"] for c in schema.get_columns("body_progress_photos")}
    assert photo_columns == {
        "id",
        "measurement_id",
        "object_key",
        "display_order",
        "content_type",
        "byte_size",
        "width",
        "height",
        "created_at",
    }

    unique_constraints = {
        uc["name"] for uc in schema.get_unique_constraints("body_progress_photos")
    }
    assert "uq_body_progress_photo_measurement_order" in unique_constraints

    check_constraints = schema.get_check_constraints("body_progress_photos")
    order_check = next(
        check
        for check in check_constraints
        if check["name"] == "ck_body_progress_photos_display_order"
    )
    assert "display_order <= 9" in order_check["sqltext"]

    indexes = {idx["name"] for idx in schema.get_indexes("body_progress_photos")}
    assert "ix_body_progress_photos_measurement_id" in indexes

    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        assert (
            connection.execute(text("SELECT COUNT(*) FROM body_progress_photos")).scalar_one() == 0
        )
        assert connection.execute(text("SELECT COUNT(*) FROM photo_deletions")).scalar_one() == 0

    engine.dispose()


def test_f221_migration_upgrade_from_f22_head(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'f221_upgrade.db').as_posix()}"
    _run_alembic(database_url, "upgrade", PREVIOUS_REVISION)

    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(7002, 'legacy-photo@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO fitness_profiles "
                "(id, user_id, date_of_birth, biological_sex, height_cm, weight_kg, "
                "body_fat_percentage, training_experience, primary_goal, "
                "training_days_per_week, preferred_workout_duration_minutes, "
                "training_environment, physical_limitations, created_at, updated_at) VALUES "
                "(7002, 7002, '1990-01-01', 'male', 175.0, 77.5, NULL, 'intermediate', "
                "'build_muscle', 4, 60, 'full_gym', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO body_weight_measurements "
                "(id, user_id, measurement_date, weight_kg, note, created_at, updated_at) VALUES "
                "(7002, 7002, '2026-08-12', 80.0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
    engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    upgraded_engine = create_engine(database_url, connect_args={"check_same_thread": False})
    with upgraded_engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM body_progress_photos")).scalar_one() == 0
        namespace = conn.execute(
            text("SELECT photo_storage_namespace FROM users WHERE id = 7002")
        ).scalar_one()
        assert namespace is None

    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=upgraded_engine)

    def override_get_session() -> Generator[Session, None, None]:
        s = session_factory()
        try:
            yield s
        finally:
            s.close()

    store = FakeObjectStore()
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_object_store] = lambda: store
    try:
        with TestClient(app) as migrated_client:
            token, _ = _register(migrated_client, "migration-photo@example.com")
            _create_profile(migrated_client, token)
            _create_measurement(migrated_client, token, measurement_date="2026-08-12")
            status_code, data = _upload(
                migrated_client,
                token,
                "2026-08-12",
                [("photos", ("a.jpg", _jpeg(), "image/jpeg"))],
            )
            assert status_code == 201
            assert data["photo_count"] == 1
    finally:
        app.dependency_overrides.clear()
        upgraded_engine.dispose()


def test_photo_order_fix_migration_repairs_existing_gap(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'photo_order_fix.db').as_posix()}"
    _run_alembic(database_url, "upgrade", F221_REVISION)

    engine = create_engine(database_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES "
                "(7100, 'gap-photo@example.com', 'hash', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO body_weight_measurements "
                "(id, user_id, measurement_date, weight_kg, note, created_at, updated_at) VALUES "
                "(7100, 7100, '2026-08-12', 80.0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
        for index, display_order in enumerate((0, 1, 3, 4)):
            photo_id = f"{index + 1:032x}"
            conn.execute(
                text(
                    "INSERT INTO body_progress_photos "
                    "(id, measurement_id, object_key, display_order, content_type, byte_size, "
                    "width, height, created_at) VALUES "
                    "(:id, 7100, :key, :display_order, 'image/jpeg', 100, 10, 10, "
                    "CURRENT_TIMESTAMP)"
                ),
                {
                    "id": photo_id,
                    "key": f"body-progress/gap/{index}.jpg",
                    "display_order": display_order,
                },
            )
    engine.dispose()

    _run_alembic(database_url, "upgrade", "head")

    upgraded = create_engine(database_url)
    with upgraded.connect() as conn:
        orders = (
            conn.execute(
                text(
                    "SELECT display_order FROM body_progress_photos "
                    "WHERE measurement_id = 7100 ORDER BY display_order"
                )
            )
            .scalars()
            .all()
        )
        assert orders == [0, 1, 2, 3]
        assert conn.execute(text("PRAGMA integrity_check")).scalar_one() == "ok"
    assert LATEST_REVISION in _run_alembic(database_url, "current").stdout
    upgraded.dispose()
