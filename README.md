# CAC FlashRisk

A Congressional App Challenge web application for prioritizing GOES-18 Geostationary Lightning Mapper (GLM) flashes for wildfire ignition surveillance over California.

FlashRisk helps analysts inspect real lightning flashes in space and time. Analyze combines lightning characteristics with environmental conditions and a frozen, pre-trained 21-feature XGBoost model for surveillance prioritization. Model scores are ranking aids for follow-up review, as relative ignition surveillance priority.

## Current milestone

FlashRisk provides a California map interface, real GOES-18 GLM search, selected-flash inspection, GLM event reconstruction, and the working 21-feature XGBoost analysis pipeline for single-flash and multi-flash review.

- **Map-first California interface** with location search and map-based target selection inside California
- **Configurable lightning search:** date, UTC time, centered window (15 / 30 / 60 minutes), and radius (5 / 10 / 25 km)
- **Real GOES-18 GLM retrieval** and display of flashes matching the selected space/time query
- **Flash selection and inspection**, including GLM characteristics such as energy, area, duration, group count, max group area, max group energy, max events per group, and total event count
- **Selected-flash GLM event reconstruction** using actual event coordinates and timing (playback slowed for usability)
- **Observed event extent** (spatial outline of accumulated event coordinates) and **observed span** (maximum great-circle distance between event locations)—visualization aids only, not fire perimeters or predicted burn areas
- **Search-radius and map-distance context** (radius label and metric scale bar)
- **Analyze selected flash** — runs the validated 21-feature pipeline and shows a FlashRisk Analysis Report (0–100 presentation score, grouped inputs; no risk-category thresholds)
- **Multi-flash selection** of up to 10 lightning flashes from the current search, analyzed with the same single-flash pipeline
- **Multi-Flash Surveillance Report** ranks successfully analyzed flashes by FlashRisk score, compares environmental and lightning ranges, and shows ranked locations on a map
- **Individual flash drill-down** from the multi-flash report into that flash’s stored analysis
- **PDF downloads** of the individual FlashRisk report and the combined multi-flash surveillance packet
- **Sentinel-2 surveillance imagery** for visual reconnaissance around a flash (display-only; not one of the 21 XGBoost model inputs)
- **Backend golden/parity tests** for the validated GLM reference flash

## How it works

1. Choose a California location, date, UTC time, search window, and search radius.
2. Retrieve real GOES-18 GLM flashes for that query.
3. Select a flash on the map.
4. Inspect GLM characteristics and play back the flash’s observed events.
5. Click Analyze to retrieve environmental features, assemble the frozen 21-feature vector, and score with the frozen XGBoost model. The right-side FlashRisk Analysis Report shows a 0–100 presentation score and organized model inputs.
6. Or select up to 10 flashes, run the same Analyze path on each, and open the Multi-Flash Surveillance Report to rank and compare them. From that report, open any successfully analyzed flash’s stored detailed analysis.

## Current status

| Area | Status |
| --- | --- |
| California map / search UI | Implemented |
| GOES-18 GLM search | Implemented |
| Flash selection & characteristics | Implemented |
| GLM event reconstruction | Implemented |
| GLM backend validation / golden tests | Implemented |
| ERA5-Land environmental retrieval | Implemented (used by Analyze) |
| SMAP soil-moisture retrieval | Implemented (used by Analyze) |
| MODIS vegetation / moisture retrieval | Implemented (used by Analyze) |
| Seasonality (`season_sin` / `season_cos`) | Implemented (used by Analyze) |
| Exact 21-feature construction | Implemented (used by Analyze) |
| Frozen XGBoost inference | Implemented (used by Analyze) |
| Analyze API + FlashRisk Analysis Report | Implemented (0–100 presentation score + grouped inputs; no risk-category thresholds) |
| Model interpretation / result presentation | Implemented (surveillance-priority presentation; no risk-category thresholds) |
| Sentinel-2 reconnaissance imagery | Implemented (display-only visual reconnaissance; not a model input) |
| Multi-flash surveillance report | Implemented (rank, environmental/lightning comparison, map, drill-down, PDF) |

## Technology

- **Frontend:** Next.js (App Router), TypeScript, Tailwind, MapLibre GL JS
- **Backend:** FastAPI / Python
- **Model bundle:** `model/flashrisk-v1` (frozen deployment package used by Analyze)

## Repository structure

```
frontend/              Next.js map UI and selected-flash reconstruction
backend/               FastAPI API, GLM services, and tests
model/flashrisk-v1/    Frozen model bundle used for inference
docs/                  Project documentation
scripts/               Local development helpers
```

## Run locally

Backend: **http://127.0.0.1:8765** · Frontend: **http://localhost:3417**

### Backend (Windows)

From `C:\CAC_FlashRisk\backend` (after creating/activating the project venv and installing dependencies):

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

Health check: <http://127.0.0.1:8765/api/health> · API docs: `/docs`

### Frontend (Windows)

From `C:\CAC_FlashRisk\frontend`:

```powershell
npm.cmd install
npm.cmd run dev
```

Open <http://localhost:3417>.

Optional: copy `frontend/.env.example` to `.env.local` if you need to override the API base URL (default points at `http://127.0.0.1:8765`).

### Production-mode local run

After the same backend command above, the frontend `package.json` scripts support a production build served on port 3417:

```powershell
npm.cmd run build
npm.cmd run start
```

## Configuration / credentials

- Do not commit credentials or secrets.
- Environment files that may contain secrets are gitignored (use the provided `.env.example` templates).
- Large downloaded scientific datasets are not stored in this repository.

| Variable | Where | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | frontend | `http://127.0.0.1:8765` |
| `NEXT_PUBLIC_BASEMAP_STYLE_URL` | frontend | CARTO Dark Matter (no key) |
| `FLASHRISK_CORS_ORIGINS` | backend | `["http://localhost:3417","http://127.0.0.1:3417"]` |
| `CDS_API_KEY` | backend `.env` | *(required for ERA5-Land; never commit)* |
| `EE_PROJECT` | backend `.env` | *(Earth Engine Cloud project for SMAP, MODIS, and Sentinel-2 imagery; never commit secrets)* |

Basemap: © OpenStreetMap contributors, © CARTO.

### Backend tests

From `backend/` (default suite excludes live network tests):

```powershell
.\.venv\Scripts\python.exe -m pytest
```

ERA5 helpers (fast, offline):

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_era5_helpers.py
```

ERA5 golden parity against Copernicus CDS (real network; needs `CDS_API_KEY` in `backend/.env`; may take several minutes):

```powershell
.\.venv\Scripts\python.exe -m pytest -m integration tests/test_era5_golden.py -s
```

SMAP helpers (fast, offline):

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_smap_helpers.py
```

One-time Earth Engine developer authentication for this backend environment (not called by app code):

```powershell
.\.venv\Scripts\earthengine.exe authenticate
```

SMAP golden parity against Earth Engine (real network; needs `EE_PROJECT` plus prior EE auth):

```powershell
.\.venv\Scripts\python.exe -m pytest -m integration tests/test_smap_golden.py -s
```

MODIS helpers (fast, offline):

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_modis_helpers.py
```

MODIS golden parity against Earth Engine (real network; needs `EE_PROJECT` plus prior EE auth):

```powershell
.\.venv\Scripts\python.exe -m pytest -m integration tests/test_modis_golden.py -s
```

Frozen XGBoost parity (offline; uses local model bundle + optional `reference/model` fixture):

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_xgboost_parity.py
```
