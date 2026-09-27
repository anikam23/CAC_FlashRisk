# flashrisk-v1 model bundle

Frozen, pre-trained 21-feature XGBoost model used by the backend for inference. This project never trains, tunes, or modifies the model.

## Contents

| File | Status |
| --- | --- |
| `feature_manifest.json` | Present. Exact feature order the model expects. `index` is the 0-based input column. |
| `xgboost_final_frozen_specification.json` | Present. Frozen deployment definition (ordered features + training invariants). |
| `xgboost_final_model.json` | Present. Native XGBoost JSON artifact loaded unchanged for inference. |

## Input contract

- Features are passed as raw values in manifest / frozen-specification order.
- Input matrix dtype is `float32` with shape `(n, 21)`.
- No standardization, transformation, or imputation is applied.

## Output

The backend returns `predict_proba(X)[:, 1]` (raw positive-class score). It is not a calibrated wildfire probability.
