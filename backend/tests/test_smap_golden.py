"""Live Earth Engine golden parity for the validated Sep 14 SMAP reference flash.

Requires:
  - EE_PROJECT in backend/.env (e.g. lightning-ignition-research)
  - One-time local Earth Engine authentication for this Python environment
    (production code does not call ee.Authenticate())

Run explicitly (excluded from the default suite):

  .\\.venv\\Scripts\\python.exe -m pytest -m integration tests/test_smap_golden.py -s
"""

from datetime import UTC, datetime

import pandas as pd
import pytest

from app.core.config import get_settings
from app.services.environment import fetch_smap_features

pytestmark = pytest.mark.integration

GOLDEN_FLASH_TIME = pd.Timestamp("2026-09-14 00:36:33.731977462", tz="UTC")
GOLDEN_LAT = 36.68301010131836
GOLDEN_LON = -119.8039321899414

EXPECTED_MIDPOINT = datetime(2026, 9, 13, 22, 30, 0, tzinfo=UTC)
EXPECTED_INTERVAL_START = datetime(2026, 9, 13, 21, 0, 0, tzinfo=UTC)
EXPECTED_INTERVAL_END = datetime(2026, 9, 14, 0, 0, 0, tzinfo=UTC)

EXPECTED_SURFACE = 0.0262094028294086
EXPECTED_ROOTZONE = 0.0473873689770699

# Tight enough for parity regressions; loose enough for EE float transport.
ABS_TOL = 1e-9


@pytest.mark.integration
def test_golden_smap_sep14_parity() -> None:
    get_settings.cache_clear()
    result = fetch_smap_features(
        flash_time_utc=GOLDEN_FLASH_TIME,
        latitude=GOLDEN_LAT,
        longitude=GOLDEN_LON,
    )

    print(f"\nSMAP golden retrieval_seconds={result.retrieval_seconds:.2f}")
    print(f"midpoint={result.midpoint_utc.isoformat()}")
    print(f"interval_start={result.interval_start_utc.isoformat()}")
    print(f"interval_end={result.interval_end_utc.isoformat()}")
    print(f"smap_surface_soil_moisture={result.features.smap_surface_soil_moisture}")
    print(f"smap_rootzone_soil_moisture={result.features.smap_rootzone_soil_moisture}")

    assert result.midpoint_utc == EXPECTED_MIDPOINT
    assert result.interval_start_utc == EXPECTED_INTERVAL_START
    assert result.interval_end_utc == EXPECTED_INTERVAL_END
    assert pd.Timestamp(result.interval_end_utc) <= GOLDEN_FLASH_TIME

    assert result.features.smap_surface_soil_moisture == pytest.approx(
        EXPECTED_SURFACE, rel=0, abs=ABS_TOL
    )
    assert result.features.smap_rootzone_soil_moisture == pytest.approx(
        EXPECTED_ROOTZONE, rel=0, abs=ABS_TOL
    )
