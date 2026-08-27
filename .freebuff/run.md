# goWMS Preview Run Doc

## How to Reproduce Artifacts

1. **Dependencies are already installed** — `web/node_modules/` exists.
2. **Go server must be running** on port 8080. From the project root:
   ```bash
   cd /Users/yudhistherkumar/Downloads/goWMS
   PORT=8080 go run ./cmd/server &
   ```
3. **Frontend build** (for port 8080 to serve the latest UI):
   ```bash
   cd web && npm run build
   ```

## How to Run the Server

Port 8080 is the primary preview target. The Go binary serves both the API and the built SPA (`web/dist/`).

```bash
cd /Users/yudhistherkumar/Downloads/goWMS
PORT=8080 nohup go run ./cmd/server > .freebuff/preview.log 2>&1 &
```

The Go server on 8080 serves the frontend from `web/dist/`. Run `cd web && npm run build` after any frontend source change to update the served UI.

## Current State

- Go API server running on **port 8080** (PID 33575)
- Frontend: built from `web/src/` → served via `web/dist/`
- Login: admin / admin123
