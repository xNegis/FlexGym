"""S3-backed ``ObjectStore`` built on Boto3 and the normal AWS credential chain.

Credentials are runtime secrets resolved by Boto3 and are never read, logged, or
returned by application code. A client is built lazily so that merely importing
the application never requires AWS configuration or credentials.
"""

from __future__ import annotations

import logging
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from app.storage.base import ObjectNotFoundError, ObjectStore, StorageUnavailableError

logger = logging.getLogger(__name__)


class S3ObjectStore(ObjectStore):
    def __init__(self, region: str | None, bucket: str | None, prefix: str) -> None:
        self._region = region
        self._bucket = bucket
        self._prefix = prefix.strip("/")
        self._client: Any | None = None

    def _configured(self) -> bool:
        return bool(self._region and self._bucket and self._prefix)

    def _require_configured(self) -> None:
        if not self._configured():
            raise StorageUnavailableError("Object storage is not configured")

    def _build_client(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("s3", region_name=self._region)
        return self._client

    def put(self, key: str, data: bytes) -> None:
        self._require_configured()
        try:
            self._build_client().put_object(Bucket=self._bucket, Key=key, Body=data)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("Object storage put failed")
            raise StorageUnavailableError("Object storage is unavailable") from exc

    def get(self, key: str) -> bytes:
        self._require_configured()
        try:
            response = self._build_client().get_object(Bucket=self._bucket, Key=key)
            body = response["Body"]
            return bytes(body.read())
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code == "NoSuchKey" or code == "404":
                raise ObjectNotFoundError("Object not found") from exc
            logger.warning("Object storage get failed")
            raise StorageUnavailableError("Object storage is unavailable") from exc
        except BotoCoreError as exc:
            logger.warning("Object storage get failed")
            raise StorageUnavailableError("Object storage is unavailable") from exc

    def delete(self, key: str) -> None:
        self._require_configured()
        try:
            self._build_client().delete_object(Bucket=self._bucket, Key=key)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("Object storage delete failed")
            raise StorageUnavailableError("Object storage is unavailable") from exc
