"""Unit tests for GLM helpers (no network)."""

from datetime import UTC, datetime

import pandas as pd
import pytest

from app.services.glm.search import (
    archive_date_bounds,
    centered_window,
    granule_overlaps_window,
    granule_time_range,
    haversine_km,
    parse_goes_timestamp,
)


def test_parse_goes_timestamp_includes_tenths() -> None:
    ts = parse_goes_timestamp("20262610003217")
    assert ts == pd.Timestamp("2026-09-18 00:03:21.700", tz="UTC")


def test_granule_time_range_from_filename() -> None:
    path = (
        "noaa-goes18/GLM-L2-LCFA/2026/261/00/"
        "OR_GLM-L2-LCFA_G18_s20262610003000_e20262610003200_c20262610003217.nc"
    )
    start, end = granule_time_range(path)
    assert start == pd.Timestamp("2026-09-18 00:03:00", tz="UTC")
    assert end == pd.Timestamp("2026-09-18 00:03:20", tz="UTC")


def test_granule_overlaps_window() -> None:
    path = (
        "OR_GLM-L2-LCFA_G18_s20262610003000_e20262610003200_c20262610003217.nc"
    )
    window_start = pd.Timestamp("2026-09-18 00:00:00", tz="UTC")
    window_end = pd.Timestamp("2026-09-18 00:30:00", tz="UTC")
    assert granule_overlaps_window(path, window_start, window_end)

    outside_start = pd.Timestamp("2026-09-18 01:00:00", tz="UTC")
    outside_end = pd.Timestamp("2026-09-18 01:30:00", tz="UTC")
    assert not granule_overlaps_window(path, outside_start, outside_end)


def test_centered_window_half_span() -> None:
    center = datetime(2026, 9, 18, 0, 3, tzinfo=UTC)
    start, end = centered_window(center, 30)
    assert start == datetime(2026, 9, 17, 23, 48, tzinfo=UTC)
    assert end == datetime(2026, 9, 18, 0, 18, tzinfo=UTC)

    start15, end15 = centered_window(center, 15)
    assert (end15 - start15).total_seconds() == 15 * 60


def test_haversine_zero_distance() -> None:
    assert haversine_km(41.0, -121.0, 41.0, -121.0) == pytest.approx(0.0)


def test_archive_date_bounds_dynamic() -> None:
    now = datetime(2026, 9, 23, 15, 0, tzinfo=UTC)
    earliest, latest = archive_date_bounds(now)
    assert earliest.date().isoformat() == "2025-09-23"
    assert latest.date().isoformat() == "2026-09-19"
