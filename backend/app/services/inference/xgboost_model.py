"""Frozen flashrisk-v1 XGBoost inference (no training or preprocessing)."""

from __future__ import annotations

import json
import threading
from functools import lru_cache
from pathlib import Path
from typing import Mapping, Sequence

import numpy as np
from xgboost import XGBClassifier

# backend/app/services/inference/xgboost_model.py → repo root is parents[4]
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DEFAULT_BUNDLE = _REPO_ROOT / "model" / "flashrisk-v1"
_DEFAULT_MODEL = _DEFAULT_BUNDLE / "xgboost_final_model.json"
_DEFAULT_SPEC = _DEFAULT_BUNDLE / "xgboost_final_frozen_specification.json"
_DEFAULT_MANIFEST = _DEFAULT_BUNDLE / "feature_manifest.json"


class ModelInferenceError(Exception):
    """Base frozen-model inference error."""


class ModelArtifactError(ModelInferenceError):
    """Missing or inconsistent frozen model artifacts."""


class ModelInputError(ModelInferenceError):
    """Invalid feature vector for frozen inference."""


def load_frozen_feature_names(
    *,
    spec_path: Path | None = None,
    manifest_path: Path | None = None,
) -> tuple[str, ...]:
    """Return the ordered 21-feature names from the frozen deployment definition.

    Cross-checks ``xgboost_final_frozen_specification.json`` against
    ``feature_manifest.json`` and fails if they disagree.
    """
    spec_path = spec_path or _DEFAULT_SPEC
    manifest_path = manifest_path or _DEFAULT_MANIFEST
    if not spec_path.is_file():
        raise ModelArtifactError(f"Frozen specification not found: {spec_path}")
    if not manifest_path.is_file():
        raise ModelArtifactError(f"Feature manifest not found: {manifest_path}")

    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    spec_features = list(spec.get("features") or [])
    if int(spec.get("feature_count", -1)) != 21 or len(spec_features) != 21:
        raise ModelArtifactError(
            f"Frozen specification must list exactly 21 features; "
            f"found feature_count={spec.get('feature_count')!r}, len={len(spec_features)}."
        )

    manifest_features = [item["name"] for item in manifest.get("features") or []]
    if int(manifest.get("feature_count", -1)) != 21 or len(manifest_features) != 21:
        raise ModelArtifactError(
            f"Feature manifest must list exactly 21 features; "
            f"found feature_count={manifest.get('feature_count')!r}, len={len(manifest_features)}."
        )

    if spec_features != manifest_features:
        raise ModelArtifactError(
            "Frozen specification feature order does not match feature_manifest.json."
        )

    for index, item in enumerate(manifest.get("features") or []):
        if int(item.get("index", -1)) != index:
            raise ModelArtifactError(
                f"Feature manifest index mismatch at position {index}: {item!r}"
            )

    return tuple(spec_features)


def build_feature_matrix(
    feature_values: Mapping[str, float],
    feature_names: Sequence[str] | None = None,
) -> np.ndarray:
    """Build a (1, 21) float32 matrix in frozen feature order. No preprocessing."""
    names = tuple(feature_names) if feature_names is not None else load_frozen_feature_names()
    if len(names) != 21:
        raise ModelInputError(f"Frozen feature list must have length 21; got {len(names)}.")

    missing = [name for name in names if name not in feature_values]
    if missing:
        raise ModelInputError(f"Missing required model features: {missing}")

    row: list[float] = []
    for name in names:
        raw = feature_values[name]
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise ModelInputError(f"Non-numeric value for feature '{name}': {raw!r}") from exc
        if not np.isfinite(value):
            raise ModelInputError(f"Non-finite value for feature '{name}': {value!r}")
        row.append(value)

    matrix = np.asarray([row], dtype=np.float32)
    if matrix.shape != (1, 21):
        raise ModelInputError(f"Expected feature matrix shape (1, 21); got {matrix.shape}.")
    return matrix


class FrozenXgbModel:
    """Loaded flashrisk-v1 classifier; reuse one instance for predictions."""

    def __init__(
        self,
        *,
        model_path: Path | None = None,
        feature_names: Sequence[str] | None = None,
    ) -> None:
        self.model_path = Path(model_path or _DEFAULT_MODEL)
        if not self.model_path.is_file():
            raise ModelArtifactError(f"Frozen model not found: {self.model_path}")
        self.feature_names: tuple[str, ...] = (
            tuple(feature_names) if feature_names is not None else load_frozen_feature_names()
        )
        if len(self.feature_names) != 21:
            raise ModelArtifactError("Frozen model requires exactly 21 features.")

        self._model = XGBClassifier()
        self._model.load_model(str(self.model_path))

    def predict_positive_proba(self, feature_matrix: np.ndarray) -> np.ndarray:
        """Return P(class=1) for each row via ``predict_proba(X)[:, 1]``."""
        x = np.asarray(feature_matrix, dtype=np.float32)
        if x.ndim != 2 or x.shape[1] != 21:
            raise ModelInputError(
                f"Expected feature matrix shape (n, 21); got {x.shape}."
            )
        if not np.isfinite(x).all():
            raise ModelInputError("Feature matrix contains non-finite values.")
        probabilities = self._model.predict_proba(x)
        return np.asarray(probabilities[:, 1])

    def score_flash(self, feature_values: Mapping[str, float]) -> float:
        """Score one flash; returns the positive-class probability as float."""
        matrix = build_feature_matrix(feature_values, self.feature_names)
        return float(self.predict_positive_proba(matrix)[0])


_lock = threading.Lock()
_cached_model: FrozenXgbModel | None = None


def get_frozen_model() -> FrozenXgbModel:
    """Process-wide cached frozen model (loaded once)."""
    global _cached_model
    if _cached_model is not None:
        return _cached_model
    with _lock:
        if _cached_model is None:
            _cached_model = FrozenXgbModel()
        return _cached_model


@lru_cache(maxsize=1)
def frozen_feature_names() -> tuple[str, ...]:
    return load_frozen_feature_names()
