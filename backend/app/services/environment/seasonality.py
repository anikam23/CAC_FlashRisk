"""Frozen Notebook 12 seasonality features: season_sin / season_cos.

Exact reproduction of the science-project construction. Sub-microsecond
timestamp digits are ignored because the original pipeline used
``Series.dt.microsecond``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd


@dataclass(frozen=True, slots=True)
class SeasonalityFeatures:
    season_sin: float
    season_cos: float


@dataclass(frozen=True, slots=True)
class SeasonalityResult:
    features: SeasonalityFeatures
    day_of_year: float
    seconds_into_day: float
    fractional_day_of_year: float
    days_in_year: float
    annual_phase: float
    flash_timestamp_utc: pd.Timestamp


def compute_seasonality(
    flash_time_utc: datetime | pd.Timestamp | str,
) -> SeasonalityResult:
    """Compute season_sin and season_cos for a focal GLM flash timestamp (UTC)."""
    # Use a Series because the original Notebook 12 implementation used .dt
    dt = pd.Series(pd.to_datetime([flash_time_utc], utc=True))

    day_of_year = dt.dt.dayofyear.astype(float)

    seconds_into_day = (
        dt.dt.hour * 3600
        + dt.dt.minute * 60
        + dt.dt.second
        + dt.dt.microsecond / 1e6
    )

    fractional_day_of_year = day_of_year - 1.0 + seconds_into_day / 86400.0

    days_in_year = np.where(dt.dt.is_leap_year, 366.0, 365.0)

    annual_phase = 2.0 * np.pi * fractional_day_of_year / days_in_year

    season_sin = np.sin(annual_phase)
    season_cos = np.cos(annual_phase)

    return SeasonalityResult(
        features=SeasonalityFeatures(
            season_sin=float(season_sin.iloc[0]),
            season_cos=float(season_cos.iloc[0]),
        ),
        day_of_year=float(day_of_year.iloc[0]),
        seconds_into_day=float(seconds_into_day.iloc[0]),
        fractional_day_of_year=float(fractional_day_of_year.iloc[0]),
        days_in_year=float(days_in_year[0]),
        annual_phase=float(annual_phase.iloc[0]),
        flash_timestamp_utc=pd.Timestamp(dt.iloc[0]),
    )
