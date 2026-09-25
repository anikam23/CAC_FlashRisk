"""API validation tests for GLM search (no live NOAA calls)."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.services.glm.search import archive_date_bounds

client = TestClient(app)


def _valid_payload() -> dict:
    _, latest = archive_date_bounds()
    # Use noon on the latest selectable day so the request stays in range.
    dt = datetime(
        latest.year, latest.month, latest.day, 12, 0, tzinfo=UTC
    )
    return {
        "latitude": 41.07801056,
        "longitude": -121.25347137,
        "datetime_utc": dt.isoformat().replace("+00:00", "Z"),
        "window_minutes": 30,
        "radius_km": 25,
    }


def test_glm_search_rejects_invalid_window() -> None:
    payload = _valid_payload()
    payload["window_minutes"] = 45
    res = client.post("/api/glm/search", json=payload)
    assert res.status_code == 422


def test_glm_search_rejects_invalid_radius() -> None:
    payload = _valid_payload()
    payload["radius_km"] = 40
    res = client.post("/api/glm/search", json=payload)
    assert res.status_code == 422


def test_glm_search_rejects_naive_datetime() -> None:
    payload = _valid_payload()
    payload["datetime_utc"] = "2026-09-18T00:03:00"
    res = client.post("/api/glm/search", json=payload)
    assert res.status_code == 422


def test_glm_flash_rejects_invalid_source_file() -> None:
    res = client.post(
        "/api/glm/flash",
        json={"source_file": "bad.nc", "flash_id": 28662},
    )
    assert res.status_code == 422


def test_glm_search_rejects_date_outside_archive_window() -> None:
    from datetime import timedelta

    payload = _valid_payload()
    earliest, _ = archive_date_bounds()
    too_old = earliest - timedelta(days=1)
    payload["datetime_utc"] = too_old.isoformat().replace("+00:00", "Z")
    res = client.post("/api/glm/search", json=payload)
    assert res.status_code == 422
    assert "archive availability" in res.json()["detail"].lower()
