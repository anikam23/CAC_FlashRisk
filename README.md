# CAC FlashRisk

A Congressional App Challenge web application for prioritizing GOES-18 Geostationary Lightning Mapper (GLM) flashes for wildfire ignition surveillance over California.

FlashRisk helps analysts inspect real lightning flashes in space and time. The eventual Analyze workflow will combine lightning characteristics with environmental conditions and a frozen, pre-trained 21-feature XGBoost model for surveillance prioritization. Model scores are ranking aids for follow-up review—not calibrated wildfire probabilities, and not proof that a flash ignited a fire.

## Current milestone

FlashRisk currently provides a working California map interface, real GOES-18 GLM search, selected-flash inspection, and GLM event reconstruction.

- **Map-first California interface** with location search and map-based target selection inside California
- **Configurable lightning search:** date, UTC time, centered window (15 / 30 / 60 minutes), and radius (5 / 10 / 25 km)
- **Real GOES-18 GLM retrieval** and display of flashes matching the selected space/time query
- **Flash selection and inspection**, including GLM characteristics such as energy, area, duration, group count, max group area, max group energy, max events per group, and total event count
- **Selected-flash GLM event reconstruction** using actual event coordinates and timing (playback slowed for usability)
- **Observed event extent** (spatial outline of accumulated event coordinates) and **observed span** (maximum great-circle distance between event locations)—visualization aids only, not fire perimeters or predicted burn areas
- **Search-radius and map-distance context** (radius label and metric scale bar)
- **Backend golden/parity tests** for the validated GLM reference flash

## How it works

1. Choose a California location, date, UTC time, search window, and search radius.
2. Retrieve real GOES-18 GLM flashes for that query.
3. Select a flash on the map.
4. Inspect GLM characteristics and play back the flash’s observed events.
5. *(Future)* Analyze will add environmental retrieval and frozen-model surveillance prioritization for the selected flash.

## Current status

| Area | Status |
| --- | --- |
| California map / search UI | Implemented |
| GOES-18 GLM search | Implemented |
| Flash selection & characteristics | Implemented |
| GLM event reconstruction | Implemented |
| GLM backend validation / golden tests | Implemented |
| ERA5-Land environmental retrieval | Under development |
| SMAP soil-moisture retrieval | Under development |
| MODIS vegetation / moisture retrieval | Under development |
| Exact 21-feature construction | Under development |
| Frozen XGBoost inference | Under development |
| Model interpretation / result presentation | Under development |
| Sentinel-2 reconnaissance imagery | Under development |
| Multi-flash surveillance report | Under development |

## Technology

- **Frontend:** Next.js (App Router), TypeScript, Tailwind, MapLibre GL JS
- **Backend:** FastAPI / Python
- **Model bundle:** `model/flashrisk-v1` (frozen deployment package for the eventual Analyze path)

## Repository structure

```
frontend/              Next.js map UI and selected-flash reconstruction
backend/               FastAPI API, GLM services, and tests
model/flashrisk-v1/    Frozen model bundle for eventual inference
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

## Configuration / credentials

- Do not commit credentials or secrets.
- Environment files that may contain secrets are gitignored (use the provided `.env.example` templates).
- Large downloaded scientific datasets are not stored in this repository.

| Variable | Where | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | frontend | `http://127.0.0.1:8765` |
| `NEXT_PUBLIC_BASEMAP_STYLE_URL` | frontend | CARTO Dark Matter (no key) |
| `FLASHRISK_CORS_ORIGINS` | backend | `["http://localhost:3417","http://127.0.0.1:3417"]` |

Basemap: © OpenStreetMap contributors, © CARTO.
