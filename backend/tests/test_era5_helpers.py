"""Fast unit tests for ERA5-Land physics helpers (no CDS network)."""

from datetime import UTC, datetime
import warnings

import numpy as np
import pandas as pd
import pytest
import xarray as xr

from app.services.environment.era5 import (
    Era5ConfigError,
    Era5CoverageError,
    _extract_wind_speed_ms,
    ensure_utc_timestamp,
    nearest_abs_time_index,
    rank_wind_candidate_cells,
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
    # Tiny negative artifact clamps to 0 under Notebook 10 mm rule
    assert hourly[4] == pytest.approx(0.0)


def test_notebook10_negative_precip_clamp_mm() -> None:
    """Notebook 10: clamp only when -1e-3 <= increment_mm < 0 (after m→mm)."""
    times = pd.to_datetime(
        [
            "2026-09-14 01:00:00",
            "2026-09-14 02:00:00",
            "2026-09-14 03:00:00",
            "2026-09-14 04:00:00",
            "2026-09-14 05:00:00",
        ],
        utc=True,
    )
    # Construct known mm increments via tp differences (×1000):
    # 01: +1.0 mm (tp=0.001)
    # 02: -1.5e-5 mm (should clamp → 0)
    # 03: -1e-3 mm (boundary; should clamp → 0)
    # 04: -1.1e-3 mm (below threshold; must NOT clamp)
    # 05: +0.5 mm (unchanged)
    tp_m = np.array(
        [
            0.001,
            0.001 - 1.5e-8,
            (0.001 - 1.5e-8) - 1e-6,
            (0.001 - 1.5e-8) - 1e-6 - 1.1e-6,
            (0.001 - 1.5e-8) - 1e-6 - 1.1e-6 + 0.0005,
        ],
        dtype=float,
    )
    hourly = reconstruct_hourly_precip_mm(times, tp_m)

    assert hourly[0] == pytest.approx(1.0)
    assert hourly[1] == 0.0  # -1.5e-5 mm clamped
    assert hourly[2] == 0.0  # -1e-3 mm boundary clamped
    assert hourly[3] == pytest.approx(-1.1e-3)  # materially negative retained
    assert hourly[4] == pytest.approx(0.5)



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


def test_raw_tp_window_sums_tp_times_1000() -> None:
    """Notebook 12 Step 6: sum(raw tp_m * 1000), no hourly reconstruction."""
    from app.services.environment.era5_physics import sum_raw_tp_window_mm

    flash = pd.Timestamp("2026-09-14 00:36:33", tz="UTC")
    times = pd.date_range("2026-09-13 01:00:00", periods=24, freq="h", tz="UTC")
    tp_m = np.full(24, 0.001, dtype=float)  # 1 mm equivalent each if treated as raw
    total, n_rows, n_valid = sum_raw_tp_window_mm(
        times=times,
        tp_m=tp_m,
        flash_time=flash,
        hours=24,
    )
    assert n_rows == 24
    assert n_valid == 24
    assert total == pytest.approx(24.0)



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


def test_rank_wind_candidates_cosine_longitude_and_order() -> None:
    # 0.1° ERA5-Land style neighborhood around a mid-latitude flash.
    lats = np.array([41.4, 41.5, 41.6, 41.7, 41.8], dtype=float)
    lons = np.array([-122.4, -122.3, -122.2, -122.1, -122.0], dtype=float)
    flash_lat = 41.55
    flash_lon = -122.25
    ranked = rank_wind_candidate_cells(lats, lons, flash_lat, flash_lon, k=4)
    assert len(ranked) == 16
    # Closest cell should be (41.6, -122.2) or (41.5, -122.3)/(41.5,-122.2) etc.
    # Verify cosine weighting: a cell farther in lon but nearer in lat can win.
    cos_lat = np.cos(np.deg2rad(flash_lat))

    def dist2(lat: float, lon: float) -> float:
        return (lat - flash_lat) ** 2 + ((lon - flash_lon) * cos_lat) ** 2

    dists = [dist2(la, lo) for la, lo in ranked]
    assert dists == sorted(dists)
    # First four latitudes used are the four nearest to 41.55 → 41.5,41.6,41.4,41.7
    used_lats = {la for la, _ in ranked}
    assert used_lats == {41.4, 41.5, 41.6, 41.7}


def test_nearest_abs_time_index_prefers_closest_not_latest_before() -> None:
    times = pd.to_datetime(
        ["2025-08-01 00:00:00", "2025-08-01 01:00:00", "2025-08-01 02:00:00"],
        utc=True,
    )
    # Flash 00:50 → closest is 01:00 (10 min), not latest-at-or-before 00:00 (50 min).
    flash = pd.Timestamp("2025-08-01 00:50:00", tz="UTC")
    assert nearest_abs_time_index(times, flash) == 1
    # Exact match
    assert nearest_abs_time_index(times, pd.Timestamp("2025-08-01 01:00:00", tz="UTC")) == 1


def test_extract_wind_skips_nonfinite_cell_then_uses_next() -> None:
    times = pd.to_datetime(
        ["2025-08-01 00:00:00", "2025-08-01 01:00:00"],
        utc=True,
    )
    lats = np.array([40.0, 40.1], dtype=float)
    lons = np.array([-120.0, -119.9], dtype=float)
    # Shape (time, lat, lon). Closest cell (40.0, -120.0) is NaN; next finite.
    u = np.full((2, 2, 2), np.nan, dtype=float)
    v = np.full((2, 2, 2), np.nan, dtype=float)
    # At 01:00 (index 1), second-ranked finite cell: lat 40.0 lon -119.9 → u=3, v=4
    u[1, 0, 1] = 3.0
    v[1, 0, 1] = 4.0
    # Also put a wrong value at 00:00 on nearest cell to ensure abs-nearest time is used.
    u[0, 0, 0] = 100.0
    v[0, 0, 0] = 0.0

    ds_u = xr.DataArray(
        u,
        dims=("time", "latitude", "longitude"),
        coords={"time": times, "latitude": lats, "longitude": lons},
    )
    ds_v = xr.DataArray(
        v,
        dims=("time", "latitude", "longitude"),
        coords={"time": times, "latitude": lats, "longitude": lons},
    )
    flash = pd.Timestamp("2025-08-01 00:50:00", tz="UTC")
    speed = _extract_wind_speed_ms(
        ds_u,
        ds_v,
        flash_time=flash,
        latitude=40.0,
        longitude=-120.0,
    )
    assert speed == pytest.approx(5.0)


def test_extract_wind_raises_when_all_candidates_nonfinite() -> None:
    times = pd.to_datetime(["2025-08-01 00:00:00"], utc=True)
    lats = np.array([40.0, 40.1], dtype=float)
    lons = np.array([-120.0, -119.9], dtype=float)
    u = np.full((1, 2, 2), np.nan, dtype=float)
    v = np.full((1, 2, 2), np.nan, dtype=float)
    ds_u = xr.DataArray(
        u,
        dims=("time", "latitude", "longitude"),
        coords={"time": times, "latitude": lats, "longitude": lons},
    )
    ds_v = xr.DataArray(
        v,
        dims=("time", "latitude", "longitude"),
        coords={"time": times, "latitude": lats, "longitude": lons},
    )
    with pytest.raises(Era5CoverageError, match="No finite ERA5-Land 10 m wind"):
        _extract_wind_speed_ms(
            ds_u,
            ds_v,
            flash_time=pd.Timestamp("2025-08-01 00:00:00", tz="UTC"),
            latitude=40.0,
            longitude=-120.0,
        )
