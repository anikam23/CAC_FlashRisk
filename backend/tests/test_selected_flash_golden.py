"""Live NOAA S3 golden parity for selected-flash reconstruction.

Run explicitly:
  uv run pytest -m integration
"""

import pytest

from app.services.glm import extract_selected_flash

pytestmark = pytest.mark.integration

GOLDEN_SOURCE = (
    "OR_GLM-L2-LCFA_G18_s20262610003000_e20262610003200_c20262610003217.nc"
)
GOLDEN_FLASH_ID = 28662


@pytest.mark.integration
def test_golden_selected_flash_reconstruction() -> None:
    result = extract_selected_flash(
        source_file=GOLDEN_SOURCE,
        flash_id=GOLDEN_FLASH_ID,
    )

    assert result.flash_id == GOLDEN_FLASH_ID
    assert result.source_file == GOLDEN_SOURCE
    assert result.global_flash_id == f"{GOLDEN_SOURCE}::{GOLDEN_FLASH_ID}"

    assert result.group_count == 81
    assert result.total_events == 184
    assert result.max_events_per_group == 11
    assert result.flash_duration_ms == pytest.approx(513.084, abs=0.002)
    assert result.flash_energy == pytest.approx(2.0552769555703954e-12, rel=1e-6)
    assert result.flash_area == pytest.approx(1179764992.0, abs=1)
    assert result.max_group_area == pytest.approx(811078912.0, abs=1)
    assert result.max_group_energy == pytest.approx(
        4.868267247659652e-13, rel=1e-6
    )

    assert len(result.groups) == 81
    assert len(result.events) == 184

    event_offsets = [event.animation_offset_ms for event in result.events]
    group_offsets = [group.animation_offset_ms for group in result.groups]
    assert min(event_offsets) == pytest.approx(0.0, abs=0.001)
    assert min(event_offsets) >= -0.001
    assert min(group_offsets) >= -0.001
    assert result.animation_end_ms == pytest.approx(max(event_offsets), abs=1e-6)
    assert result.animation_end_ms == pytest.approx(
        result.flash_duration_ms, abs=0.01
    )

    group_ids = {group.group_id for group in result.groups}
    assert {event.parent_group_id for event in result.events}.issubset(group_ids)
    assert sum(group.event_count for group in result.groups) == len(result.events)
