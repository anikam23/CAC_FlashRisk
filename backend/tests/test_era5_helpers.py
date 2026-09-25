"""Fast unit tests for ERA5-Land physics helpers (no CDS network)."""

from datetime import UTC, datetime
import warnings

import numpy as np
import pandas as pd
import pytest

from app.services.environment.era5 import (
    Era5ConfigError,
    ensure_utc_timestamp,
    timestamp_to_utc_datetime,
)
from app.services.environment.era5_physics import (
    atmospheric_features_from_kelvin,
    reconstruct_hourly_precip_mm,
    relative_humidity_pct,
    saturation_vapor_pressure_kpa,
    sum_precip_window_mm,
    vapor_pressure_deficit_kpa,
    wind_speed_ms,
)


def test_saturation_vapor_pressure_known_point() -> None:
    # es(30 C) is a well-known Magnus check value (~4.24 kPa).
    es = float(saturation_vapor_pressure_kpa(30.0))
    assert es == pytest.approx(4.2455, rel=0, abs=5e-3)


def test_rh_and_vpd_clip_and_nonnegative() -> None:
    rh = relative_humidity_pct(30.0, 5.0)
    vpd = vapor_pressure_deficit_kpa(30.0, 5.0)
    es = float(saturation_vapor_pressure_kpa(30.0))
    ea = float(saturation_vapor_pressure_kpa(5.0))
    assert 0.0 <= rh <= 100.0
    assert vpd >= 0.0
    assert rh == pytest.approx(100.0 * ea / es, abs=1e-12)
    assert vpd == pytest.approx(es - ea, abs=1e-12)


def test_wind_magnitude() -> None:
    assert wind_speed_ms(3.0, 4.0) == pytest.approx(5.0)


def test_atmospheric_features_from_kelvin() -> None:
    # 303.3589477539063 K ~= 30.2089477539063 C (golden temp)
    feats = atmospheric_features_from_kelvin(
        temp_k=30.2089477539063 + 273.15,
        dew_k=5.0 + 273.15,
        u10_ms=3.0,
        v10_ms=4.0,
    )
    assert feats.temperature_2m_c == pytest.approx(30.2089477539063, abs=1e-9)
    assert feats.wind_speed_10m_ms == pytest.approx(5.0)
    assert 0.0 <= feats.relative_humidity_pct <= 100.0
    assert feats.vpd_kpa >= 0.0


def test_reconstruct_hourly_precip_convention() -> None:
    times = pd.to_datetime(
        [
            "2026-09-13 23:00:00",
            "2026-09-14 00:00:00",
            "2026-09-14 01:00:00",
            "2026-09-14 02:00:00",
            "2026-09-14 03:00:00",
        ],
        utc=True,
    )
    # Accumulated tp (m): day cycle resets after 00 in ERA5-Land convention used here.
    tp_m = np.array([0.010, 0.012, 0.001, 0.003, 0.003 - 5e-10], dtype=float)
    hourly = reconstruct_hourly_precip_mm(times, tp_m)

    # 00 UTC = tp(00) - tp(prev 23)
    assert hourly[1] == pytest.approx((0.012 - 0.010) * 1000.0)
    # 01 UTC = tp(01)
    assert hourly[2] == pytest.approx(0.001 * 1000.0)
    # 02 UTC = tp(02) - tp(01)
    assert hourly[3] == pytest.approx((0.003 - 0.001) * 1000.0)
    # Tiny negative artifact clamps to 0
    assert hourly[4] == pytest.approx(0.0)


def test_precip_window_requires_exact_coverage() -> None:
    flash = pd.Timestamp("2026-09-14 00:36:33", tz="UTC")
    times = pd.date_range("2026-09-13 01:00:00", periods=24, freq="h", tz="UTC")
    precip = np.ones(24, dtype=float)
    total, n_rows, n_valid = sum_precip_window_mm(
        times=times,
        precip_hour_mm=precip,
        flash_time=flash,
        hours=24,
    )
    assert n_rows == 24
    assert n_valid == 24
    assert total == pytest.approx(24.0)

    precip_missing = precip.copy()
    precip_missing[3] = np.nan
    total2, n_rows2, n_valid2 = sum_precip_window_mm(
        times=times,
        precip_hour_mm=precip_missing,
        flash_time=flash,
        hours=24,
    )
    assert n_rows2 == 24
    assert n_valid2 == 23
    assert np.isnan(total2)


def test_ensure_utc_rejects_naive() -> None:
    with pytest.raises(Era5ConfigError):
        ensure_utc_timestamp(datetime(2026, 9, 14, 0, 36, 33))

    ts = ensure_utc_timestamp(datetime(2026, 9, 14, 0, 36, 33, tzinfo=UTC))
    assert str(ts.tz) == "UTC"


def test_timestamp_to_utc_datetime_truncates_nanoseconds_without_warning() -> None:
    # Same sub-microsecond precision as the Sep 14 reference flash.
    ts = pd.Timestamp("2026-09-14 00:36:33.731977462", tz="UTC")
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        converted = timestamp_to_utc_datetime(ts)

    # 731977462 ns → microsecond 731977 (truncate leftover 462 ns; never round up).
    assert converted == datetime(2026, 9, 14, 0, 36, 33, 731977, tzinfo=UTC)
    assert pd.Timestamp(converted) <= ts
    assert not any("nanosecond" in str(w.message).lower() for w in caught)
