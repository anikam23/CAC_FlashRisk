# flashrisk-v1 model bundle

Frozen, pre-trained 21-feature XGBoost model used by the backend for inference. This project never trains, tunes, or modifies the model.

## Contents

| File | Status |
| --- | --- |
| `feature_manifest.json` | Present. Exact feature order the model expects. `index` is the 0-based input column. |
| `model.json` | **Not yet included.** The native XGBoost JSON artifact is supplied later and copied here unchanged. |

Additional bundle files (output spec, model card, checksums) will be added together with the model artifact.

## Input contract

- Features are passed as raw values in manifest order.
- No standardization, transformation, or imputation is applied.

## Output

The backend returns the raw XGBoost score. It is not a calibrated wildfire probability.
