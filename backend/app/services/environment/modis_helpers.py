"""Deterministic MODIS index / lookback helpers (no Earth Engine I/O)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd

MODIS_COLLECTION = "MODIS/061/MOD09GA"
# Notebook 10 / 12 native nominal MOD09GA extraction scale.
MODIS_SCALE_METERS = 463.31271652791656
MAX_LOOKBACK_DAYS = 16
REFLECTANCE_SCALE = 0.0001


def flash_calendar_date_utc(flash_time: pd.Timestamp) -> pd.Timestamp:
    """UTC calendar day of the flash (normalized midnight). Same-day imagery excluded."""
    flash_time = pd.Timestamp(flash_time)
    if flash_time.tzinfo is None:
        raise ValueError("flash_time must be timezone-aware UTC")
    return flash_time.tz_convert("UTC").normalize()


def lookback_dates(flash_time: pd.Timestamp) -> list[pd.Timestamp]:
    """Eligible MOD09GA dates: D-1 through D-16 (inclusive), chronological search order."""
    flash_date = flash_calendar_date_utc(flash_time)
    return [flash_date - pd.Timedelta(days=lag) for lag in range(1, MAX_LOOKBACK_DAYS + 1)]


def compute_ndwi(green_reflectance: float, swir_reflectance: float) -> float:
    """NDWI = (green - SWIR) / (green + SWIR)."""
    return (green_reflectance - swir_reflectance) / (green_reflectance + swir_reflectance)


def compute_ndvi(red_reflectance: float, nir_reflectance: float) -> float:
    """NDVI = (NIR - red) / (NIR + red)."""
    return (nir_reflectance - red_reflectance) / (nir_reflectance + red_reflectance)


def scaled_reflectance(raw_dn: float) -> float:
    """Apply frozen MOD09GA reflectance scale factor."""
    return float(raw_dn) * REFLECTANCE_SCALE


def is_finite_index(value: float | None) -> bool:
    if value is None:
        return False
    try:
        f = float(value)
    except (TypeError, ValueError):
        return False
    return f == f and f not in (float("inf"), float("-inf"))


def extract_bits_int(value: int, start: int, end: int | None = None) -> int:
    """Pure-Python inclusive bit-field extraction matching the frozen EE helper."""
    if end is None:
        end = start
    width = end - start + 1
    mask = (1 << width) - 1
    return (int(value) >> start) & mask


@dataclass(frozen=True, slots=True)
class LookbackWindow:
    first_eligible: date
    last_eligible: date
    flash_date: date


def lookback_window(flash_time: pd.Timestamp) -> LookbackWindow:
    flash_date = flash_calendar_date_utc(flash_time)
    dates = lookback_dates(flash_time)
    return LookbackWindow(
        first_eligible=dates[-1].date(),
        last_eligible=dates[0].date(),
        flash_date=flash_date.date(),
    )
