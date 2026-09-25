"""Live CDS golden parity for the validated Sep 14 ERA5-Land reference flash.

Requires CDS_API_KEY in backend/.env. Makes real Copernicus Climate Data Store
requests and may take several minutes.

Run explicitly (excluded from the default suite):

  .\\.venv\\Scripts\\python.exe -m pytest -m integration tests/test_era5_golden.py -s
"""

from datetime import UTC, datetime

import pandas as pd
import pytest

from app.core.config import get_settings
from app.services.environment import fetch_era5_features

pytestmark = pytest.mark.integration

GOLDEN_FLASH_TIME = pd.Timestamp("2026-09-14 00:36:33.731977462", tz="UTC")
GOLDEN_LAT = 36.68301010131836
GOLDEN_LON = -119.8039321899414

EXPECTED_GRID_LAT = 36.7
EXPECTED_GRID_LON = -119.8
EXPECTED_ATM_TIME = datetime(2026, 9, 14, 0, 0, 0, tzinfo=UTC)

EXPECTED = {
    "era5_temperature_2m_c": 30.2089477539063,
    "era5_relative_humidity_pct": 16.8034562324128,
    "era5_vpd_kpa": 3.57261182637014,
    "era5_precip_24h_mm": 0.000435113804542198,
    "era5_precip_72h_mm": 0.00345431197956714,
    "era5_precip_168h_mm": 0.0064675211319809,
    "era5_wind_speed_10m_ms": 4.53343557078636,
    "era5_precip_30d_mm": 0.456632502164211,
}

# Tight enough to catch scientific regressions; loose enough for NetCDF float noise.
ABS_TOL = {
    "era5_temperature_2m_c": 1e-6,
    "era5_relative_humidity_pct": 1e-6,
    "era5_vpd_kpa": 1e-6,
    "era5_precip_24h_mm": 1e-9,
    "era5_precip_72h_mm": 1e-9,
    "era5_precip_168h_mm": 1e-9,
    "era5_wind_speed_10m_ms": 1e-6,
    "era5_precip_30d_mm": 1e-8,
}


@pytest.mark.integration
def test_golden_era5_sep14_parity() -> None:
    get_settings.cache_clear()
    result = fetch_era5_features(
        flash_time_utc=GOLDEN_FLASH_TIME,
        latitude=GOLDEN_LAT,
        longitude=GOLDEN_LON,
    )

    print(f"\nERA5 golden retrieval_seconds={result.retrieval_seconds:.1f}")
    print(f"grid=({result.grid_latitude}, {result.grid_longitude})")
    print(f"atm_time={result.atmospheric_timestamp_utc.isoformat()}")
    for name, expected in EXPECTED.items():
        actual = getattr(result.features, name)
        print(f"  {name}={actual}")
        assert actual == pytest.approx(expected, rel=0, abs=ABS_TOL[name]), name

    assert result.grid_latitude == pytest.approx(EXPECTED_GRID_LAT, abs=1e-6)
    assert result.grid_longitude == pytest.approx(EXPECTED_GRID_LON, abs=1e-6)
    assert result.atmospheric_timestamp_utc == EXPECTED_ATM_TIME
