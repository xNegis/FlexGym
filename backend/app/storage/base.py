"""Storage abstraction for private object storage.

Only the backend accesses object storage. Application code depends on the
small ``ObjectStore`` contract so that ordinary tests can use a deterministic
in-memory fake and the deployed backend can use S3 without coupling domain
logic to a provider.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class StorageError(Exception):
    """Base class for contained storage failures."""


class StorageUnavailableError(StorageError):
    """Storage is not configured or the provider is unreachable."""


class ObjectNotFoundError(StorageError):
    """Raised when a requested object does not exist."""


class ObjectStore(ABC):
    """Minimal put/get/delete contract for exact-key object storage."""

    @abstractmethod
    def put(self, key: str, data: bytes) -> None:
        """Store ``data`` under ``key``, replacing any existing object."""

    @abstractmethod
    def get(self, key: str) -> bytes:
        """Return the object bytes, raising ``ObjectNotFoundError`` when absent."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete the object idempotently; a missing object is not an error."""
