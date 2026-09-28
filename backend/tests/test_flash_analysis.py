"""Unit tests for frozen 21-feature assembly and single-flash orchestration."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from app.services.environment.era5 import Era5Features, Era5Result
from app.services.environment.modis import ModisFeatures, ModisResult
from app.services.environment.seasonality import SeasonalityFeatures, SeasonalityResult
from app.services.environment.smap import SmapFeatures, SmapResult
from app.services.features import (
    FeatureAssemblyError,
    FlashAnalysisError,
    analyze_selected_flash,
    assemble_frozen_feature_values,
)
from app.services.glm.selected_flash import GlmFlashReconstruction
from app.services.inference.xgboost_model import build_feature_matrix, load_frozen_feature_names

FLASH_TIME = datetime(2026, 9, 14, 0, 36, 33, 731977, tzinfo=UTC)


def _glm(**overrides: object) -> GlmFlashReconstruction:
    base = dict(
        global_flash_id="file.nc::1",
        source_file="OR_GLM-L2-LCFA_G18_s20262570000000_e20262570000200_c20262570000217.nc",
        flash_id=1,
        flash_lat=36.68301010131836,
        flash_lon=-119.8039321899414,
        flash_first_event_frame_time=FLASH_TIME,
        flash_last_event_frame_time=FLASH_TIME,
        animation_start_time=FLASH_TIME,
        animation_end_ms=100.0,
        flash_energy=1.5e-13,
        flash_area=1.0e8,
        flash_duration_ms=50.0,
        max_group_area=9.0e7,
        max_group_energy=1.0e-13,
        group_count=3,
        max_events_per_group=4,
        total_events=12,  # reconstruction metadata — must NOT enter model inputs
        groups=[],
        events=[],
    )
    base.update(overrides)
    return GlmFlashReconstruction(**base)  # type: ignore[arg-type]


def _era5() -> Era5Result:
    return Era5Result(
        features=Era5Features(
            era5_temperature_2m_c=30.2089477539063,
            era5_relative_humidity_pct=16.8034562324128,
            era5_vpd_kpa=3.57261182637014,
            era5_precip_24h_mm=0.000435113804542198,
            era5_precip_72h_mm=0.00345431197956714,
            era5_precip_168h_mm=0.0064675211319809,
            era5_wind_speed_10m_ms=4.53343557078636,
            era5_precip_30d_mm=0.456632502164211,
        ),
        grid_latitude=36.7,
        grid_longitude=-119.8,
        atmospheric_timestamp_utc=datetime(2026, 9, 14, 0, 0, 0, tzinfo=UTC),
        flash_timestamp_utc=FLASH_TIME,
        flash_latitude=36.68301010131836,
        flash_longitude=-119.8039321899414,
        retrieval_seconds=1.0,
        request_labels=("era5-recent-full",),
    )


def _smap() -> SmapResult:
    return SmapResult(
        features=SmapFeatures(
            smap_surface_soil_moisture=0.0262094028294086,
            smap_rootzone_soil_moisture=0.0473873689770699,
        ),
        midpoint_utc=datetime(2026, 9, 13, 22, 30, 0, tzinfo=UTC),
        interval_start_utc=datetime(2026, 9, 13, 21, 0, 0, tzinfo=UTC),
        interval_end_utc=datetime(2026, 9, 14, 0, 0, 0, tzinfo=UTC),
        flash_timestamp_utc=FLASH_TIME,
        flash_latitude=36.68301010131836,
        flash_longitude=-119.8039321899414,
        retrieval_seconds=0.5,
        ee_project="lightning-ignition-research",
    )


def _modis() -> ModisResult:
    return ModisResult(
        features=ModisFeatures(
            modis_ndwi=-0.43486323597589244,
            modis_ndvi=0.2208115509086383,
        ),
        ndwi_observation_date=date(2026, 9, 13),
        ndvi_observation_date=date(2026, 9, 13),
        flash_timestamp_utc=FLASH_TIME,
        flash_latitude=36.68301010131836,
        flash_longitude=-119.8039321899414,
        retrieval_seconds=0.5,
        ee_project="lightning-ignition-research",
    )


def _season() -> SeasonalityResult:
    return SeasonalityResult(
        features=SeasonalityFeatures(
            season_sin=-0.9538123866109678,
            season_cos=-0.30040294796737566,
        ),
        day_of_year=257.0,
        seconds_into_day=2193.731977,
        fractional_day_of_year=256.02539041640046,
        days_in_year=365.0,
        annual_phase=4.407273894052724,
        flash_timestamp_utc=pd.Timestamp(FLASH_TIME),
    )


def test_frozen_feature_names_match_prompt_and_manifest() -> None:
    names = load_frozen_feature_names()
    assert len(names) == 21
    assert names == (
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


def test_assemble_exact_membership_and_pass_through() -> None:
    glm = _glm()
    era5 = _era5()
    smap = _smap()
    modis = _modis()
    season = _season()
    names = load_frozen_feature_names()

    values = assemble_frozen_feature_values(
        glm=glm,
        era5=era5,
        smap=smap,
        modis=modis,
        seasonality=season,
        feature_names=names,
    )

    assert set(values) == set(names)
    assert "total_events" not in values
    assert len(values) == 21

    # Pass-through: no transformation of component outputs.
    assert values["era5_temperature_2m_c"] == era5.features.era5_temperature_2m_c
    assert values["smap_surface_soil_moisture"] == smap.features.smap_surface_soil_moisture
    assert values["modis_ndwi"] == modis.features.modis_ndwi
    assert values["season_sin"] == season.features.season_sin
    assert values["flash_energy"] == glm.flash_energy
    assert values["group_count"] == float(glm.group_count)


def test_total_events_excluded_from_model_inputs() -> None:
    glm = _glm(total_events=999)
    values = assemble_frozen_feature_values(
        glm=glm,
        era5=_era5(),
        smap=_smap(),
        modis=_modis(),
        seasonality=_season(),
    )
    assert "total_events" not in values
    assert glm.total_events == 999


def test_inference_boundary_exact_order_and_float32() -> None:
    names = load_frozen_feature_names()
    values = assemble_frozen_feature_values(
        glm=_glm(),
        era5=_era5(),
        smap=_smap(),
        modis=_modis(),
        seasonality=_season(),
        feature_names=names,
    )
    matrix = build_feature_matrix(values, names)
    assert matrix.dtype == np.float32
    assert matrix.shape == (1, 21)
    for index, name in enumerate(names):
        # Inference casts to float32; compare at that boundary, not Python float64.
        expected = np.float32(values[name])
        assert matrix[0, index] == expected
        assert names[index] == name


def test_missing_required_feature_fails() -> None:
    values = assemble_frozen_feature_values(
        glm=_glm(),
        era5=_era5(),
        smap=_smap(),
        modis=_modis(),
        seasonality=_season(),
    )
    del values["modis_ndvi"]
    from app.services.features.assembly import validate_feature_values_for_inference

    with pytest.raises(FeatureAssemblyError, match="Missing required model features"):
        validate_feature_values_for_inference(values)


def test_non_finite_required_feature_fails() -> None:
    era5 = _era5()
    bad_features = replace(era5.features, era5_vpd_kpa=float("nan"))
    bad_era5 = replace(era5, features=bad_features)
    with pytest.raises(FeatureAssemblyError, match="Non-finite"):
        assemble_frozen_feature_values(
            glm=_glm(),
            era5=bad_era5,
            smap=_smap(),
            modis=_modis(),
            seasonality=_season(),
        )


def test_analyze_selected_flash_orchestration_with_injected_components() -> None:
    glm = _glm()
    era5 = _era5()
    smap = _smap()
    modis = _modis()
    season = _season()
    names = load_frozen_feature_names()
    expected_values = assemble_frozen_feature_values(
        glm=glm,
        era5=era5,
        smap=smap,
        modis=modis,
        seasonality=season,
        feature_names=names,
    )

    captured: dict[str, object] = {}

    class FakeModel:
        def score_flash(self, feature_values: dict[str, float]) -> float:
            captured["feature_values"] = dict(feature_values)
            matrix = build_feature_matrix(feature_values, names)
            captured["matrix"] = matrix
            return 0.14430022

    result = analyze_selected_flash(
        source_file=glm.source_file,
        flash_id=glm.flash_id,
        extract_glm=lambda **_: glm,
        fetch_era5=lambda **_: era5,
        fetch_smap=lambda **_: smap,
        fetch_modis=lambda **_: modis,
        compute_season=lambda *_args, **_kwargs: season,
        model=FakeModel(),  # type: ignore[arg-type]
    )

    assert result.model_score == pytest.approx(0.14430022)
    assert result.feature_names == names
    assert result.feature_values == expected_values
    assert "total_events" not in result.feature_values
    assert result.glm is glm
    assert result.era5 is era5
    assert result.smap is smap
    assert result.modis is modis
    assert result.seasonality is season

    assert captured["feature_values"] == expected_values
    matrix = captured["matrix"]
    assert isinstance(matrix, np.ndarray)
    assert matrix.shape == (1, 21)
    assert matrix.dtype == np.float32
    for index, name in enumerate(names):
        assert matrix[0, index] == np.float32(expected_values[name])


def test_analyze_propagates_component_failure() -> None:
    def boom(**_: object) -> Era5Result:
        raise RuntimeError("CDS unavailable")

    with pytest.raises(FlashAnalysisError, match="Environmental"):
        analyze_selected_flash(
            source_file="file.nc",
            flash_id=1,
            extract_glm=lambda **_: _glm(),
            fetch_era5=boom,
            fetch_smap=lambda **_: _smap(),
            fetch_modis=lambda **_: _modis(),
            compute_season=lambda *_a, **_k: _season(),
            model=SimpleNamespace(score_flash=lambda _features: 0.0),  # type: ignore[arg-type]
        )
