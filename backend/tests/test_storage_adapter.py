"""Focused integration tests for the S3 object-store adapter.

These tests verify the adapter's put/get/delete mapping using a mocked Boto3
client. They never embed AWS credentials or contact a real bucket, so they are
part of the hermetic default test suite.
"""

from __future__ import annotations

from unittest.mock import MagicMock

from botocore.exceptions import ClientError

from app.storage.base import ObjectNotFoundError, StorageUnavailableError
from app.storage.s3 import S3ObjectStore


def _client_error(code: str) -> ClientError:
    return ClientError(
        {"Error": {"Code": code, "Message": code}, "ResponseMetadata": {}},
        "Operation",
    )


def _make_store() -> tuple[S3ObjectStore, MagicMock]:
    client = MagicMock()
    store = S3ObjectStore("eu-west-1", "private-bucket", "body-progress-photos")
    store._client = client
    return store, client


def test_put_calls_put_object() -> None:
    store, client = _make_store()
    store.put("body-progress-photos/users/x/y.jpg", b"data")
    client.put_object.assert_called_once_with(
        Bucket="private-bucket",
        Key="body-progress-photos/users/x/y.jpg",
        Body=b"data",
    )


def test_get_returns_body_bytes() -> None:
    store, client = _make_store()
    body = MagicMock()
    body.read.return_value = b"content"
    client.get_object.return_value = {"Body": body}

    assert store.get("body-progress-photos/users/x/y.jpg") == b"content"
    client.get_object.assert_called_once_with(
        Bucket="private-bucket",
        Key="body-progress-photos/users/x/y.jpg",
    )


def test_get_missing_key_raises_object_not_found() -> None:
    store, client = _make_store()
    client.get_object.side_effect = _client_error("NoSuchKey")

    try:
        store.get("body-progress-photos/users/x/missing.jpg")
    except ObjectNotFoundError:
        pass
    else:
        raise AssertionError("expected ObjectNotFoundError")


def test_get_other_client_error_raises_storage_unavailable() -> None:
    store, client = _make_store()
    client.get_object.side_effect = _client_error("AccessDenied")

    try:
        store.get("body-progress-photos/users/x/y.jpg")
    except StorageUnavailableError:
        pass
    else:
        raise AssertionError("expected StorageUnavailableError")


def test_delete_calls_delete_object() -> None:
    store, client = _make_store()
    store.delete("body-progress-photos/users/x/y.jpg")
    client.delete_object.assert_called_once_with(
        Bucket="private-bucket",
        Key="body-progress-photos/users/x/y.jpg",
    )


def test_unconfigured_store_raises_storage_unavailable() -> None:
    store = S3ObjectStore(None, None, "")
    try:
        store.put("key", b"data")
    except StorageUnavailableError:
        pass
    else:
        raise AssertionError("expected StorageUnavailableError")
