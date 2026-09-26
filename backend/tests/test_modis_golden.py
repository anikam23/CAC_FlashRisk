"""Live Earth Engine golden parity for the validated Sep 14 MODIS reference flash.

Requires:
  - EE_PROJECT in backend/.env
  - Prior local Earth Engine authentication (same path as SMAP)
  - Production code does not call ee.Authenticate()

Run explicitly (excluded from the default suite):

  .\\.venv\\Scripts\\python.exe -m pytest -m integration tests/test_modis_golden.py -s
"""

from datetime import date

import pandas as pd
import pytest

from app.core.config import get_settings
from app.services.environment import fetch_modis_features

pytestmark = pytest.mark.integration

GOLDEN_FLASH_TIME = pd.Timestamp("2026-09-14 00:36:33.731977462", tz="UTC")
GOLDEN_LAT = 36.68301010131836
GOLDEN_LON = -119.8039321899414

EXPECTED_NDWI_DATE = date(2026, 9, 13)
EXPECTED_NDVI_DATE = date(2026, 9, 13)
EXPECTED_NDWI = -0.43486323597589244
EXPECTED_NDVI = 0.2208115509086383

ABS_TOL = 1e-12


@pytest.mark.integration
def test_golden_modis_sep14_parity() -> None:
    get_settings.cache_clear()
    result = fetch_modis_features(
        flash_time_utc=GOLDEN_FLASH_TIME,
        latitude=GOLDEN_LAT,
        longitude=GOLDEN_LON,
    )

    print(f"\nMODIS golden retrieval_seconds={result.retrieval_seconds:.2f}")
    print(f"ndwi_date={result.ndwi_observation_date} value={result.features.modis_ndwi!r}")
    print(f"ndvi_date={result.ndvi_observation_date} value={result.features.modis_ndvi!r}")

    assert result.ndwi_observation_date == EXPECTED_NDWI_DATE
    assert result.ndvi_observation_date == EXPECTED_NDVI_DATE
    assert result.features.modis_ndwi == pytest.approx(EXPECTED_NDWI, rel=0, abs=ABS_TOL)
    assert result.features.modis_ndvi == pytest.approx(EXPECTED_NDVI, rel=0, abs=ABS_TOL)
