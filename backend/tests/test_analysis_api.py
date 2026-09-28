"""API tests for Analyze (mocked pipeline — no live external retrievals)."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.services.features.pipeline import FlashAnalysisError
from app.services.glm.selected_flash import GlmFlashNotFoundError

client = TestClient(app)

_FEATURE_NAMES = (
    "era5_temperature_2m_c",
    "era5_relative_humidity_pct",
    "era5_vpd_kpa",
    "era5_precip_24h_mm",
    "era5_precip_72h_mm",
    "era5_precip_168h_mm",
    "smap_surface_soil_moisture",
    "smap_rootzone_soil_moisture",
    "modis_ndwi",
    "era5_wind_speed_10m_ms",
    "era5_precip_30d_mm",
    "modis_ndvi",
    "season_sin",
    "season_cos",
    "flash_energy",
    "flash_area",
    "flash_duration_ms",
    "max_group_area",
    "max_group_energy",
    "group_count",
    "max_events_per_group",
)


def _fake_result() -> SimpleNamespace:
    values = {name: float(index) for index, name in enumerate(_FEATURE_NAMES)}
    glm = SimpleNamespace(
        global_flash_id=(
            "OR_GLM-L2-LCFA_G18_s20252130016200_e20252130016400_c20252130016415.nc::56929"
        ),
        source_file=(
            "OR_GLM-L2-LCFA_G18_s20252130016200_e20252130016400_c20252130016415.nc"
        ),
        flash_id=56929,
        flash_lat=41.63758,
        flash_lon=-122.176956,
    )
    return SimpleNamespace(
        glm=glm,
        flash_timestamp_utc=datetime(2025, 8, 1, 0, 16, 35, tzinfo=UTC),
        model_score=0.14430022,
        feature_names=_FEATURE_NAMES,
        feature_values=values,
        analysis_seconds=1.25,
    )


def test_analyze_rejects_invalid_source_file() -> None:
    res = client.post(
        "/api/analyze",
        json={"source_file": "bad.nc", "flash_id": 1},
    )
    # source_file min_length=20 → pydantic 422 before pipeline runs.
    assert res.status_code == 422


def test_analyze_success_returns_score_and_21_features(monkeypatch) -> None:
    from app.api.routes import analysis as analysis_route

    monkeypatch.setattr(
        analysis_route,
        "analyze_selected_flash",
        lambda **_kwargs: _fake_result(),
    )
    source = (
        "OR_GLM-L2-LCFA_G18_s20252130016200_e20252130016400_c20252130016415.nc"
    )
    res = client.post(
        "/api/analyze",
        json={"source_file": source, "flash_id": 56929},
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["flash_id"] == 56929
    assert payload["model_score"] == 0.14430022
    assert payload["feature_names"] == list(_FEATURE_NAMES)
    assert len(payload["feature_values"]) == 21
    assert "total_events" not in payload["feature_values"]
    assert payload["global_flash_id"].endswith("::56929")


def test_analyze_maps_not_found(monkeypatch) -> None:
    from app.api.routes import analysis as analysis_route

    def boom(**_kwargs: object) -> object:
        raise GlmFlashNotFoundError("flash missing")

    monkeypatch.setattr(analysis_route, "analyze_selected_flash", boom)
    source = (
        "OR_GLM-L2-LCFA_G18_s20252130016200_e20252130016400_c20252130016415.nc"
    )
    res = client.post(
        "/api/analyze",
        json={"source_file": source, "flash_id": 999},
    )
    assert res.status_code == 404
    assert "flash missing" in res.json()["detail"]


def test_analyze_maps_pipeline_failure(monkeypatch) -> None:
    from app.api.routes import analysis as analysis_route

    def boom(**_kwargs: object) -> object:
        raise FlashAnalysisError("CDS unavailable")

    monkeypatch.setattr(analysis_route, "analyze_selected_flash", boom)
    source = (
        "OR_GLM-L2-LCFA_G18_s20252130016200_e20252130016400_c20252130016415.nc"
    )
    res = client.post(
        "/api/analyze",
        json={"source_file": source, "flash_id": 56929},
    )
    assert res.status_code == 502
    assert "CDS unavailable" in res.json()["detail"]
