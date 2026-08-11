package employee

import (
	"fmt"
	"strconv"
	"strings"

	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Register wires employee CRUD (PIN set separately). Parallel to users/password auth.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/", list(db))
	r.Get("/list", list(db))
	r.Get("/export", exportCSV(db))
	r.Post("/", rbac.RequireEmployeesManage, create(db))
	r.Get("/:id", get(db))
	r.Put("/:id", rbac.RequireEmployeesManage, update(db))
	r.Put("/:id/role", rbac.RequireEmployeesManage, assignRole(db))
	r.Post("/:id/pin", rbac.RequireEmployeesManage, setPIN(db))
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, employee_name, employee_number, department, designation, status,
			       warehouse_id, wms_role, badge_code, cell_number, company_email,
			       (pin_hash IS NOT NULL) AS has_pin
			FROM employees
			WHERE COALESCE(disabled,false)=false
			ORDER BY employee_name LIMIT 200`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type row struct {
			ID             int     `json:"id"`
			EmployeeName   string  `json:"employee_name"`
			EmployeeNumber *string `json:"employee_number"`
			Department     *string `json:"department"`
			Designation    *string `json:"designation"`
			Status         *string `json:"status"`
			WarehouseID    *int    `json:"warehouse_id"`
			WMSRole        *string `json:"wms_role"`
			BadgeCode      *string `json:"badge_code"`
			CellNumber     *string `json:"cell_number"`
			CompanyEmail   *string `json:"company_email"`
			HasPIN         bool    `json:"has_pin"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ID, &r.EmployeeName, &r.EmployeeNumber, &r.Department, &r.Designation,
				&r.Status, &r.WarehouseID, &r.WMSRole, &r.BadgeCode, &r.CellNumber, &r.CompanyEmail, &r.HasPIN); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		if list == nil {
			list = []row{}
		}
		return shared.OK(c, list)
	}
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			EmployeeName   string `json:"employee_name"`
			Company        string `json:"company"`
			EmployeeNumber string `json:"employee_number"`
			Department     string `json:"department"`
			Designation    string `json:"designation"`
			WarehouseID    *int   `json:"warehouse_id"`
			WMSRole        string `json:"wms_role"`
			BadgeCode      string `json:"badge_code"`
			CellNumber     string `json:"cell_number"`
			CompanyEmail   string `json:"company_email"`
			PIN            string `json:"pin"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.EmployeeName == "" {
			return shared.Err(c, fiber.StatusBadRequest, "employee_name required")
		}
		if body.Company == "" {
			body.Company = "Nirvana"
		}
		if body.WMSRole == "" {
			body.WMSRole = "picker"
		}
		body.WMSRole = strings.ToLower(strings.TrimSpace(body.WMSRole))
		if ok, err := rbac.RoleExists(db, c, body.WMSRole); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		} else if !ok {
			return shared.Err(c, fiber.StatusBadRequest, "unknown role: "+body.WMSRole)
		}

		var pinHash any
		if body.PIN != "" {
			if len(body.PIN) < 4 || len(body.PIN) > 8 {
				return shared.Err(c, fiber.StatusBadRequest, "pin must be 4-8 digits")
			}
			h, err := bcrypt.GenerateFromPassword([]byte(body.PIN), bcrypt.DefaultCost)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, "failed to hash pin")
			}
			pinHash = string(h)
		}

		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO employees (
				employee_name, company, employee_number, department, designation,
				warehouse_id, wms_role, badge_code, cell_number, company_email, pin_hash, status
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Active') RETURNING id`,
			body.EmployeeName, body.Company, nullEmpty(body.EmployeeNumber), nullEmpty(body.Department),
			nullEmpty(body.Designation), body.WarehouseID, body.WMSRole, nullEmpty(body.BadgeCode),
			nullEmpty(body.CellNumber), nullEmpty(body.CompanyEmail), pinHash).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}

