# CAC FlashRisk

A Congressional App Challenge web app for analyzing individual GOES-18 Geostationary Lightning Mapper (GLM) flashes over California and estimating wildfire ignition surveillance priority with a frozen, pre-trained 21-feature XGBoost model.

> **Status:** scaffold. The map shell and backend health check run today. Flash retrieval, environmental data retrieval, feature construction, and model inference are not implemented yet.

The model output is a raw XGBoost score. It is not a calibrated wildfire probability.

## Repository structure

```
frontend/              Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + MapLibre GL JS
backend/               FastAPI app managed with uv
  app/                 main.py, api/routes, schemas, core, services/{glm,environment,features,inference,imagery}
  tests/               pytest suite
model/flashrisk-v1/    Frozen model bundle (feature manifest now, model.json supplied later)
docs/                  Project documentation (see docs/architecture.md)
scripts/               Local development helpers
```

## Prerequisites

- Node.js 20.9 or newer, with npm
- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

## Run locally

The backend listens on **8765** and the frontend on **3417**.

### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

Check it: <http://127.0.0.1:8765/api/health> (interactive docs at `/docs`).

### Frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env.local   # optional; defaults point at http://127.0.0.1:8765
npm install
npm run dev
```

Open <http://localhost:3417>. The panel shows **Backend connected** when the backend is reachable.

### Both at once

```bash
./scripts/dev.sh
```

## Checks

```bash
cd backend && uv run pytest && uv run ruff check .
cd frontend && npm run lint && npm run build
```

## Configuration

Copy the `.env.example` files to `.env` (backend) or `.env.local` (frontend). Never commit real credentials; `.env*` files other than the templates are git-ignored.

| Variable | Where | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | frontend | `http://127.0.0.1:8765` |
| `NEXT_PUBLIC_BASEMAP_STYLE_URL` | frontend | CARTO Dark Matter (no key) |
| `FLASHRISK_CORS_ORIGINS` | backend | `["http://localhost:3417","http://127.0.0.1:3417"]` |

Basemap: © OpenStreetMap contributors, © CARTO.
