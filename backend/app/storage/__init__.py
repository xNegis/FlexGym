"""Storage boundary wiring.

``get_object_store`` is the FastAPI dependency used by photo endpoints. It builds
a lazily-configured S3 store once and returns it; tests override the dependency
with a ``FakeObjectStore``.
"""

from __future__ import annotations

from app.config import get_config
from app.storage.base import ObjectNotFoundError, ObjectStore, StorageUnavailableError
from app.storage.fake import FakeObjectStore
from app.storage.s3 import S3ObjectStore

__all__ = [
    "FakeObjectStore",
    "ObjectNotFoundError",
    "ObjectStore",
    "StorageUnavailableError",
    "get_object_store",
]

_store: ObjectStore | None = None


def get_object_store() -> ObjectStore:
    global _store
    if _store is None:
        config = get_config()
        _store = S3ObjectStore(config.s3_region, config.s3_bucket, config.s3_prefix)
    return _store


def reset_object_store() -> None:
    global _store
    _store = None
