"""API tests for Sentinel preview (mocked retrieval — no live Earth Engine)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.services.imagery.sentinel import (
    SentinelBounds,
    SentinelRetrievalError,
    SentinelSurveillance,
)

client = TestClient(app)

FLASH = "2026-09-17T00:30:00Z"


def _body() -> dict[str, object]:
    return {
        "flash_lat": 38.5,
        "flash_lon": -121.5,
        "flash_timestamp_utc": FLASH,
    }


def test_preview_unavailable_does_not_invent_an_image(monkeypatch) -> None:
    from app.api.routes import sentinel as sentinel_route

    monkeypatch.setattr(
        sentinel_route,
        "retrieve_sentinel_surveillance",
        lambda **_kwargs: SentinelSurveillance(
            status="unavailable",
            flash_lat=38.5,
            flash_lon=-121.5,
            flash_timestamp_utc=datetime(2026, 9, 17, 0, 30, tzinfo=UTC),
            surveillance_radius_km=10,
            lookback_days=30,
            clear_threshold=0.60,
            message=(
                "No qualifying clear pre-flash Sentinel-2 observation was found "
                "within the 30-day window."
            ),
        ),
    )
    res = client.post("/api/sentinel/preview", json=_body())
    assert res.status_code == 200
    payload = res.json()
    assert payload["status"] == "unavailable"
    assert payload["image_png_base64"] is None
    assert payload["surveillance_radius_km"] == 10
    assert payload["lookback_days"] == 30
    assert "model_score" not in payload
    assert "feature_values" not in payload


def test_preview_returns_stored_image_metadata(monkeypatch) -> None:
    from app.api.routes import sentinel as sentinel_route

    monkeypatch.setattr(
        sentinel_route,
        "retrieve_sentinel_surveillance",
        lambda **_kwargs: SentinelSurveillance(
            status="available",
            flash_lat=38.5,
            flash_lon=-121.5,
            flash_timestamp_utc=datetime(2026, 9, 17, 0, 30, tzinfo=UTC),
            surveillance_radius_km=10,
            lookback_days=30,
            clear_threshold=0.60,
            image_png_base64="abc",
            image_width=1400,
            image_height=1200,
            bounds=SentinelBounds(west=-121.62, south=38.41, east=-121.38, north=38.59),
            acquired_utc=datetime(2026, 9, 12, 18, 4, tzinfo=UTC),
            hours_before_flash=102.4,
            point_clarity=0.812,
            scene_cloud_pct=14.2,
        ),
    )
    res = client.post("/api/sentinel/preview", json=_body())
    assert res.status_code == 200
    payload = res.json()
    assert payload["status"] == "available"
    assert payload["image_png_base64"] == "abc"
    assert payload["point_clarity"] == 0.812
    assert payload["bounds"]["west"] == -121.62
    assert payload["acquired_utc"].startswith("2026-09-12")


def test_preview_retrieval_failure_is_separate_from_analysis(monkeypatch) -> None:
    from app.api.routes import sentinel as sentinel_route

    def _fail(**_kwargs: object) -> SentinelSurveillance:
        raise SentinelRetrievalError(
            "Sentinel-2 imagery could not be retrieved. Flash analysis is unchanged."
        )

    monkeypatch.setattr(sentinel_route, "retrieve_sentinel_surveillance", _fail)
    res = client.post("/api/sentinel/preview", json=_body())
    assert res.status_code == 502
    assert "unchanged" in res.json()["detail"]
