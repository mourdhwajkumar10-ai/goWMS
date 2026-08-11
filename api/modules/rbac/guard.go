package rbac

import (
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
)

// requireManageRoles allows admin or anyone with roles.manage (from DB cache).
// Applies even when GOWMS_RBAC is off so role setup stays admin-gated.
func requireManageRoles(c *fiber.Ctx) error {
	if HasPermission(c, "roles.manage") {
		return c.Next()
	}
	return shared.Err(c, fiber.StatusForbidden, "roles.manage required")
}

// RequireEmployeesManage guards employee mutations / role assignment.
func RequireEmployeesManage(c *fiber.Ctx) error {
	if HasPermission(c, "employees.manage") {
		return c.Next()
	}
	return shared.Err(c, fiber.StatusForbidden, "employees.manage required")
}

// HasPermission checks JWT role against the permission store.
// admin always passes; missing store falls back to admin-only.
func HasPermission(c *fiber.Ctx, perm string) bool {
	role, _ := c.Locals("role").(string)
	role = strings.TrimSpace(role)
	if strings.EqualFold(role, "admin") {
		return true
	}
	if s := Global(); s != nil {
		return s.Has(role, perm)
	}
	return false
}
