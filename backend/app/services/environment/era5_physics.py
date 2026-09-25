"""Deterministic ERA5-Land physics helpers (no CDS network I/O)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


def saturation_vapor_pressure_kpa(temperature_c: float | np.ndarray) -> float | np.ndarray:
    """Magnus-form saturation vapor pressure in kPa."""
    return 0.6108 * np.exp((17.27 * temperature_c) / (temperature_c + 237.3))


def relative_humidity_pct(temperature_c: float, dewpoint_c: float) -> float:
    es = float(saturation_vapor_pressure_kpa(temperature_c))
    ea = float(saturation_vapor_pressure_kpa(dewpoint_c))
    if es <= 0:
        return 0.0
    return float(np.clip(100.0 * ea / es, 0.0, 100.0))


def vapor_pressure_deficit_kpa(temperature_c: float, dewpoint_c: float) -> float:
    es = float(saturation_vapor_pressure_kpa(temperature_c))
    ea = float(saturation_vapor_pressure_kpa(dewpoint_c))
    return float(max(es - ea, 0.0))


def wind_speed_ms(u10_ms: float, v10_ms: float) -> float:
    return float(np.sqrt(u10_ms**2 + v10_ms**2))


@dataclass(frozen=True, slots=True)
class AtmosphericScalars:
    temperature_2m_c: float
    relative_humidity_pct: float
    vpd_kpa: float
    wind_speed_10m_ms: float


def atmospheric_features_from_kelvin(
    temp_k: float,
    dew_k: float,
    u10_ms: float,
    v10_ms: float,
) -> AtmosphericScalars:
    temp_c = float(temp_k) - 273.15
    dew_c = float(dew_k) - 273.15
    return AtmosphericScalars(
        temperature_2m_c=temp_c,
        relative_humidity_pct=relative_humidity_pct(temp_c, dew_c),
        vpd_kpa=vapor_pressure_deficit_kpa(temp_c, dew_c),
        wind_speed_10m_ms=wind_speed_ms(u10_ms, v10_ms),
    )


def reconstruct_hourly_precip_mm(
    times: pd.Series | np.ndarray,
    tp_m: np.ndarray,
) -> np.ndarray:
    """Convert ERA5-Land accumulated total precipitation (m) to hourly mm.

    Frozen convention:
    - 01 UTC: increment = tp(01)
    - 02–23 UTC: increment = tp(H) - tp(H-1) when previous hour is contiguous
    - 00 UTC: increment = tp(00) - previous-day tp(23) when contiguous
    Tiny negatives in (-1e-8, 0) clamp to 0.
    """
    frame = pd.DataFrame(
        {
            "time": pd.to_datetime(times, utc=True),
            "tp_m": np.asarray(tp_m, dtype=float),
        }
    ).sort_values("time").reset_index(drop=True)

    frame["prev_tp_m"] = frame["tp_m"].shift(1)
    frame["prev_time"] = frame["time"].shift(1)

    hourly_mm = np.full(len(frame), np.nan, dtype=float)

    for i in range(len(frame)):
        timestamp = frame.loc[i, "time"]
        hour = int(timestamp.hour)
        current = float(frame.loc[i, "tp_m"])
        increment_m = np.nan

        if hour == 1:
            increment_m = current
        elif 2 <= hour <= 23 or hour == 0:
            prev = frame.loc[i, "prev_tp_m"]
            prev_time = frame.loc[i, "prev_time"]
            if (
                pd.notna(prev)
                and pd.notna(prev_time)
                and (timestamp - prev_time == pd.Timedelta(hours=1))
            ):
                increment_m = current - float(prev)

        if np.isfinite(increment_m) and increment_m < 0 and increment_m > -1e-8:
            increment_m = 0.0

        if np.isfinite(increment_m):
            hourly_mm[i] = increment_m * 1000.0

    # Restore original caller order if input was pre-sorted; callers sort anyway.
    return hourly_mm


def sum_precip_window_mm(
    *,
    times: pd.Series | np.ndarray,
    precip_hour_mm: np.ndarray,
    flash_time: pd.Timestamp,
    hours: int,
) -> tuple[float, int, int]:
    """Sum hourly precip for flash_time - hours <= t < flash_time.

    Returns (sum_mm_or_nan, n_rows, n_valid).
    """
    flash_time = pd.Timestamp(flash_time)
    if flash_time.tzinfo is None:
        flash_time = flash_time.tz_localize("UTC")
    else:
        flash_time = flash_time.tz_convert("UTC")

    frame = pd.DataFrame(
        {
            "time": pd.to_datetime(times, utc=True),
            "precip_hour_mm": np.asarray(precip_hour_mm, dtype=float),
        }
    )
    start = flash_time - pd.Timedelta(hours=hours)
    mask = (frame["time"] >= start) & (frame["time"] < flash_time)
    subset = frame.loc[mask, ["time", "precip_hour_mm"]]
    n_rows = len(subset)
    n_valid = int(subset["precip_hour_mm"].notna().sum())
    value = subset["precip_hour_mm"].sum(min_count=n_rows)
    total = float(value) if pd.notna(value) else float("nan")
    return total, n_rows, n_valid
