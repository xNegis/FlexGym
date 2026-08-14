"""Standalone AWS smoke validation for private body-progress photo storage.

This script is intentionally NOT part of the hermetic pytest suite. It requires
runtime AWS credentials (resolved through the normal provider chain), a private
bucket, and a configured prefix. It puts, verifies, and deletes a generated
non-personal test image beneath a dedicated validation sub-prefix and confirms
that the restricted principal cannot access objects outside that prefix.

Usage:
  python scripts/aws_photo_smoke.py \
      --region eu-west-1 \
      --bucket your-private-bucket \
      --prefix body-progress

No personal photographs are used and the script cleans up after itself.
"""

from __future__ import annotations

import argparse
import io
import uuid

import boto3
from botocore.exceptions import ClientError
from PIL import Image

VALIDATION_SUBPREFIX = "_flexgym_smoke_validation"


def _test_image_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), (30, 90, 60)).save(buffer, "JPEG")
    return buffer.getvalue()


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(f"SMOKE FAILURE: {message}")
    print(f"OK: {message}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate private S3 photo storage")
    parser.add_argument("--region", required=True)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--prefix", required=True)
    args = parser.parse_args()

    client = boto3.client("s3", region_name=args.region)
    prefix = args.prefix.strip("/")
    validation_prefix = f"{prefix}/{VALIDATION_SUBPREFIX}"
    key = f"{validation_prefix}/{uuid.uuid4()}.jpg"
    data = _test_image_bytes()

    client.put_object(Bucket=args.bucket, Key=key, Body=data, ContentType="image/jpeg")
    print(f"OK: put test object {key}")

    head = client.head_object(Bucket=args.bucket, Key=key)
    _check(head["ContentLength"] == len(data), "object length matches")
    _check(
        head.get("ServerSideEncryption") == "AES256",
        "object is encrypted with default SSE-S3",
    )

    fetched = client.get_object(Bucket=args.bucket, Key=key)
    _check(fetched["Body"].read() == data, "object bytes round-trip")

    client.delete_object(Bucket=args.bucket, Key=key)
    print("OK: deleted test object")

    try:
        client.head_object(Bucket=args.bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        _check(code in ("404", "NoSuchKey"), "test object removed after delete")
    else:
        raise RuntimeError("SMOKE FAILURE: test object still exists after delete")

    outside_key = f"_flexgym_outside_validation/{uuid.uuid4()}.jpg"
    try:
        client.put_object(Bucket=args.bucket, Key=outside_key, Body=data)
    except ClientError:
        print("OK: principal denied writing outside the configured prefix")
    else:
        client.delete_object(Bucket=args.bucket, Key=outside_key)
        print(
            "WARN: principal could write outside the prefix; review the IAM policy "
            "(least-privilege boundary is not enforced here)"
        )

    print("AWS photo storage smoke validation completed.")


if __name__ == "__main__":
    main()
