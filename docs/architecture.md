# Architecture

FlashRisk runs locally as two processes: a Next.js frontend and a Python FastAPI backend. There is no cloud hosting configuration.

```
Browser ──► frontend (Next.js, :3417) ──HTTP/JSON──► backend (FastAPI, :8765) ──► model/flashrisk-v1
```

## Frontend (`frontend/`)

Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, and MapLibre GL JS. The UI is map-first: a full-screen California map with translucent panels layered on top.

- `src/app` — routes and global styles
- `src/components/map` — MapLibre map
- `src/components/flash` — flash list and flash detail (planned)
- `src/components/analysis` — selected-flash panel (GLM inspection, reconstruction controls, temporary Analyze results)
- `src/components/ui` — shadcn/ui primitives
- `src/lib` — configuration and backend API client

The backend URL is set by `NEXT_PUBLIC_API_BASE_URL`.

## Backend (`backend/`)

FastAPI managed with uv.

- `app/main.py` — app factory, CORS, router registration
- `app/api/routes` — HTTP routes (`health`, `glm`, `analyze`)
- `app/schemas` — Pydantic models
- `app/core` — settings (`FLASHRISK_*` environment variables)
- `app/services/glm` — GOES-18 GLM flash retrieval and selected-flash reconstruction
- `app/services/environment` — ERA5-Land (`era5.py`), NASA SMAP (`smap.py`), MODIS MOD09GA NDWI/NDVI (`modis.py`), seasonality (`seasonality.py`)
- `app/services/features` — assembles the frozen 21-feature map and orchestrates single-flash analysis
- `app/services/inference` — frozen flashrisk-v1 XGBoost loading and `predict_proba` scoring
- `app/services/imagery` — display-only satellite imagery (planned)

ERA5-Land, SMAP, MODIS, and Notebook-12 seasonality (`season_sin` / `season_cos`) are implemented as reusable backend services. The features pipeline composes those services with selected-flash GLM extraction and frozen XGBoost inference. Environmental retrievals have offline unit tests and optional live golden parity tests. SMAP/MODIS share Earth Engine initialization (`EE_PROJECT`); authenticate EE once locally—application code only calls `ee.Initialize(project=...)`.

## Analysis flow

`POST /api/analyze` accepts a selected flash identity (`source_file`, `flash_id`), runs the validated synchronous pipeline (`analyze_selected_flash`), and returns the flash identity, raw model score, and all 21 frozen feature names/values. The frontend Analyze button shows loading / results / error states in the right-side panel. Result presentation is temporary (no Low/Moderate/High labels or surveillance visualization yet). Satellite imagery remains planned for context only and is not a model input.

## Model bundle (`model/flashrisk-v1/`)

`feature_manifest.json` defines the frozen feature order. The native XGBoost `model.json` is added later.
