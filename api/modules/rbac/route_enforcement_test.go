package rbac

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestRequirePermissionMiddlewareDeny(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"viewer": {"receiving.view": {}},
		"supervisor": {
			"receiving.view":    {},
			"receiving.approve": {},
			"po.create":         {},
			"po.view":           {},
		},
	}}
	old := global
	global = store
	defer func() { global = old }()

	tests := []struct {
		name       string
		role       string
		perm       string
		wantStatus int
	}{
		{"viewer denied approve", "viewer", "receiving.approve", fiber.StatusForbidden},
		{"viewer denied po.create", "viewer", "po.create", fiber.StatusForbidden},
		{"supervisor allowed approve", "supervisor", "receiving.approve", fiber.StatusOK},
		{"supervisor allowed po.create", "supervisor", "po.create", fiber.StatusOK},
		{"admin bypass", "admin", "roles.manage", fiber.StatusOK},
		{"empty role denied", "", "receiving.view", fiber.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/t", func(c *fiber.Ctx) error {
				c.Locals("role", tt.role)
				return c.Next()
			}, RequirePermission(tt.perm), func(c *fiber.Ctx) error {
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, "/t", nil)
			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("app.Test: %v", err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tt.wantStatus {
				body, _ := io.ReadAll(resp.Body)
				t.Fatalf("status=%d want=%d body=%s", resp.StatusCode, tt.wantStatus, body)
			}
			if tt.wantStatus == fiber.StatusForbidden {
				var payload struct {
					OK    bool   `json:"ok"`
					Error string `json:"error"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
					t.Fatalf("decode: %v", err)
				}
				if payload.OK {
					t.Fatal("expected ok=false on deny")
				}
				if payload.Error == "" {
					t.Fatal("expected error message on deny")
				}
			}
		})
	}
}

func TestRequirePermissionMiddlewareNilStoreAdminOnly(t *testing.T) {
	old := global
	global = nil
	defer func() { global = old }()

	app := fiber.New()
	app.Get("/t", func(c *fiber.Ctx) error {
		c.Locals("role", "viewer")
		return c.Next()
	}, RequirePermission("receiving.view"), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/t", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("nil store non-admin should be 403, got %d", resp.StatusCode)
	}

	app2 := fiber.New()
	app2.Get("/t", func(c *fiber.Ctx) error {
		c.Locals("role", "admin")
		return c.Next()
	}, RequirePermission("anything"), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})
	resp2, err := app2.Test(httptest.NewRequest(http.MethodGet, "/t", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != fiber.StatusOK {
		t.Fatalf("nil store admin should bypass, got %d", resp2.StatusCode)
	}
}
