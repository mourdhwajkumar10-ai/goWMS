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
	"goWMS/api/modules/audit"
	"goWMS/api/modules/auth"
	"goWMS/api/modules/backorder"
	"goWMS/api/modules/billing"
	"goWMS/api/modules/comments"
	"goWMS/api/modules/customer"
	"goWMS/api/modules/cyclecount"
	"goWMS/api/modules/dispatch"
	"goWMS/api/modules/employee"
	"goWMS/api/modules/grn"
	"goWMS/api/modules/inventory"
	"goWMS/api/modules/masterdata"
	"goWMS/api/modules/notifications"
	"goWMS/api/modules/packing"
	"goWMS/api/modules/packinglist"
	"goWMS/api/modules/picking"
	"goWMS/api/modules/po"
	"goWMS/api/modules/putaway"
	"goWMS/api/modules/putawayrules"
	"goWMS/api/modules/qi"
	"goWMS/api/modules/rbac"
	"goWMS/api/modules/reports"
	"goWMS/api/modules/returns"
	"goWMS/api/modules/salesorder"
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
		AppName:   "goWMS",
		BodyLimit: 32 * 1024 * 1024, // spare-parts CSV import can be tens of thousands of JSON rows
	})
	app.Use(logger.New())

	// API group: rate limited (static assets are not throttled).
	// Floor receiving fires many GETs (session + box/item summary). Admin and
	// operator on the same warehouse IP must not starve carton scans.
	api := app.Group("/api", limiter.New(limiter.Config{
		Max:        600,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			if auth := c.Get(fiber.HeaderAuthorization); auth != "" {
				return c.IP() + "|" + auth
			}
			return c.IP()
		},
		Next: func(c *fiber.Ctx) bool {
			return c.Path() == "/api/health"
		},
	}))

	// Public routes registered before the auth middleware.
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	auth.Register(api, pool)

	// Everything registered from here on requires a valid JWT.
	api.Use(middleware.Auth)
	// Load role→permission cache (Roles UI works even when GOWMS_RBAC is off).
	rbacStore := rbac.Init(pool)
	if rbacStore != nil {
		if err := rbacStore.Reload(context.Background()); err != nil {
			log.Printf("rbac permission cache: %v (apply migrations/011_rbac_roles_permissions.sql)", err)
		} else {
			log.Printf("rbac permission cache loaded")
		}
	}
	// Hard path enforcement is off by default — configure roles first, then GOWMS_RBAC=1.
	if middleware.RBACEnabled() {
		log.Printf("GOWMS_RBAC=1 — path permission enforcement enabled")
		api.Use(middleware.RBACEnforced)
	} else {
		log.Printf("GOWMS_RBAC off — APIs open to any authenticated role (roles.manage still gated)")
	}

	// Roles / permission catalog (admin-configurable RBAC).
	rbac.Register(api, pool)

	// Master-data + comments routes live at the API root (no module prefix).
	masterdata.Register(api, pool)
	masterdata.RegisterCarriersRoot(api, pool) // /api/carriers
	comments.Register(api, pool)

	// Operational modules are namespaced under their own prefix so no
	// two-segment wildcard (e.g. comments) can shadow them.
	analytics.Register(api.Group("/analytics"), pool)
	approval.Register(api.Group("/approval"), pool)
	attachments.Register(api.Group("/attachments"), pool)
	audit.Register(api.Group("/audit"), pool)
	backorder.Register(api.Group("/backorder"), pool)
	backorder.RegisterV2(api.Group("/backorder/v2"), pool)
	billing.Register(api.Group("/billing"), pool)
	customer.Register(api.Group("/customer"), pool)
	cyclecount.Register(api.Group("/cycle-count"), pool)
	cyclecount.Register(api.Group("/cyclecount"), pool) // frontend alias
	dispatch.Register(api.Group("/dispatch"), pool)
	employee.Register(api.Group("/employees"), pool)
	grn.Register(api.Group("/grn"), pool)
	inventory.Register(api.Group("/inventory"), pool)
	notifications.Register(api.Group("/notifications"), pool)
	packing.Register(api.Group("/packing"), pool)
	packinglist.Register(api.Group("/packing-list"), pool)
	packinglist.RegisterReceiving(api.Group("/receiving"), pool)
	grn.RegisterRFScan(api.Group("/receiving"), pool)
	packinglist.RegisterGRNAlias(api.Group("/grn"), pool) // docs alias: /grn/:id/import-packing-list
	packinglist.RegisterSupplierAlias(api.Group("/suppliers"), pool)
	picking.Register(api.Group("/picking"), pool)
	picking.RegisterWave(api.Group("/picking"), pool)
	po.Register(api.Group("/po"), pool)
	putaway.Register(api.Group("/putaway"), pool)
	putawayrules.Register(api.Group("/putaway-rules"), pool)
	qi.Register(api.Group("/qi"), pool)
	reports.Register(api.Group("/reports"), pool)
	returns.Register(api.Group("/returns"), pool)
	salesorder.Register(api.Group("/sales-orders"), pool)
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
