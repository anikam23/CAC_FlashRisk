"""Scene-selection tests for Sentinel-2 surveillance (no Earth Engine)."""

from datetime import UTC, datetime

import pytest

from app.schemas.sentinel import SentinelPreviewResponse
from app.services.imagery.sentinel_selection import (
    CLEAR_THRESHOLD,
    LOOKBACK_DAYS,
    SEARCH_BUFFER_M,
    SURVEILLANCE_FRAME_RADIUS_M,
    SURVEILLANCE_RADIUS_KM,
    SURVEILLANCE_RADIUS_M,
    THUMB_MAX_DIMENSION,
    TRUE_COLOR_BANDS,
    UNAVAILABLE_MESSAGE,
    VIS_GAMMA,
    VIS_MAX,
    VIS_MIN,
    SceneCandidate,
    png_dimensions,
    pre_flash_search_window,
    scene_meets_clarity,
    select_qualifying_scene,
)

FLASH = datetime(2026, 9, 17, 0, 30, tzinfo=UTC)


def _scene(day: int, hour: int, clarity: float | None, cloud: float | None = 10.0) -> SceneCandidate:
    return SceneCandidate(
        acquired_utc=datetime(2026, 9, day, hour, tzinfo=UTC),
        point_clarity=clarity,
        scene_cloud_pct=cloud,
    )


def test_search_window_excludes_flash_day_and_covers_30_days() -> None:
    start, end = pre_flash_search_window(FLASH)
    assert LOOKBACK_DAYS == 30
    assert start.isoformat() == "2026-08-18"
    assert end.isoformat() == "2026-09-17"
    assert (end - start).days == 30
    assert end == FLASH.date()


def test_newest_pre_flash_scene_at_threshold_is_selected() -> None:
    older = _scene(14, 18, 0.91)
    newer_dim = _scene(16, 19, 0.59)
    qualifying = _scene(16, 18, 0.60)
    same_day = _scene(17, 0, 0.99)
    selected = select_qualifying_scene(
        [older, same_day, newer_dim, qualifying],
        FLASH,
    )
    assert selected is qualifying
    assert selected is not None
    assert selected.point_clarity == 0.60
    assert newer_dim.point_clarity == 0.59


def test_clearer_same_day_scene_does_not_replace_an_older_pre_flash_scene() -> None:
    pre_flash = _scene(10, 12, 0.61)
    same_day = _scene(17, 0, 0.99)
    post_flash = SceneCandidate(
        acquired_utc=datetime(2026, 9, 18, 12, tzinfo=UTC),
        point_clarity=1.0,
    )
    selected = select_qualifying_scene([post_flash, same_day, pre_flash], FLASH)
    assert selected is pre_flash


def test_missing_or_low_clarity_never_qualifies() -> None:
    assert scene_meets_clarity(None) is False
    assert scene_meets_clarity(0.599) is False
    assert scene_meets_clarity(CLEAR_THRESHOLD) is True
    assert scene_meets_clarity(float("nan")) is False
    scenes = [
        _scene(16, 18, None),
        _scene(15, 18, 0.2),
        _scene(12, 18, 0.599),
    ]
    assert select_qualifying_scene(scenes, FLASH) is None


def test_no_qualifying_image_state_and_reference_visual_contract() -> None:
    assert select_qualifying_scene([], FLASH) is None
    assert "30-day" in UNAVAILABLE_MESSAGE
    assert "pre-flash" in UNAVAILABLE_MESSAGE
    assert TRUE_COLOR_BANDS == ("B4", "B3", "B2")
    assert VIS_MIN == 0
    assert VIS_MAX == 3000
    assert VIS_GAMMA == 1.15
    assert CLEAR_THRESHOLD == 0.60
    assert SEARCH_BUFFER_M == 1000
    assert SURVEILLANCE_RADIUS_M == 10_000
    assert SURVEILLANCE_RADIUS_KM == 10
    assert SURVEILLANCE_FRAME_RADIUS_M == 12_500
    assert SURVEILLANCE_FRAME_RADIUS_M > SURVEILLANCE_RADIUS_M
    assert THUMB_MAX_DIMENSION == 1400
    assert "model_score" not in SentinelPreviewResponse.model_fields
    assert "feature_values" not in SentinelPreviewResponse.model_fields


def test_png_dimensions_read_header() -> None:
    data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (1400).to_bytes(4, "big") + (900).to_bytes(4, "big")
    assert png_dimensions(data) == (1400, 900)
    with pytest.raises(ValueError):
        png_dimensions(b"not-a-png")
