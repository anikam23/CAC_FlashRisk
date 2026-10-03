"""Scene-selection rules for display-only Sentinel-2 surveillance imagery.

These rules follow the Sentinel-2 feasibility reference:
pre-flash lookback, newest-to-oldest search, and a Cloud Score+ clarity
threshold. This module does not call Earth Engine and is not a model input.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

LOOKBACK_DAYS = 30
CLEAR_THRESHOLD = 0.60

S2_COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"
CLOUD_SCORE_COLLECTION = "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED"
CLOUD_SCORE_BAND = "cs_cdf"
TRUE_COLOR_BANDS = ("B4", "B3", "B2")

# Surface-reflectance stretch demonstrated by the feasibility reference.
VIS_MIN = 0
VIS_MAX = 3000
VIS_GAMMA = 1.15

# Scene search only needs to intersect the flash, matching the reference.
SEARCH_BUFFER_M = 1000
CLARITY_SCALE_M = 10
CLARITY_MAX_PIXELS = 100

# Exact 10 km surveillance circle drawn in the interface.
SURVEILLANCE_RADIUS_M = 10_000
SURVEILLANCE_RADIUS_KM = 10
# Thumbnail footprint is wider than that circle so the boundary is not cropped.
SURVEILLANCE_FRAME_RADIUS_M = 12_500
THUMB_MAX_DIMENSION = 1400

UNAVAILABLE_MESSAGE = (
    "No qualifying clear pre-flash Sentinel-2 observation was found "
    "within the 30-day window."
)


@dataclass(frozen=True, slots=True)
class SceneCandidate:
    """One Sentinel-2 scene already ordered for selection tests or retrieval."""

    acquired_utc: datetime
    point_clarity: float | None
    scene_cloud_pct: float | None = None


def require_utc(value: datetime) -> datetime:
    """Reject naive timestamps so the flash day is unambiguous."""
    if value.tzinfo is None:
        raise ValueError("Flash timestamp must be timezone-aware UTC.")
    return value.astimezone(UTC)


def flash_calendar_day(flash_time: datetime) -> date:
    """UTC calendar day of the flash. Same-day imagery is not eligible."""
    return require_utc(flash_time).date()


def pre_flash_search_window(flash_time: datetime) -> tuple[date, date]:
    """Return ``[start, end)`` calendar dates for the 30-day pre-flash search.

    ``end`` is the flash calendar day and is exclusive, so the flash day and
    every later day are outside the window. ``start`` is 30 days earlier.
    """
    flash_day = flash_calendar_day(flash_time)
    return flash_day - timedelta(days=LOOKBACK_DAYS), flash_day


def scene_is_pre_flash(acquired_utc: datetime, flash_day: date) -> bool:
    """True only when the scene calendar day is strictly before the flash day."""
    acquired_day = require_utc(acquired_utc).date()
    return acquired_day < flash_day


def scene_meets_clarity(point_clarity: float | None) -> bool:
    """Cloud Score+ at the flash must be finite and at least 0.60."""
    if point_clarity is None:
        return False
    if isinstance(point_clarity, bool) or not isinstance(point_clarity, (int, float)):
        return False
    if not math.isfinite(float(point_clarity)):
        return False
    return float(point_clarity) >= CLEAR_THRESHOLD


def select_qualifying_scene(
    scenes: list[SceneCandidate] | tuple[SceneCandidate, ...],
    flash_time: datetime,
) -> SceneCandidate | None:
    """Pick the newest pre-flash scene whose point clarity meets the threshold.

    Scenes are compared by acquisition time, newest first. Equal timestamps
    keep their incoming order. Clarity values are not modified. Same-day and
    post-flash scenes are ignored even if they are clearer.
    """
    flash_day = flash_calendar_day(flash_time)
    ordered = sorted(
        scenes,
        key=lambda scene: require_utc(scene.acquired_utc),
        reverse=True,
    )
    for scene in ordered:
        if not scene_is_pre_flash(scene.acquired_utc, flash_day):
            continue
        if scene_meets_clarity(scene.point_clarity):
            return scene
    return None


def png_dimensions(data: bytes) -> tuple[int, int]:
    """Read width and height from a PNG header."""
    signature = b"\x89PNG\r\n\x1a\n"
    if len(data) < 24 or data[:8] != signature:
        raise ValueError("Thumbnail was not a PNG.")
    width, height = struct.unpack(">II", data[16:24])
    if width <= 0 or height <= 0:
        raise ValueError("Thumbnail PNG had an empty size.")
    return int(width), int(height)
