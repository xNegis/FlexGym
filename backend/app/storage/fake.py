"""Deterministic in-memory object store for hermetic tests.

This store is never used in production. It records every put and delete so tests
can assert exact-key access, compensation, and retry behaviour without touching
AWS or embedding credentials.
"""

from __future__ import annotations

from app.storage.base import ObjectNotFoundError, ObjectStore, StorageUnavailableError


class FakeObjectStore(ObjectStore):
    def __init__(self) -> None:
        self._objects: dict[str, bytes] = {}
        self.put_keys: list[str] = []
        self.deleted_keys: list[str] = []
        self.fail_put = False
        self.fail_get = False
        self.fail_delete = False
        self.fail_put_after: int | None = None
        self._put_count = 0

    def put(self, key: str, data: bytes) -> None:
        self._put_count += 1
        if self.fail_put or (
            self.fail_put_after is not None and self._put_count > self.fail_put_after
        ):
            raise StorageUnavailableError("Object storage is unavailable")
        self._objects[key] = data
        self.put_keys.append(key)

    def get(self, key: str) -> bytes:
        if self.fail_get:
            raise StorageUnavailableError("Object storage is unavailable")
        if key not in self._objects:
            raise ObjectNotFoundError("Object not found")
        return self._objects[key]

    def delete(self, key: str) -> None:
        if self.fail_delete:
            raise StorageUnavailableError("Object storage is unavailable")
        self.deleted_keys.append(key)
        self._objects.pop(key, None)

    def has(self, key: str) -> bool:
        return key in self._objects
