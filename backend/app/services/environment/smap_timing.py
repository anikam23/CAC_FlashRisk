"""Deterministic SMAP temporal helpers (no Earth Engine / network I/O)."""

from __future__ import annotations

import pandas as pd

SMAP_HALF_INTERVAL = pd.Timedelta(minutes=90)


def latest_eligible_midpoint(flash_time: pd.Timestamp) -> pd.Timestamp:
    """Latest SMAP interval midpoint that is fully completed by flash time.

    Earth Engine ``system:time_start`` is the 3-hour interval midpoint.
    Eligibility: midpoint + 90 min <= flash  ⟺  midpoint <= flash - 90 min.
    """
    flash_time = pd.Timestamp(flash_time)
    if flash_time.tzinfo is None:
        raise ValueError("flash_time must be timezone-aware UTC")
    return flash_time.tz_convert("UTC") - SMAP_HALF_INTERVAL


def interval_bounds(midpoint: pd.Timestamp) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Return (interval_start, interval_end) for a SMAP 3-hour averaging interval."""
    midpoint = pd.Timestamp(midpoint)
    if midpoint.tzinfo is None:
        raise ValueError("midpoint must be timezone-aware UTC")
    midpoint = midpoint.tz_convert("UTC")
    return midpoint - SMAP_HALF_INTERVAL, midpoint + SMAP_HALF_INTERVAL


def interval_completed_by_flash(midpoint: pd.Timestamp, flash_time: pd.Timestamp) -> bool:
    """True iff the SMAP averaging interval ends at or before the flash."""
    _, interval_end = interval_bounds(midpoint)
    flash_time = pd.Timestamp(flash_time)
    if flash_time.tzinfo is None:
        raise ValueError("flash_time must be timezone-aware UTC")
    return interval_end <= flash_time.tz_convert("UTC")
