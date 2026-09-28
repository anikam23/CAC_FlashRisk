"""Assemble the frozen 21-feature model input from validated component results.

No scientific formulas live here — values are passed through unchanged from the
already-validated GLM / ERA5 / SMAP / MODIS / seasonality services.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Mapping

import numpy as np

from app.services.environment.era5 import Era5Features, Era5Result
from app.services.environment.modis import ModisFeatures, ModisResult
from app.services.environment.seasonality import SeasonalityFeatures, SeasonalityResult
from app.services.environment.smap import SmapFeatures, SmapResult
from app.services.glm.selected_flash import GlmFlashReconstruction
from app.services.inference.xgboost_model import (
    ModelInputError,
    load_frozen_feature_names,
)

# GLM fields that enter the frozen 21-feature model (total_events is excluded).
_GLM_MODEL_FIELDS: tuple[str, ...] = (
    "flash_energy",
    "flash_area",
    "flash_duration_ms",
    "max_group_area",
    "max_group_energy",
    "group_count",
    "max_events_per_group",
)


class FeatureAssemblyError(ValueError):
    """Required model feature missing, non-finite, or otherwise invalid."""


def _era5_feature_map(era5: Era5Features | Era5Result) -> dict[str, float]:
    features = era5.features if isinstance(era5, Era5Result) else era5
    return asdict(features)


def _smap_feature_map(smap: SmapFeatures | SmapResult) -> dict[str, float]:
    features = smap.features if isinstance(smap, SmapResult) else smap
    return asdict(features)


def _modis_feature_map(modis: ModisFeatures | ModisResult) -> dict[str, float]:
    features = modis.features if isinstance(modis, ModisResult) else modis
    return asdict(features)


def _seasonality_feature_map(
    seasonality: SeasonalityFeatures | SeasonalityResult,
) -> dict[str, float]:
    features = seasonality.features if isinstance(seasonality, SeasonalityResult) else seasonality
    return asdict(features)


def _glm_feature_map(glm: GlmFlashReconstruction) -> dict[str, float]:
    return {name: float(getattr(glm, name)) for name in _GLM_MODEL_FIELDS}


def assemble_frozen_feature_values(
    *,
    glm: GlmFlashReconstruction,
    era5: Era5Features | Era5Result,
    smap: SmapFeatures | SmapResult,
    modis: ModisFeatures | ModisResult,
    seasonality: SeasonalityFeatures | SeasonalityResult,
    feature_names: tuple[str, ...] | None = None,
) -> dict[str, float]:
    """Merge component outputs into the frozen 21-feature name→value map.

    Values are copied verbatim from component results. No transformation,
    imputation, or fallback is applied. ``total_events`` is never included.
    """
    names = feature_names if feature_names is not None else load_frozen_feature_names()
    if len(names) != 21:
        raise FeatureAssemblyError(
            f"Frozen feature list must contain exactly 21 names; got {len(names)}."
        )

    combined: dict[str, float] = {}
    combined.update(_era5_feature_map(era5))
    combined.update(_smap_feature_map(smap))
    combined.update(_modis_feature_map(modis))
    combined.update(_seasonality_feature_map(seasonality))
    combined.update(_glm_feature_map(glm))

    if "total_events" in combined:
        # Defensive: never allow reconstruction metadata into the model vector.
        del combined["total_events"]

    missing = [name for name in names if name not in combined]
    if missing:
        raise FeatureAssemblyError(f"Missing required model features: {missing}")

    validated: dict[str, float] = {}
    for name in names:
        raw = combined[name]
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise FeatureAssemblyError(
                f"Non-numeric value for required feature '{name}': {raw!r}"
            ) from exc
        if not np.isfinite(value):
            raise FeatureAssemblyError(
                f"Non-finite value for required feature '{name}': {value!r}"
            )
        validated[name] = value

    return validated


def validate_feature_values_for_inference(
    feature_values: Mapping[str, float],
    feature_names: tuple[str, ...] | None = None,
) -> dict[str, float]:
    """Re-check a feature map against the frozen contract before scoring."""
    names = feature_names if feature_names is not None else load_frozen_feature_names()
    missing = [name for name in names if name not in feature_values]
    if missing:
        raise FeatureAssemblyError(f"Missing required model features: {missing}")
    if "total_events" in feature_values and "total_events" not in names:
        # Allowed as extra metadata elsewhere, but must not be required for inference.
        pass

    validated: dict[str, float] = {}
    for name in names:
        value = float(feature_values[name])
        if not np.isfinite(value):
            raise FeatureAssemblyError(
                f"Non-finite value for required feature '{name}': {value!r}"
            )
        validated[name] = value

    # Ensure inference builder would also accept this map.
    try:
        from app.services.inference.xgboost_model import build_feature_matrix

        matrix = build_feature_matrix(validated, names)
    except ModelInputError as exc:
        raise FeatureAssemblyError(str(exc)) from exc
    if matrix.shape != (1, 21) or matrix.dtype != np.float32:
        raise FeatureAssemblyError(
            f"Inference boundary requires float32 shape (1, 21); got {matrix.dtype} {matrix.shape}."
        )
    return validated
