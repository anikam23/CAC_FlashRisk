"""Fast unit tests for SMAP temporal helpers (no Earth Engine / network)."""

from datetime import UTC, datetime

import pandas as pd
import pytest

from app.services.environment.smap_timing import (
    SMAP_HALF_INTERVAL,
    interval_bounds,
    interval_completed_by_flash,
    latest_eligible_midpoint,
)


def test_latest_eligible_midpoint_matches_frozen_rule() -> None:
    flash = pd.Timestamp("2026-09-14 00:36:33.731977462", tz="UTC")
    eligible = latest_eligible_midpoint(flash)
    assert eligible == flash - SMAP_HALF_INTERVAL
    assert eligible == pd.Timestamp("2026-09-13 23:06:33.731977462", tz="UTC")


def test_golden_interval_bounds_and_completion() -> None:
    flash = pd.Timestamp("2026-09-14 00:36:33.731977462", tz="UTC")
    midpoint = pd.Timestamp("2026-09-13 22:30:00", tz="UTC")
    start, end = interval_bounds(midpoint)

    assert start == pd.Timestamp("2026-09-13 21:00:00", tz="UTC")
    assert end == pd.Timestamp("2026-09-14 00:00:00", tz="UTC")
    assert interval_completed_by_flash(midpoint, flash)
    assert midpoint <= latest_eligible_midpoint(flash)

    # A midpoint whose interval would end after the flash must be rejected.
    leaky = pd.Timestamp("2026-09-13 23:30:00", tz="UTC")
    assert not interval_completed_by_flash(leaky, flash)
    assert leaky > latest_eligible_midpoint(flash)


def test_timing_helpers_require_aware_timestamps() -> None:
    naive = datetime(2026, 9, 14, 0, 36, 33)
    with pytest.raises(ValueError):
        latest_eligible_midpoint(pd.Timestamp(naive))
    with pytest.raises(ValueError):
        interval_bounds(pd.Timestamp(naive))
