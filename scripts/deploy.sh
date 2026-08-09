#!/usr/bin/env bash
#
# goWMS deployment script.
#
# Intended for a Linux VM (e.g. a GCP Compute Engine instance with Docker
# installed). Also works locally with Docker Desktop.
#
# Usage:
#   ./scripts/deploy.sh [build|up|down|logs|restart]
#
# Environment:
#   APP_PORT  - host port for the web app (default 8080)
#   DB_PORT   - host port for Postgres (default 5432)
#   JWT_SECRET- JWT signing secret (default: change-me-in-production)
#
set -euo pipefail

cd "$(dirname "$0")/.."

ACTION="${1:-build}"

# Load optional .env (never committed).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export APP_PORT="${APP_PORT:-8080}"
export DB_PORT="${DB_PORT:-5432}"

case "$ACTION" in
  build)
    echo ">>> Building goWMS images..."
    docker compose build
    echo ">>> Done. Run: ./scripts/deploy.sh up"
    ;;
  up)
    echo ">>> Starting stack on :$APP_PORT ..."
    docker compose up -d
    echo ">>> Waiting for API health..."
    for i in $(seq 1 30); do
      if curl -sf "http://localhost:$APP_PORT/api/health" >/dev/null 2>&1; then
        echo ">>> goWMS is UP at http://localhost:$APP_PORT"
        exit 0
      fi
      sleep 2
    done
    echo ">>> WARNING: API did not report healthy within 60s. Check: docker compose logs api"
    exit 1
    ;;
  down)
    docker compose down
    ;;
  restart)
    docker compose restart
    ;;
  logs)
    docker compose logs -f
    ;;
  *)
    echo "Usage: $0 [build|up|down|logs|restart]"
    exit 1
    ;;
esac
