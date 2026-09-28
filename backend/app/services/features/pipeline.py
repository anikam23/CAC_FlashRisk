"""Single-flash analysis orchestration: GLM + environment → frozen XGBoost score.

Scientific retrieval/calculation remains inside the existing validated services.
This module only sequences those calls, assembles the frozen 21-feature map, and
invokes inference.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from time import perf_counter
from typing import Any

from app.services.environment.era5 import Era5Result, fetch_era5_features
from app.services.environment.modis import ModisResult, fetch_modis_features
from app.services.environment.seasonality import SeasonalityResult, compute_seasonality
from app.services.environment.smap import SmapResult, fetch_smap_features
from app.services.features.assembly import (
    FeatureAssemblyError,
    assemble_frozen_feature_values,
    validate_feature_values_for_inference,
)
from app.services.glm.selected_flash import (
    GlmFlashReconstruction,
    extract_selected_flash,
)
from app.services.inference.xgboost_model import (
    FrozenXgbModel,
    get_frozen_model,
    load_frozen_feature_names,
)


class FlashAnalysisError(Exception):
    """Base orchestration error for single-flash analysis."""


class FlashAnalysisConfigError(FlashAnalysisError):
    """Invalid flash identity or orchestration configuration."""


@dataclass(frozen=True, slots=True)
class FlashAnalysisResult:
    """Raw frozen-model score plus component provenance for one flash."""

    model_score: float
    feature_values: dict[str, float]
    feature_names: tuple[str, ...]
    glm: GlmFlashReconstruction
    era5: Era5Result
    smap: SmapResult
    modis: ModisResult
    seasonality: SeasonalityResult
    flash_timestamp_utc: datetime
    analysis_seconds: float


def analyze_selected_flash(
    *,
    source_file: str,
    flash_id: int,
    extract_glm: Callable[..., GlmFlashReconstruction] = extract_selected_flash,
    fetch_era5: Callable[..., Era5Result] = fetch_era5_features,
    fetch_smap: Callable[..., SmapResult] = fetch_smap_features,
    fetch_modis: Callable[..., ModisResult] = fetch_modis_features,
    compute_season: Callable[..., SeasonalityResult] = compute_seasonality,
    model: FrozenXgbModel | None = None,
    glm_kwargs: dict[str, Any] | None = None,
) -> FlashAnalysisResult:
    """Run the full single-flash pipeline for an already-identified GLM flash.

    Optional callables allow tests to inject validated component results without
    hitting external data services. Production callers use the defaults.
    """
    if not source_file or not str(source_file).strip():
        raise FlashAnalysisConfigError("source_file is required.")
    if not isinstance(flash_id, int):
        raise FlashAnalysisConfigError("flash_id must be an integer.")

    t0 = perf_counter()
    feature_names = load_frozen_feature_names()

    try:
        glm = extract_glm(source_file=source_file, flash_id=flash_id, **(glm_kwargs or {}))
    except FlashAnalysisError:
        raise
    except Exception as exc:  # noqa: BLE001 — wrap component failure without altering it
        raise FlashAnalysisError(f"Selected-flash GLM extraction failed: {exc}") from exc

    flash_time = glm.flash_first_event_frame_time
    latitude = float(glm.flash_lat)
    longitude = float(glm.flash_lon)

    try:
        era5 = fetch_era5(
            flash_time_utc=flash_time,
            latitude=latitude,
            longitude=longitude,
        )
        smap = fetch_smap(
            flash_time_utc=flash_time,
            latitude=latitude,
            longitude=longitude,
        )
        modis = fetch_modis(
            flash_time_utc=flash_time,
            latitude=latitude,
            longitude=longitude,
        )
        seasonality = compute_season(flash_time)
    except FlashAnalysisError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise FlashAnalysisError(f"Environmental / seasonality retrieval failed: {exc}") from exc

    try:
        feature_values = assemble_frozen_feature_values(
            glm=glm,
            era5=era5,
            smap=smap,
            modis=modis,
            seasonality=seasonality,
            feature_names=feature_names,
        )
        feature_values = validate_feature_values_for_inference(
            feature_values,
            feature_names=feature_names,
        )
    except FeatureAssemblyError as exc:
        raise FlashAnalysisError(str(exc)) from exc

    scoring_model = model if model is not None else get_frozen_model()
    try:
        score = scoring_model.score_flash(feature_values)
    except Exception as exc:  # noqa: BLE001
        raise FlashAnalysisError(f"Frozen model inference failed: {exc}") from exc

    return FlashAnalysisResult(
        model_score=float(score),
        feature_values=feature_values,
        feature_names=feature_names,
        glm=glm,
        era5=era5,
        smap=smap,
        modis=modis,
        seasonality=seasonality,
        flash_timestamp_utc=flash_time,
        analysis_seconds=perf_counter() - t0,
    )
