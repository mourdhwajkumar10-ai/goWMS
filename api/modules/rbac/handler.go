package rbac

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register mounts /roles and /permissions under the given router (typically /api).
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/permissions", listPermissions())

	roles := r.Group("/roles")
	roles.Get("/", listRoles(db))
	roles.Get("/list", listRoles(db))
	roles.Post("/seed-defaults", requireManageRoles, seedDefaults(db))
	roles.Post("/", requireManageRoles, createRole(db))
	roles.Get("/:id", getRole(db))
	roles.Put("/:id", requireManageRoles, updateRole(db))
	roles.Delete("/:id", requireManageRoles, deleteRole(db))
	roles.Put("/:id/permissions", requireManageRoles, setPermissions(db))
	roles.Put("/:id/access", requireManageRoles, setAccess(db))
}

func listPermissions() fiber.Handler {
	return func(c *fiber.Ctx) error {
		return shared.OK(c, Catalog)
	}
}

func listRoles(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT r.id, r.code, r.name, COALESCE(r.description,''), r.is_system, r.created_at,
			       COALESCE(r.access_profile, '{}'::jsonb),
			       COALESCE(array_agg(rp.permission_code ORDER BY rp.permission_code)
			         FILTER (WHERE rp.permission_code IS NOT NULL), '{}')
			FROM roles r
			LEFT JOIN role_permissions rp ON rp.role_id = r.id
			GROUP BY r.id
			ORDER BY r.is_system DESC, r.code`)
		if err != nil {
			// Fallback if access_profile column missing (pre-012)
			if strings.Contains(err.Error(), "access_profile") {
				return listRolesLegacy(db, c)
			}
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type roleRow struct {
			ID            int            `json:"id"`
			Code          string         `json:"code"`
			Name          string         `json:"name"`
			Description   string         `json:"description"`
			IsSystem      bool           `json:"is_system"`
			CreatedAt     string         `json:"created_at"`
			Permissions   []string       `json:"permissions"`
			AccessProfile AccessProfile  `json:"access_profile"`
		}
		var list []roleRow
		for rows.Next() {
			var r roleRow
			var created time.Time
			var perms []string
			var raw []byte
			if err := rows.Scan(&r.ID, &r.Code, &r.Name, &r.Description, &r.IsSystem, &created, &raw, &perms); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			r.CreatedAt = created.UTC().Format(time.RFC3339)
			if perms == nil {
				perms = []string{}
			}
			r.Permissions = perms
			r.AccessProfile = ParseAccessProfile(raw)
			list = append(list, r)
		}
		if list == nil {
			list = []roleRow{}
		}
		return shared.OK(c, list)
	}
}

func listRolesLegacy(db *pgxpool.Pool, c *fiber.Ctx) error {
	rows, err := db.Query(c.Context(), `
		SELECT r.id, r.code, r.name, COALESCE(r.description,''), r.is_system, r.created_at,
		       COALESCE(array_agg(rp.permission_code ORDER BY rp.permission_code)
		         FILTER (WHERE rp.permission_code IS NOT NULL), '{}')
		FROM roles r
		LEFT JOIN role_permissions rp ON rp.role_id = r.id
		GROUP BY r.id
		ORDER BY r.is_system DESC, r.code`)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	var list []fiber.Map
	for rows.Next() {
		var id int
		var code, name, desc string
		var isSystem bool
		var created time.Time
		var perms []string
		if err := rows.Scan(&id, &code, &name, &desc, &isSystem, &created, &perms); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if perms == nil {
			perms = []string{}
		}
		list = append(list, fiber.Map{
			"id": id, "code": code, "name": name, "description": desc,
			"is_system": isSystem, "created_at": created.UTC().Format(time.RFC3339),
			"permissions": perms, "access_profile": AccessProfile{},
		})
	}
	if list == nil {
		list = []fiber.Map{}
	}
	return shared.OK(c, list)
}

func getRole(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var r struct {
			ID          int
			Code        string
			Name        string
			Description string
			IsSystem    bool
		}
		var raw []byte
		err = db.QueryRow(c.Context(), `
			SELECT id, code, name, COALESCE(description,''), is_system, COALESCE(access_profile,'{}'::jsonb)
			FROM roles WHERE id=$1`, id).
			Scan(&r.ID, &r.Code, &r.Name, &r.Description, &r.IsSystem, &raw)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "role not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		perms, err := loadPerms(db, c, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id": r.ID, "code": r.Code, "name": r.Name, "description": r.Description,
			"is_system": r.IsSystem, "permissions": perms,
			"access_profile": ParseAccessProfile(raw),
		})
	}
}

func createRole(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Code          string        `json:"code"`
			Name          string        `json:"name"`
			Description   string        `json:"description"`
			Permissions   []string      `json:"permissions"`
			AccessProfile AccessProfile `json:"access_profile"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.Code = strings.TrimSpace(strings.ToLower(body.Code))
		body.Name = strings.TrimSpace(body.Name)
		if body.Code == "" || body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "code and name required")
		}
		if !validRoleCode(body.Code) {
			return shared.Err(c, fiber.StatusBadRequest, "code must be lowercase alphanumeric/underscore, 2-50 chars")
		}

		profile := body.AccessProfile
		if profile.Inbound == "" && profile.Outbound == "" && profile.Admin == "" {
			profile = AccessProfile{Inbound: AccessNone, Outbound: AccessNone, Admin: AccessNone}
		}
		if err := ValidateAccessProfile(profile); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}
		perms := body.Permissions
		if len(perms) == 0 {
			perms = PermissionsForProfile(profile)
		}
		if err := validatePermCodes(perms); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var id int
		err = tx.QueryRow(c.Context(), `
			INSERT INTO roles (code, name, description, is_system, access_profile)
			VALUES ($1,$2,NULLIF($3,''), false, $4::jsonb) RETURNING id`,
			body.Code, body.Name, body.Description, string(profile.JSON())).Scan(&id)
		if err != nil {
			if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
				return shared.Err(c, fiber.StatusConflict, "role code already exists")
			}
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		for _, p := range perms {
			if _, err := tx.Exec(c.Context(),
				`INSERT INTO role_permissions (role_id, permission_code) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
				id, p); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if s := Global(); s != nil {
			s.Invalidate(c.Context())
		}
		return shared.OK(c, fiber.Map{"id": id, "code": body.Code, "access_profile": profile})
	}
}

func updateRole(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		ct, err := db.Exec(c.Context(), `
			UPDATE roles SET
				name = COALESCE(NULLIF($2,''), name),
				description = COALESCE($3, description)
			WHERE id=$1`, id, body.Name, body.Description)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if ct.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "role not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "updated": true})
	}
}

func deleteRole(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var isSystem bool
		var code string
		err = db.QueryRow(c.Context(), `SELECT is_system, code FROM roles WHERE id=$1`, id).Scan(&isSystem, &code)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "role not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if isSystem {
			return shared.Err(c, fiber.StatusForbidden, "cannot delete system role "+code)
		}
		var n int
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM employees WHERE wms_role=$1 AND COALESCE(disabled,false)=false`, code).Scan(&n)
		if n > 0 {
			return shared.Err(c, fiber.StatusConflict, "role still assigned to employees")
		}
		_, err = db.Exec(c.Context(), `DELETE FROM roles WHERE id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if s := Global(); s != nil {
			s.Invalidate(c.Context())
		}
		return shared.OK(c, fiber.Map{"id": id, "deleted": true})
	}
}

func setPermissions(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Permissions []string `json:"permissions"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Permissions == nil {
			body.Permissions = []string{}
		}
		if err := validatePermCodes(body.Permissions); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}
		var exists bool
		err = db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM roles WHERE id=$1)`, id).Scan(&exists)
		if err != nil || !exists {
			return shared.Err(c, fiber.StatusNotFound, "role not found")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		if _, err := tx.Exec(c.Context(), `DELETE FROM role_permissions WHERE role_id=$1`, id); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		for _, p := range body.Permissions {
			if _, err := tx.Exec(c.Context(),
				`INSERT INTO role_permissions (role_id, permission_code) VALUES ($1,$2)`, id, p); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if s := Global(); s != nil {
			s.Invalidate(c.Context())
		}
		return shared.OK(c, fiber.Map{"id": id, "permissions": body.Permissions})
	}
}

func setAccess(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body AccessProfile
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if err := ValidateAccessProfile(body); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}
		body.Inbound = NormalizeLevel(string(body.Inbound))
		body.Outbound = NormalizeLevel(string(body.Outbound))
		body.Admin = NormalizeLevel(string(body.Admin))

		var exists bool
		err = db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM roles WHERE id=$1)`, id).Scan(&exists)
		if err != nil || !exists {
			return shared.Err(c, fiber.StatusNotFound, "role not found")
		}

		perms := PermissionsForProfile(body)
		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		if _, err := tx.Exec(c.Context(), `
			UPDATE roles SET access_profile=$2::jsonb WHERE id=$1`, id, string(body.JSON())); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if _, err := tx.Exec(c.Context(), `DELETE FROM role_permissions WHERE role_id=$1`, id); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		for _, p := range perms {
			if _, err := tx.Exec(c.Context(),
				`INSERT INTO role_permissions (role_id, permission_code) VALUES ($1,$2)`, id, p); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if s := Global(); s != nil {
			s.Invalidate(c.Context())
		}
		return shared.OK(c, fiber.Map{"id": id, "access_profile": body, "permissions": perms})
	}
}

