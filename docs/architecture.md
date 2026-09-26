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
- `src/components/analysis` — analysis progress and results (planned)
- `src/components/ui` — shadcn/ui primitives
- `src/lib` — configuration and backend API client

The backend URL is set by `NEXT_PUBLIC_API_BASE_URL`.

## Backend (`backend/`)

FastAPI managed with uv.

- `app/main.py` — app factory, CORS, router registration
- `app/api/routes` — HTTP routes (currently only `GET /api/health`)
- `app/schemas` — Pydantic models
- `app/core` — settings (`FLASHRISK_*` environment variables)
- `app/services/glm` — GOES-18 GLM flash retrieval and selected-flash reconstruction
- `app/services/environment` — ERA5-Land (`era5.py`), NASA SMAP (`smap.py`), MODIS MOD09GA NDWI/NDVI (`modis.py`)
- `app/services/features` — builds the 21-feature vector (planned)
- `app/services/inference` — loads the frozen XGBoost model and scores (planned)
- `app/services/imagery` — display-only satellite imagery (planned)

ERA5-Land, SMAP, and MODIS retrieval are implemented as reusable backend services with offline unit tests and optional live golden parity tests. They are not yet exposed through the Analyze UI. SMAP/MODIS share Earth Engine initialization (`EE_PROJECT`); authenticate EE once locally—application code only calls `ee.Initialize(project=...)`.

## Analysis flow (planned)

Analysis runs as an async background job: the client submits a flash, receives a job ID, polls for status and progress that reflect actual backend work, then fetches the completed result. The result is the raw XGBoost score plus model information and environmental context. Satellite imagery is shown for context only and is not a model input.

## Model bundle (`model/flashrisk-v1/`)

`feature_manifest.json` defines the frozen feature order. The native XGBoost `model.json` is added later.