func get(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var r struct {
			ID             int
			EmployeeName   string
			EmployeeNumber *string
			Department     *string
			Designation    *string
			Status         *string
			WarehouseID    *int
			WMSRole        *string
			BadgeCode      *string
			HasPIN         bool
		}
		err = db.QueryRow(c.Context(), `
			SELECT id, employee_name, employee_number, department, designation, status,
			       warehouse_id, wms_role, badge_code, (pin_hash IS NOT NULL)
			FROM employees WHERE id=$1`, id).Scan(
			&r.ID, &r.EmployeeName, &r.EmployeeNumber, &r.Department, &r.Designation,
			&r.Status, &r.WarehouseID, &r.WMSRole, &r.BadgeCode, &r.HasPIN)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "employee not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id": r.ID, "employee_name": r.EmployeeName, "employee_number": r.EmployeeNumber,
			"department": r.Department, "designation": r.Designation, "status": r.Status,
			"warehouse_id": r.WarehouseID, "wms_role": r.WMSRole, "badge_code": r.BadgeCode, "has_pin": r.HasPIN,
		})
	}
}

func update(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			EmployeeName string `json:"employee_name"`
			Department   string `json:"department"`
			Designation  string `json:"designation"`
			WarehouseID  *int   `json:"warehouse_id"`
			WMSRole      string `json:"wms_role"`
			BadgeCode    string `json:"badge_code"`
			Status       string `json:"status"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.WMSRole != "" {
			body.WMSRole = strings.ToLower(strings.TrimSpace(body.WMSRole))
			if ok, err := rbac.RoleExists(db, c, body.WMSRole); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			} else if !ok {
				return shared.Err(c, fiber.StatusBadRequest, "unknown role: "+body.WMSRole)
			}
		}
		_, err = db.Exec(c.Context(), `
			UPDATE employees SET
				employee_name = COALESCE(NULLIF($2,''), employee_name),
				department = COALESCE(NULLIF($3,''), department),
				designation = COALESCE(NULLIF($4,''), designation),
				warehouse_id = COALESCE($5, warehouse_id),
				wms_role = COALESCE(NULLIF($6,''), wms_role),
				badge_code = COALESCE(NULLIF($7,''), badge_code),
				status = COALESCE(NULLIF($8,''), status)
			WHERE id=$1`, id, body.EmployeeName, body.Department, body.Designation,
			body.WarehouseID, body.WMSRole, body.BadgeCode, body.Status)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "updated": true})
	}
}

func assignRole(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			WMSRole string `json:"wms_role"`
			Role    string `json:"role"` // alias
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		code := strings.ToLower(strings.TrimSpace(body.WMSRole))
		if code == "" {
			code = strings.ToLower(strings.TrimSpace(body.Role))
		}
		if code == "" {
			return shared.Err(c, fiber.StatusBadRequest, "wms_role required")
		}
		if ok, err := rbac.RoleExists(db, c, code); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		} else if !ok {
			return shared.Err(c, fiber.StatusBadRequest, "unknown role: "+code)
		}
		ct, err := db.Exec(c.Context(), `UPDATE employees SET wms_role=$2 WHERE id=$1`, id, code)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if ct.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "employee not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "wms_role": code})
	}
}

func setPIN(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			PIN string `json:"pin"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.PIN) < 4 || len(body.PIN) > 8 {
			return shared.Err(c, fiber.StatusBadRequest, "pin must be 4-8 digits")
		}
		h, err := bcrypt.GenerateFromPassword([]byte(body.PIN), bcrypt.DefaultCost)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to hash pin")
		}
		// bump token_version so old JWTs can be invalidated later
		_, err = db.Exec(c.Context(), `
			UPDATE employees SET pin_hash=$2, token_version = COALESCE(token_version,1)+1 WHERE id=$1`, id, string(h))
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "pin_set": true})
	}
}

func nullEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func exportCSV(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT employee_name, COALESCE(employee_number,''), COALESCE(badge_code,''),
			       COALESCE(wms_role,''), COALESCE(department,''), COALESCE(status,'Active'),
			       (pin_hash IS NOT NULL)
			FROM employees WHERE COALESCE(disabled,false)=false ORDER BY employee_name`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		var b strings.Builder
		b.WriteString("employee_name,employee_number,badge_code,wms_role,department,status,has_pin\n")
		for rows.Next() {
			var name, num, badge, role, dept, status string
			var hasPIN bool
			if err := rows.Scan(&name, &num, &badge, &role, &dept, &status, &hasPIN); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			b.WriteString(fmt.Sprintf("%s,%s,%s,%s,%s,%s,%t\n", name, num, badge, role, dept, status, hasPIN))
		}
		c.Set("Content-Type", "text/csv")
		c.Set("Content-Disposition", "attachment; filename=employees.csv")
		return c.SendString(b.String())
	}
}
