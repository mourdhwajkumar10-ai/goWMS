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

**Vite dev server (port 5173)** — hot-reload, best for development:
```bash
cd /Users/yudhistherkumar/Downloads/goWMS/web
nohup npx vite --port 5173 --host > ../.freebuff/preview-0390e66f-dae3-4e9a-b874-851668b2695f.log 2>&1 < /dev/null & echo "pid=$!"; disown
```

**Go API server (port 8080)** — serves built SPA + API:
```bash
cd /Users/yudhistherkumar/Downloads/goWMS
PORT=8080 nohup go run ./cmd/server > .freebuff/preview.log 2>&1 &
```

## Current State

- **Vite dev server** running on **port 5173** (PID 82136) — hot-reload active
- **Go API server** running on **port 8080** — serves built frontend + API
- Frontend: source from `web/src/` via Vite; built via `web/dist/` for Go server
- Login: admin / admin123
