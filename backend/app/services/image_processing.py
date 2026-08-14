"""Image validation and normalization for body-progress photos.

Accepted inputs are JPEG, PNG, WebP, HEIC, and HEIF. Every accepted image is
decoded, its captured orientation applied, converted to sRGB, bounded to a
2,560-pixel longest edge (no upscaling), stripped of source metadata, and written
as a JPEG at quality 90. The original upload is never retained.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()

MAX_INPUT_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_EDGE = 2560
JPEG_QUALITY = 90

_ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF"}


class ImageProcessingError(Exception):
    """Base class for image validation failures."""


class ImageTooLargeError(ImageProcessingError):
    """The input file exceeds the byte limit before decoding."""


class UnsupportedImageError(ImageProcessingError):
    """The input is not a supported image format or cannot be decoded."""


class InvalidImageError(ImageProcessingError):
    """The input decodes but fails safety or dimension validation."""


@dataclass(frozen=True)
class NormalizedImage:
    data: bytes
    width: int
    height: int
    content_type: str = "image/jpeg"


def _has_known_image_signature(raw: bytes) -> bool:
    if raw.startswith(b"\xff\xd8\xff"):
        return True
    if raw.startswith(b"\x89PNG"):
        return True
    if raw[:4] == b"RIFF" and len(raw) >= 12 and raw[8:12] == b"WEBP":
        return True
    if len(raw) >= 8 and raw[4:8] == b"ftyp":
        return True
    return False


def normalize_image(raw: bytes) -> NormalizedImage:
    if not raw:
        raise InvalidImageError("The image file is empty")
    if len(raw) > MAX_INPUT_BYTES:
        raise ImageTooLargeError("The image file is too large")

    try:
        image = Image.open(io.BytesIO(raw))
    except UnidentifiedImageError as exc:
        if _has_known_image_signature(raw):
            raise InvalidImageError("The image file is corrupt or truncated") from exc
        raise UnsupportedImageError("The image format is not supported") from exc
    except OSError as exc:
        raise UnsupportedImageError("The image file could not be read") from exc

    try:
        return _normalize(image)
    except (ImageTooLargeError, InvalidImageError, UnsupportedImageError):
        raise
    except OSError as exc:
        if _has_known_image_signature(raw):
            raise InvalidImageError("The image file is corrupt or truncated") from exc
        raise UnsupportedImageError("The image file could not be decoded") from exc


def _normalize(image: Image.Image) -> NormalizedImage:
    image_format = (image.format or "").upper()
    if image_format not in _ACCEPTED_FORMATS:
        raise UnsupportedImageError("The image format is not supported")

    width, height = image.size
    if width < 1 or height < 1:
        raise InvalidImageError("The image has invalid dimensions")
    if width * height > MAX_PIXELS:
        raise InvalidImageError("The image is too large")

    image = ImageOps.exif_transpose(image)

    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        image = Image.alpha_composite(background, rgba).convert("RGB")
    else:
        image = image.convert("RGB")

    image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)

    output = io.BytesIO()
    image.save(output, format="JPEG", quality=JPEG_QUALITY)
    data = output.getvalue()

    _verify_normalized(data)
    return NormalizedImage(data=data, width=image.width, height=image.height)


def _verify_normalized(data: bytes) -> None:
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "JPEG":
            raise InvalidImageError("The normalized image is not a valid JPEG")
        if image.width < 1 or image.height < 1:
            raise InvalidImageError("The normalized image has invalid dimensions")
        if image.width > MAX_EDGE or image.height > MAX_EDGE:
            raise InvalidImageError("The normalized image exceeds the size limit")
        if image.getexif():
            raise InvalidImageError("The normalized image retains source metadata")
