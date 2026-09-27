"""Parity tests for the frozen flashrisk-v1 XGBoost deployment model.

Uses the development-only fixture:
  reference/model/model_parity_10_flashes.csv

This path is never a runtime dependency of the inference service.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.services.inference import (
    FrozenXgbModel,
    build_feature_matrix,
    load_frozen_feature_names,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_PARITY_CSV = _REPO_ROOT / "reference" / "model" / "model_parity_10_flashes.csv"
_MODEL_JSON = _REPO_ROOT / "model" / "flashrisk-v1" / "xgboost_final_model.json"
_SPEC_JSON = _REPO_ROOT / "model" / "flashrisk-v1" / "xgboost_final_frozen_specification.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture(scope="module")
def feature_names() -> tuple[str, ...]:
    return load_frozen_feature_names()


@pytest.fixture(scope="module")
def parity_frame() -> pd.DataFrame:
    if not _PARITY_CSV.is_file():
        pytest.skip(f"Parity fixture not available: {_PARITY_CSV}")
    df = pd.read_csv(_PARITY_CSV)
    assert len(df) == 10, f"Expected 10 parity rows; found {len(df)}"
    return df


def test_manifest_matches_frozen_specification(feature_names: tuple[str, ...]) -> None:
    assert len(feature_names) == 21
    assert feature_names == (
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


def test_frozen_model_load_does_not_modify_artifacts(feature_names: tuple[str, ...]) -> None:
    before_model = _sha256(_MODEL_JSON)
    before_spec = _sha256(_SPEC_JSON)

    model = FrozenXgbModel(feature_names=feature_names)
    # One prediction to ensure the handle is used.
    zeros = {name: 0.0 for name in feature_names}
    score = model.score_flash(zeros)
    assert np.isfinite(score)

    after_model = _sha256(_MODEL_JSON)
    after_spec = _sha256(_SPEC_JSON)
    assert after_model == before_model
    assert after_spec == before_spec


def test_parity_10_flashes_exact(
    feature_names: tuple[str, ...],
    parity_frame: pd.DataFrame,
) -> None:
    model = FrozenXgbModel(feature_names=feature_names)

    rows: list[np.ndarray] = []
    for _, record in parity_frame.iterrows():
        values = {name: float(record[name]) for name in feature_names}
        matrix = build_feature_matrix(values, feature_names)
        assert matrix.dtype == np.float32
        assert matrix.shape == (1, 21)
        rows.append(matrix)

    x = np.vstack(rows).astype(np.float32, copy=False)
    assert x.shape == (10, 21)
    assert x.dtype == np.float32

    predicted = model.predict_positive_proba(x)
    # CSV round-trip extent: compare at float32 after reading expected column.
    expected = parity_frame["expected_model_output"].to_numpy(dtype=np.float32)

    if not np.array_equal(predicted.astype(np.float32, copy=False), expected):
        pred_f32 = predicted.astype(np.float32, copy=False)
        diffs = np.abs(pred_f32.astype(np.float64) - expected.astype(np.float64))
        details = "\n".join(
            f"  row {i}: predicted={pred_f32[i]!r} expected={expected[i]!r} "
            f"abs_diff={diffs[i]!r}"
            for i in range(len(diffs))
        )
        pytest.fail(
            "Frozen model parity failed exact float32 equality "
            f"(max abs diff={float(np.max(diffs))!r}).\n{details}"
        )