func seedDefaults(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		profiles := DefaultProfiles()
		meta := DefaultRoleMeta()
		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		created := 0
		for code, profile := range profiles {
			m := meta[code]
			var id int
			err := tx.QueryRow(c.Context(), `
				INSERT INTO roles (code, name, description, is_system, access_profile)
				VALUES ($1,$2,$3,true,$4::jsonb)
				ON CONFLICT (code) DO NOTHING
				RETURNING id`, code, m.Name, m.Desc, string(profile.JSON())).Scan(&id)
			if err == pgx.ErrNoRows {
				if err := tx.QueryRow(c.Context(), `SELECT id FROM roles WHERE code=$1`, code).Scan(&id); err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				_, _ = tx.Exec(c.Context(), `
					UPDATE roles SET access_profile=$2::jsonb
					WHERE id=$1 AND (access_profile = '{}'::jsonb OR access_profile IS NULL)`,
					id, string(profile.JSON()))
			} else if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			} else {
				created++
			}

		var n int
		_ = tx.QueryRow(c.Context(), `SELECT COUNT(*) FROM role_permissions WHERE role_id=$1`, id).Scan(&n)
		if n == 0 {
			for _, p := range PermissionsForProfile(profile) {
				if _, err := tx.Exec(c.Context(),
					`INSERT INTO role_permissions (role_id, permission_code) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
					id, p); err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
			}
			// Also seed fine-grained permissions for this role.
			if finePerms, ok := FineGrainedPermissions()[code]; ok {
				for _, p := range finePerms {
					if _, err := tx.Exec(c.Context(),
						`INSERT INTO role_permissions (role_id, permission_code) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
						id, p); err != nil {
						return shared.Err(c, fiber.StatusInternalServerError, err.Error())
					}
				}
			}
		}
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if s := Global(); s != nil {
			s.Invalidate(c.Context())
		}
		return shared.OK(c, fiber.Map{"seeded": true, "created": created, "ensured": len(profiles)})
	}
}

func loadPerms(db *pgxpool.Pool, c *fiber.Ctx, roleID int) ([]string, error) {
	rows, err := db.Query(c.Context(), `
		SELECT permission_code FROM role_permissions WHERE role_id=$1 ORDER BY permission_code`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if out == nil {
		out = []string{}
	}
	return out, rows.Err()
}

func validatePermCodes(codes []string) error {
	valid := ValidCodes()
	for _, c := range codes {
		if _, ok := valid[c]; !ok {
			return fmt.Errorf("unknown permission: %s", c)
		}
	}
	return nil
}

func validRoleCode(code string) bool {
	if len(code) < 2 || len(code) > 50 {
		return false
	}
	for _, ch := range code {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' {
			continue
		}
		return false
	}
	return true
}

// RoleExists checks roles table for a code (for employee assign validation).
func RoleExists(db *pgxpool.Pool, c *fiber.Ctx, code string) (bool, error) {
	var ok bool
	err := db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM roles WHERE code=$1)`, strings.ToLower(code)).Scan(&ok)
	return ok, err
}
