package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"goWMS/api/config"
	"goWMS/api/middleware"
	"goWMS/api/modules/analytics"
	"goWMS/api/modules/approval"
	"goWMS/api/modules/attachments"
	"goWMS/api/modules/auth"
	"goWMS/api/modules/backorder"
	"goWMS/api/modules/billing"
	"goWMS/api/modules/comments"
	"goWMS/api/modules/customer"
	"goWMS/api/modules/cyclecount"
	"goWMS/api/modules/dispatch"
	"goWMS/api/modules/grn"
	"goWMS/api/modules/inventory"
	"goWMS/api/modules/masterdata"
	"goWMS/api/modules/notifications"
	"goWMS/api/modules/packing"
	"goWMS/api/modules/picking"
	"goWMS/api/modules/po"
	"goWMS/api/modules/putaway"
	"goWMS/api/modules/putawayrules"
	"goWMS/api/modules/qi"
	"goWMS/api/modules/reports"
	"goWMS/api/modules/serial"
	"goWMS/api/modules/workflow"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURLString())
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	app := fiber.New(fiber.Config{
		AppName: "goWMS",
	})
	app.Use(logger.New())

	// API group: rate limited (static assets are not throttled).
	api := app.Group("/api", limiter.New(limiter.Config{
		Max:        120,
		Expiration: time.Minute,
	}))

	// Public routes registered before the auth middleware.
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	auth.Register(api, pool)

	// Everything registered from here on requires a valid JWT.
	api.Use(middleware.Auth)

	// Master-data + comments routes live at the API root (no module prefix).
	masterdata.Register(api, pool)
	comments.Register(api, pool)

	// Operational modules are namespaced under their own prefix so no
	// two-segment wildcard (e.g. comments) can shadow them.
	analytics.Register(api.Group("/analytics"), pool)
	approval.Register(api.Group("/approval"), pool)
	attachments.Register(api.Group("/attachments"), pool)
	backorder.Register(api.Group("/backorder"), pool)
	billing.Register(api.Group("/billing"), pool)
	customer.Register(api.Group("/customer"), pool)
	cyclecount.Register(api.Group("/cycle-count"), pool)
	cyclecount.Register(api.Group("/cyclecount"), pool) // frontend alias
	dispatch.Register(api.Group("/dispatch"), pool)
	grn.Register(api.Group("/grn"), pool)
	inventory.Register(api.Group("/inventory"), pool)
	notifications.Register(api.Group("/notifications"), pool)
	packing.Register(api.Group("/packing"), pool)
	picking.Register(api.Group("/picking"), pool)
	po.Register(api.Group("/po"), pool)
	putaway.Register(api.Group("/putaway"), pool)
	putawayrules.Register(api.Group("/putaway-rules"), pool)
	qi.Register(api.Group("/qi"), pool)
	reports.Register(api.Group("/reports"), pool)
	serial.Register(api.Group("/serial"), pool)
	workflow.Register(api.Group("/workflow"), pool)

	// Serve the built frontend (web/dist) as an SPA, if present.
	serveSPA(app)

	log.Printf("goWMS listening on :%s", cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

// serveSPA statically serves web/dist and falls back to index.html for
// non-API routes so client-side routing works. It no-ops when the dist
// folder is absent (e.g. pure-API development).
func serveSPA(app *fiber.App) {
	dist := "web/dist"
	if _, err := os.Stat(dist); err != nil {
		log.Printf("SPA dist not found at %q — API-only mode", dist)
		return
	}

	app.Static("/", dist, fiber.Static{
		Index: "index.html",
		// Prevent stale SPA shells (and old PWA caches) from sticking around.
		MaxAge: 0,
		ModifyResponse: func(c *fiber.Ctx) error {
			if c.Path() == "/" || strings.HasSuffix(c.Path(), ".html") {
				c.Set("Cache-Control", "no-store, no-cache, must-revalidate")
				c.Set("Pragma", "no-cache")
			}
			return nil
		},
	})

	app.Get("/*", func(c *fiber.Ctx) error {
		// Never swallow /api routes.
		if len(c.Path()) >= 4 && c.Path()[:4] == "/api" {
			return c.SendStatus(fiber.StatusNotFound)
		}
		c.Set("Cache-Control", "no-store, no-cache, must-revalidate")
		index := filepath.Join(dist, "index.html")
		return c.SendFile(index)
	})
}
