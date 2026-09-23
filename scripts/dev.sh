#!/usr/bin/env bash
# Start the backend (port 8765) and frontend (port 3417) together. Ctrl+C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd "$ROOT/backend" && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765) &
(cd "$ROOT/frontend" && npm run dev) &

wait
