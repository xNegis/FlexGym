"""Unit tests for image validation and normalization."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app.services.image_processing import (
    ImageTooLargeError,
    InvalidImageError,
    UnsupportedImageError,
    normalize_image,
)


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


def _jpeg_header(width: int, height: int) -> bytes:
    sof = (
        b"\xff\xc0"
        + b"\x00\x11"
        + b"\x08"
        + height.to_bytes(2, "big")
        + width.to_bytes(2, "big")
        + b"\x03\x01\x11\x00\x02\x11\x01\x03\x11\x01"
    )
    return (
        b"\xff\xd8" + sof + b"\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00" + b"\x00" * 8 + b"\xff\xd9"
    )


def test_jpeg_downscales_longest_edge() -> None:
    result = normalize_image(_jpeg(width=4000, height=100))
    assert result.width == 2560
    assert result.height == 64
    assert result.content_type == "image/jpeg"
    with Image.open(io.BytesIO(result.data)) as image:
        assert image.format == "JPEG"
        assert not image.getexif()


def test_png_with_alpha_composites_onto_white() -> None:
    result = normalize_image(_png())
    assert result.width == 100
    assert result.height == 60
    with Image.open(io.BytesIO(result.data)) as image:
        assert image.mode == "RGB"


def test_webp_supported() -> None:
    result = normalize_image(_webp())
    assert result.width == 40
    assert result.height == 40


def test_heif_supported() -> None:
    result = normalize_image(_heif())
    assert result.width == 30
    assert result.height == 30


def test_exif_orientation_applied_and_stripped() -> None:
    image = Image.new("RGB", (20, 40), (1, 2, 3))
    exif = image.getexif()
    exif[0x0112] = 6  # rotate 90 CW
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif.tobytes())

    result = normalize_image(buffer.getvalue())
    assert (result.width, result.height) == (40, 20)
    with Image.open(io.BytesIO(result.data)) as check:
        assert not check.getexif()


def test_empty_input_rejected() -> None:
    with pytest.raises(InvalidImageError):
        normalize_image(b"")


def test_byte_limit_exceeded() -> None:
    with pytest.raises(ImageTooLargeError):
        normalize_image(b"x" * (15 * 1024 * 1024 + 1))


def test_unsupported_format_rejected() -> None:
    with pytest.raises(UnsupportedImageError):
        normalize_image(_gif())


def test_corrupt_data_rejected() -> None:
    with pytest.raises(UnsupportedImageError):
        normalize_image(b"this is not an image at all")


def test_truncated_image_rejected() -> None:
    with pytest.raises(InvalidImageError):
        normalize_image(b"\xff\xd8\xff\xe0" + b"\x00" * 20)


def test_oversized_pixel_count_rejected() -> None:
    with pytest.raises(InvalidImageError):
        normalize_image(_jpeg_header(7000, 7000))
