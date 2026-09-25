"""Live NOAA S3 golden parity for the validated GLM search case.

Run explicitly:
  uv run pytest -m integration
"""

from datetime import UTC, datetime

import pytest

from app.services.glm import search_glm_flashes

pytestmark = pytest.mark.integration

GOLDEN_LAT = 41.07801056
GOLDEN_LON = -121.25347137
GOLDEN_DT = datetime(2026, 9, 18, 0, 3, tzinfo=UTC)
GOLDEN_FLASH_ID = 28662
GOLDEN_SOURCE = (
    "OR_GLM-L2-LCFA_G18_s20262610003000_e20262610003200_c20262610003217.nc"
)


@pytest.mark.integration
def test_golden_glm_search_parity() -> None:
    result = search_glm_flashes(
        latitude=GOLDEN_LAT,
        longitude=GOLDEN_LON,
        search_datetime_utc=GOLDEN_DT,
        window_minutes=30,
        radius_km=25,
    )

    assert len(result.flashes) == 24

    match = next(
        (
            flash
            for flash in result.flashes
            if flash.flash_id == GOLDEN_FLASH_ID and flash.source_file == GOLDEN_SOURCE
        ),
        None,
    )
    assert match is not None, "Known reference flash 28662 was not returned"

    assert match.global_flash_id == f"{GOLDEN_SOURCE}::{GOLDEN_FLASH_ID}"
    assert match.flash_duration_ms == pytest.approx(513.084, rel=0, abs=1e-3)
    assert match.group_count == 81
    assert match.max_events_per_group == 11
    assert match.total_events == 184
    assert match.flash_energy == pytest.approx(2.0552769555703954e-12, rel=1e-6)
    assert match.flash_area == pytest.approx(1179764992, rel=0, abs=1)
    assert match.max_group_area == pytest.approx(811078912, rel=0, abs=1)
    assert match.max_group_energy == pytest.approx(4.868267247659652e-13, rel=1e-6)
