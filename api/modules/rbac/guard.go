package rbac

import (
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
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

// RequirePermission returns a middleware that checks the named permission.
// Admin always passes. Missing store falls back to admin-only.
func RequirePermission(perm string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if HasPermission(c, perm) {
			return c.Next()
		}
		return shared.Err(c, fiber.StatusForbidden, perm+" required")
	}
}

// UserMayAccessWarehouse reports whether a user with the given role and assigned
// warehouse may access targetWarehouseID. Admin always passes. Pure helper so
// warehouse-scope policy can be unit-tested without a database.
func UserMayAccessWarehouse(role string, userWarehouseID *int, targetWarehouseID int) bool {
	role = strings.TrimSpace(role)
	if strings.EqualFold(role, "admin") {
		return true
	}
	return userWarehouseID != nil && *userWarehouseID == targetWarehouseID
}

// RequireWarehouseAccess returns a middleware that verifies the authenticated
// user may access the target warehouse. It derives the user's warehouse scope
// from the employees or users table and rejects cross-warehouse access.
func RequireWarehouseAccess(db *pgxpool.Pool, targetWarehouseID int) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, _ := c.Locals("user_id").(int)
		role, _ := c.Locals("role").(string)

		var userWarehouseID *int
		// Try employees table first (PIN-login users).
		err := db.QueryRow(c.Context(),
			`SELECT warehouse_id FROM employees WHERE id=$1 AND COALESCE(disabled,false)=false`,
			userID).Scan(&userWarehouseID)
		if err != nil {
			// Fall back to users table (password-login users).
			_ = db.QueryRow(c.Context(),
				`SELECT warehouse_id FROM users WHERE id=$1 AND is_active=true`,
				userID).Scan(&userWarehouseID)
		}

		if !UserMayAccessWarehouse(role, userWarehouseID, targetWarehouseID) {
			return shared.Err(c, fiber.StatusForbidden, "access denied for this warehouse")
		}
		return c.Next()
	}
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

// PermissionsForRole returns all permission codes for the current user's role.
// Returns nil when the store is unavailable.
func PermissionsForRole(c *fiber.Ctx) []string {
	role, _ := c.Locals("role").(string)
	role = strings.TrimSpace(role)
	s := Global()
	if s == nil {
		return nil
	}
	return s.Codes(role)
}

// WarehouseIDsForUser returns warehouse IDs the user may access.
// For now returns the single assigned warehouse; future multi-warehouse
// support can expand this.
func WarehouseIDsForUser(db *pgxpool.Pool, c *fiber.Ctx) []int {
	userID, _ := c.Locals("user_id").(int)
	role, _ := c.Locals("role").(string)
	role = strings.TrimSpace(role)

	if strings.EqualFold(role, "admin") {
		// Admin gets all warehouses.
		rows, err := db.Query(c.Context(), `SELECT id FROM warehouses ORDER BY id`)
		if err != nil {
			return nil
		}
		defer rows.Close()
		var ids []int
		for rows.Next() {
			var id int
			if err := rows.Scan(&id); err == nil {
				ids = append(ids, id)
			}
		}
		return ids
	}

	// Check employees table first.
	var whID *int
	_ = db.QueryRow(c.Context(),
		`SELECT warehouse_id FROM employees WHERE id=$1 AND COALESCE(disabled,false)=false`,
		userID).Scan(&whID)
	if whID == nil {
		_ = db.QueryRow(c.Context(),
			`SELECT warehouse_id FROM users WHERE id=$1 AND is_active=true`,
			userID).Scan(&whID)
	}
	if whID != nil && *whID > 0 {
		return []int{*whID}
	}
	return nil
}


