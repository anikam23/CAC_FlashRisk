"""Fast unit tests for MODIS helpers (no Earth Engine / network)."""

from datetime import date

import pandas as pd
import pytest

from app.services.environment.modis_helpers import (
    MAX_LOOKBACK_DAYS,
    MODIS_SCALE_METERS,
    compute_ndvi,
    compute_ndwi,
    extract_bits_int,
    flash_calendar_date_utc,
    is_finite_index,
    lookback_dates,
    lookback_window,
    scaled_reflectance,
)


def test_lookback_excludes_same_day_and_spans_d1_to_d16() -> None:
    flash = pd.Timestamp("2026-09-14 00:36:33.731977462", tz="UTC")
    dates = lookback_dates(flash)
    assert len(dates) == MAX_LOOKBACK_DAYS
    assert dates[0].date() == date(2026, 9, 13)  # D-1
    assert dates[-1].date() == date(2026, 8, 29)  # D-16
    assert flash_calendar_date_utc(flash).date() == date(2026, 9, 14)
    assert all(d < flash_calendar_date_utc(flash) for d in dates)

    window = lookback_window(flash)
    assert window.last_eligible == date(2026, 9, 13)
    assert window.first_eligible == date(2026, 8, 29)
    assert window.flash_date == date(2026, 9, 14)


def test_ndwi_ndvi_formulas_and_scale() -> None:
    green = scaled_reflectance(1000)
    swir = scaled_reflectance(2000)
    red = scaled_reflectance(1500)
    nir = scaled_reflectance(2500)
    assert green == pytest.approx(0.1)
    assert compute_ndwi(green, swir) == pytest.approx((0.1 - 0.2) / (0.1 + 0.2))
    assert compute_ndvi(red, nir) == pytest.approx((0.25 - 0.15) / (0.25 + 0.15))


def test_bit_extraction_matches_inclusive_width() -> None:
    # value with bits 0-1 = 2, bit 2 = 1
    value = 0b100 | 0b10
    assert extract_bits_int(value, 0, 1) == 0b10
    assert extract_bits_int(value, 2) == 1


def test_finite_index_helper() -> None:
    assert is_finite_index(0.0)
    assert is_finite_index(-0.43)
    assert not is_finite_index(None)
    assert not is_finite_index(float("nan"))
    assert not is_finite_index(float("inf"))


def test_native_mod09ga_scale_constant() -> None:
    assert MODIS_SCALE_METERS == 463.31271652791656
