"""Lightweight, privacy-safe image quality inspection for BOEKUNA documents.

No external service or model is used here. Metrics are intentionally coarse and
are only used to decide whether a conservative OCR retry is worthwhile and
whether the user should see simple capture guidance.
"""
from __future__ import annotations

from typing import Iterable

import numpy as np
from PIL import Image, ImageOps


_ANALYSIS_MAX_SIDE = 640


def _analysis_gray(image: Image.Image) -> Image.Image:
    oriented = ImageOps.exif_transpose(image)
    gray = ImageOps.grayscale(oriented)
    if oriented is not image:
        try:
            oriented.close()
        except Exception:
            pass
    w, h = gray.size
    longest = max(w, h)
    if longest > _ANALYSIS_MAX_SIDE:
        scale = _ANALYSIS_MAX_SIDE / float(longest)
        resized = gray.resize(
            (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
            Image.Resampling.BILINEAR,
        )
        gray.close()
        return resized
    return gray


def _sharpness(arr: np.ndarray) -> float:
    if arr.size < 16:
        return 0.0
    f = arr.astype(np.float32)
    dx = np.abs(np.diff(f, axis=1))
    dy = np.abs(np.diff(f, axis=0))
    # Measure edges around ink instead of averaging the whole paper area.
    # The adaptive threshold keeps a dark-but-sharp capture from being
    # mislabeled as blur just because all intensities are compressed.
    background = float(np.percentile(arr, 75))
    ink_threshold = min(245.0, max(20.0, background - 8.0))
    mask_x = (arr[:, :-1] < ink_threshold) | (arr[:, 1:] < ink_threshold)
    mask_y = (arr[:-1, :] < ink_threshold) | (arr[1:, :] < ink_threshold)
    if float(mask_x.mean()) < .001 or float(mask_y.mean()) < .001:
        return 0.0
    return float((dx[mask_x].mean() + dy[mask_y].mean()) / 2.0)


def _projection_score(gray: Image.Image, angle: float) -> float:
    rotated = gray.rotate(angle, resample=Image.Resampling.BILINEAR, expand=False, fillcolor=255)
    try:
        arr = np.asarray(rotated, dtype=np.float32)
        ink = 255.0 - arr
        # Ignore very light background/noise; text-line alignment should dominate.
        ink[ink < 28.0] = 0.0
        if not np.any(ink):
            return 0.0
        rows = ink.sum(axis=1)
        return float(np.var(rows))
    finally:
        rotated.close()


def estimate_deskew_angle(image: Image.Image) -> float:
    """Return a small rotation (degrees) that improves horizontal text alignment.

    The search is deliberately conservative: only +/-6 degrees, on a small
    grayscale analysis copy. A correction is returned only if it materially
    improves the row-projection score over the original.
    """
    gray = _analysis_gray(image)
    try:
        base = _projection_score(gray, 0.0)
        if base <= 0:
            return 0.0
        candidates = (-4.0, -2.0, 2.0, 4.0)
        best_angle = 0.0
        best_score = base
        for angle in candidates:
            score = _projection_score(gray, angle)
            if score > best_score:
                best_score = score
                best_angle = angle
        if best_angle and best_score >= base * 1.30:
            return best_angle
        return 0.0
    finally:
        gray.close()


def inspect_image_quality(image: Image.Image) -> dict:
    """Return non-sensitive quality metrics/flags for one document image."""
    oriented = ImageOps.exif_transpose(image)
    width, height = oriented.size
    if oriented is not image:
        try:
            oriented.close()
        except Exception:
            pass

    gray = _analysis_gray(image)
    try:
        arr = np.asarray(gray, dtype=np.uint8)
        brightness = float(arr.mean()) if arr.size else 0.0
        contrast = float(arr.std()) if arr.size else 0.0
        dark_ratio = float(np.mean(arr < 55)) if arr.size else 1.0
        overexposed_ratio = float(np.mean(arr > 248)) if arr.size else 0.0
        sharpness = _sharpness(arr)
    finally:
        gray.close()

    flags: list[str] = []
    short_side = min(width, height)
    long_side = max(width, height)
    aspect = long_side / max(1.0, float(short_side))

    if short_side < 520 or width * height < 320_000:
        flags.append("IMAGE_LOW_RESOLUTION")
    if brightness < 82.0 or dark_ratio > 0.58:
        flags.append("IMAGE_DARK")
    # White paper legitimately contains a lot of clipped-white pixels. Flag
    # overexposure only when useful contrast has also been lost.
    if brightness > 246.0 and overexposed_ratio > 0.90 and contrast < 12.0:
        flags.append("IMAGE_OVEREXPOSED")
    # Light blur remains best-effort; only strongly softened text should prompt
    # the user to retake the photo.
    if sharpness < 18.0 and contrast > 7.0:
        flags.append("IMAGE_BLUR")
    if aspect >= 3.0 and height > width:
        flags.append("IMAGE_LONG_RECEIPT")

    deskew = estimate_deskew_angle(image) if contrast >= 10.0 else 0.0
    if abs(deskew) >= 1.5:
        flags.append("IMAGE_SKEW")

    severe = {"IMAGE_LOW_RESOLUTION", "IMAGE_DARK", "IMAGE_OVEREXPOSED", "IMAGE_BLUR"}
    severe_count = sum(1 for flag in flags if flag in severe)
    quality_class = "poor" if severe_count >= 2 else ("warning" if flags else "good")

    return {
        "class": quality_class,
        "flags": flags,
        "metrics": {
            "width": int(width),
            "height": int(height),
            "brightness": round(brightness, 2),
            "contrast": round(contrast, 2),
            "sharpness": round(sharpness, 3),
            "darkRatio": round(dark_ratio, 4),
            "overexposedRatio": round(overexposed_ratio, 4),
            "aspectRatio": round(aspect, 3),
            "deskewAngle": round(float(deskew), 2),
        },
    }


def quality_advice(flags: Iterable[str]) -> list[str]:
    values = set(flags or [])
    advice: list[str] = []
    if "IMAGE_LOW_RESOLUTION" in values:
        advice.append("Houd de bon iets dichterbij en zorg dat alle randen zichtbaar zijn.")
    if "IMAGE_DARK" in values:
        advice.append("Maak de foto bij meer licht.")
    if "IMAGE_OVEREXPOSED" in values:
        advice.append("Vermijd fel licht of reflectie op het document.")
    if "IMAGE_BLUR" in values:
        advice.append("Houd de telefoon stil en tik opnieuw om scherp te stellen.")
    if "IMAGE_SKEW" in values:
        advice.append("Houd de camera zo recht mogelijk boven het document.")
    return advice[:3]
