#!/usr/bin/env bash
#
# Start a temporary Cloudflare Quick Tunnel for goWMS.
#
# Usage:
#   ./scripts/cloudflare-quick-tunnel.sh
#   APP_PORT=9090 ./scripts/cloudflare-quick-tunnel.sh
#
# The generated trycloudflare.com URL is temporary and remains available only
# while this process is running. This script does not use or store credentials.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_PORT="${APP_PORT:-8080}"
ORIGIN="http://127.0.0.1:${APP_PORT}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Error: cloudflared is not installed or is not on PATH." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required to check goWMS health." >&2
  exit 1
fi

if ! curl --fail --silent --show-error "${ORIGIN}/api/health" >/dev/null; then
  echo "Error: goWMS is not healthy at ${ORIGIN}. Start it with:" >&2
  echo "  ./scripts/deploy.sh up" >&2
  exit 1
fi

echo ">>> goWMS is healthy at ${ORIGIN}"
echo ">>> Starting temporary Cloudflare HTTPS tunnel..."
echo ">>> Keep this process running while using the public URL. Press Ctrl-C to stop it."

cd "$ROOT_DIR"
exec cloudflared tunnel --url "$ORIGIN" --no-autoupdate
