# ---- Stage 1: build the React frontend ----
FROM node:20-alpine AS web
WORKDIR /build
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---- Stage 2: build the Go backend ----
FROM golang:1.23-alpine AS api
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY api/ api/
COPY cmd/ cmd/
COPY --from=web /build/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/gowms-server ./cmd/server

# ---- Stage 3: minimal runtime image ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl tzdata su-exec \
    && addgroup -S gowms && adduser -S -G gowms gowms
WORKDIR /app
COPY --from=api /out/gowms-server ./gowms-server
COPY --from=web /build/dist ./web/dist
COPY migrations/ ./migrations/
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/uploads && chown -R gowms:gowms /app
# The entrypoint runs as root to fix volume ownership, then drops privileges.
# DB_HOST etc. are provided by docker-compose / the platform at runtime.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["./gowms-server"]
EXPOSE 8080
