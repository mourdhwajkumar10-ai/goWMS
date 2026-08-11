package middleware

// Hard RBAC enforcement — OFF by default.
//
// Enable after configuring roles in the Roles UI:
//   export GOWMS_RBAC=1
//   # restart server
//
// When enabled, permissions are loaded from role_permissions (in-process cache
// via api/modules/rbac). Admin always passes. Roles/Employees manage endpoints
// stay gated by roles.manage / employees.manage even when this flag is off.

import (
	"os"
	"strings"

	"goWMS/api/modules/rbac"

	"github.com/gofiber/fiber/v2"
)

// RBACEnabled reports whether hard path enforcement should run.
func RBACEnabled() bool {
	v := strings.ToLower(os.Getenv("GOWMS_RBAC"))
	return v == "1" || v == "true" || v == "yes"
}

// RBACEnforced rejects requests whose JWT role lacks the permission for the path.
// Mount ONLY when RBACEnabled() — default off so the floor is not locked out.
func RBACEnforced(c *fiber.Ctx) error {
	if !RBACEnabled() {
		return c.Next()
	}
	role, _ := c.Locals("role").(string)
	if role == "" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"ok": false, "error": "role missing"})
	}
	if strings.EqualFold(role, "admin") {
		return c.Next()
	}

	path := c.Path() // e.g. /api/picking/lists
	seg := ""
	parts := strings.Split(strings.TrimPrefix(path, "/api/"), "/")
	if len(parts) > 0 {
		seg = parts[0]
	}
	if _, ok := rbac.AlwaysAllowSegments[seg]; ok {
		return c.Next()
	}

	need, mapped := rbac.PathPermission[seg]
	if !mapped {
		// Unknown module path: allow (avoid locking new routes) unless store has "*"
		return c.Next()
	}

	store := rbac.Global()
	if store == nil {
		// Fallback to legacy hardcoded prefixes if store not initialized
		return legacyRBAC(c, role, seg)
	}
	if store.Has(role, need) {
		return c.Next()
	}
	// import_export.access also covers export/import-shaped routes under other modules
	if need == "masters.access" || need == "grn.access" {
		if store.Has(role, "import_export.access") && (strings.Contains(path, "/export") || strings.Contains(path, "/import")) {
			return c.Next()
		}
	}
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"ok":    false,
		"error": "forbidden for role " + role + " on /" + seg + " (need " + need + ")",
	})
}

// legacyRBAC keeps previous path-prefix matrix if DB cache failed to init.
func legacyRBAC(c *fiber.Ctx, role, seg string) error {
	rolePermissions := map[string][]string{
		"admin":      {"*"},
		"wm":         {"*"},
		"supervisor": {"*"},
		"picker":     {"picking", "masterdata", "notifications", "comments", "analytics"},
		"packer":     {"packing", "picking", "masterdata", "notifications", "comments"},
		"driver":     {"dispatch", "notifications", "comments"},
		"dispatcher": {"dispatch", "notifications", "comments", "sales-orders"},
		"qi":         {"qi", "grn", "masterdata", "notifications", "comments"},
		"billing":    {"billing", "customer", "sales-orders", "notifications", "comments", "reports"},
	}
	allowed, ok := rolePermissions[strings.ToLower(role)]
	if !ok {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"ok": false, "error": "unknown role"})
	}
	for _, a := range allowed {
		if a == "*" || strings.EqualFold(a, seg) {
			return c.Next()
		}
	}
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"ok": false, "error": "forbidden for role " + role + " on /" + seg,
	})
}
