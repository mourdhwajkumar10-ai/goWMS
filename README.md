# goWMS

Warehouse Management System — Go/Fiber backend + React/Vite frontend + PostgreSQL.

> **Recovery note:** The original `goWMS` source was lost and has been rebuilt
> from the compiled binary, the live API, the frontend bundle, and a schema
> dump. The API contract and database schema are exact; internal
> implementation is a faithful reconstruction.

## Stack

| Layer      | Tech                                          |
|------------|-----------------------------------------------|
| Backend    | Go 1.23, Fiber v2, pgx v5, JWT auth           |
| Frontend   | React 18, Vite 5, TypeScript, PWA             |
| Database   | PostgreSQL 16                                 |
| Migrations | SQL files in `migrations/` (idempotent)       |

## Modules

auth · po · grn · picking · packing · dispatch · putaway · putaway-rules ·
qi · serial · workflow · cycle-count · notifications · comments ·
attachments · backorder · billing · customer · approval · analytics ·
reports · master-data (items/warehouses/suppliers/batches/delivery-notes/
stock-entries/stock-reconciliations)

## Quick start (Docker — recommended)

```bash
cp .env.example .env          # adjust JWT_SECRET, DB_PASSWORD
./scripts/deploy.sh build     # docker compose build
./scripts/deploy.sh up        # start + wait for health
# open http://localhost:8080
```

The stack boots Postgres (with a persistent volume), runs the idempotent
migrations once via a `migrate` service, then starts the single `api`
container that serves both the REST API (`/api/*`) and the built frontend
(SPA fallback).

Ports can be overridden: `APP_PORT=9090 DB_PORT=5433 ./scripts/deploy.sh up`.

## Local development (no Docker)

```bash
# 1. Have a Postgres running, then create the schema:
for f in migrations/*.sql; do psql -U gowms -d gowms -f "$f"; done

# 2. Backend (terminal 1) — reads .env / env vars
go run ./cmd/server

# 3. Frontend (terminal 2) — Vite dev server proxies /api -> :8080
cd web && npm install && npm run dev
```

## Configuration

All runtime settings come from environment variables (see `.env.example`):

| Variable             | Default                   | Description                  |
|----------------------|---------------------------|------------------------------|
| `PORT`               | `8080`                    | HTTP port                    |
| `JWT_SECRET`         | `change-me-in-production` | JWT signing secret           |
| `TOKEN_EXPIRY_HOURS` | `24`                      | Auth token lifetime          |
| `DB_HOST`            | `localhost`               | Postgres host                |
| `DB_PORT`            | `5432`                    | Postgres port                |
| `DB_USER`            | `gowms`                   | Postgres user                |
| `DB_PASSWORD`        | `secret`                  | Postgres password            |
| `DB_NAME`            | `gowms`                   | Postgres database            |
| `REDIS_URL`          | `localhost:6379`          | Reserved                     |

## API health

```
GET /api/health   -> {"status":"ok"}
```

Register a user (`POST /api/auth/register`) then sign in
(`POST /api/auth/login`) to obtain a JWT for the protected endpoints.

## Deploying to a VM (e.g. GCP Compute Engine)

1. Install Docker + Docker Compose plugin on the VM.
2. Copy the `goWMS/` directory to the VM (git clone / rsync / scp).
3. `cp .env.example .env` and set a strong `JWT_SECRET` + `DB_PASSWORD`.
4. Run `./scripts/deploy.sh build && ./scripts/deploy.sh up`.
5. Open the firewall port for `APP_PORT` (default 8080) in GCP.

> The `deploy.sh up` health wait uses `curl` — make sure it is installed on
> the VM (`apt install curl` on Debian/Ubuntu, `yum install curl` on RHEL).
