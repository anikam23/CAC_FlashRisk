"""Fast unit tests for frozen Notebook 12 seasonality features."""

import numpy as np
import pandas as pd
import pytest

from app.services.environment.seasonality import compute_seasonality

GOLDEN_FLASH = "2026-09-14 00:36:33.731977462+00:00"

EXPECTED_DAY_OF_YEAR = 257.0
EXPECTED_SECONDS_INTO_DAY = 2193.731977
EXPECTED_FRACTIONAL_DAY = 256.02539041640046
EXPECTED_DAYS_IN_YEAR = 365.0
EXPECTED_PHASE = 4.407273894052724
EXPECTED_SIN = -0.9538123866109678
EXPECTED_COS = -0.30040294796737566

ABS_TOL = 1e-15


def test_golden_sep14_seasonality_parity() -> None:
    result = compute_seasonality(GOLDEN_FLASH)

    assert result.day_of_year == pytest.approx(EXPECTED_DAY_OF_YEAR, abs=0)
    assert result.seconds_into_day == pytest.approx(EXPECTED_SECONDS_INTO_DAY, abs=ABS_TOL)
    assert result.fractional_day_of_year == pytest.approx(EXPECTED_FRACTIONAL_DAY, abs=ABS_TOL)
    assert result.days_in_year == EXPECTED_DAYS_IN_YEAR
    assert result.annual_phase == pytest.approx(EXPECTED_PHASE, abs=ABS_TOL)
    assert result.features.season_sin == pytest.approx(EXPECTED_SIN, abs=ABS_TOL)
    assert result.features.season_cos == pytest.approx(EXPECTED_COS, abs=ABS_TOL)


def test_sub_microsecond_digits_do_not_affect_seasonality() -> None:
    """dt.microsecond truncates; ns beyond microseconds must not change features."""
    base = pd.Timestamp("2026-09-14 00:36:33.731977000+00:00")
    with_ns = pd.Timestamp("2026-09-14 00:36:33.731977462+00:00")
    assert base.value != with_ns.value

    a = compute_seasonality(base)
    b = compute_seasonality(with_ns)
    assert a.seconds_into_day == b.seconds_into_day
    assert a.features.season_sin == b.features.season_sin
    assert a.features.season_cos == b.features.season_cos
    assert a.seconds_into_day == pytest.approx(2193.731977, abs=ABS_TOL)


def test_leap_year_uses_366_days() -> None:
    # 2024 is a leap year; day 60 is 29 Feb.
    leap = compute_seasonality("2024-02-29 12:00:00+00:00")
    assert leap.days_in_year == 366.0
    assert leap.day_of_year == 60.0

    common = compute_seasonality("2026-02-28 12:00:00+00:00")
    assert common.days_in_year == 365.0


def test_unit_circle_property() -> None:
    result = compute_seasonality(GOLDEN_FLASH)
    unit = result.features.season_sin**2 + result.features.season_cos**2
    assert unit == pytest.approx(1.0, rel=0, abs=1e-12)

    # Spot-check another date as well.
    other = compute_seasonality("2024-07-01 00:00:00+00:00")
    other_unit = other.features.season_sin**2 + other.features.season_cos**2
    assert other_unit == pytest.approx(1.0, rel=0, abs=1e-12)
    assert np.isfinite(other.features.season_sin)
    assert np.isfinite(other.features.season_cos)
