package employee

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"

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
	r.Post("/import", rbac.RequireEmployeesManage, importCSV(db))
	r.Get("/next-id", nextID(db))
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

func nextID(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		first := c.Query("first")
		last := c.Query("last")
		if first == "" && last == "" {
			return shared.Err(c, fiber.StatusBadRequest, "first or last required")
		}
		id, err := generateEmployeeNumber(db, c, first, last)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"employee_number": id, "prefix": namePrefix(first, last)})
	}
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			EmployeeName   string `json:"employee_name"`
			FirstName      string `json:"first_name"`
			LastName       string `json:"last_name"`
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

		first := strings.TrimSpace(body.FirstName)
		last := strings.TrimSpace(body.LastName)
		name := strings.TrimSpace(body.EmployeeName)
		if name == "" {
			name = strings.TrimSpace(first + " " + last)
		}
		if name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "first_name and last_name (or employee_name) required")
		}
		if first == "" && last == "" {
			parts := strings.Fields(name)
			if len(parts) >= 1 {
				first = parts[0]
			}
			if len(parts) >= 2 {
				last = parts[len(parts)-1]
			}
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
			return shared.Err(c, fiber.StatusBadRequest, "unknown role: "+body.WMSRole+" (seed roles first)")
		}

		empNo := strings.TrimSpace(body.EmployeeNumber)
		if empNo == "" {
			generated, err := generateEmployeeNumber(db, c, first, last)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			empNo = generated
		} else {
			var taken bool
			_ = db.QueryRow(c.Context(), `
				SELECT EXISTS(SELECT 1 FROM employees WHERE upper(employee_number)=upper($1))`, empNo).Scan(&taken)
			if taken {
				return shared.Err(c, fiber.StatusConflict, "employee_number already exists")
			}
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
			name, body.Company, empNo, nullEmpty(body.Department),
			nullEmpty(body.Designation), body.WarehouseID, body.WMSRole, nullEmpty(body.BadgeCode),
			nullEmpty(body.CellNumber), nullEmpty(body.CompanyEmail), pinHash).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "employee_number": empNo, "employee_name": name})
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
			Role    string `json:"role"`
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

var nonLetter = regexp.MustCompile(`[^A-Za-z]+`)

func lettersOnly(s string) string {
	s = nonLetter.ReplaceAllString(s, "")
	var b strings.Builder
	for _, r := range strings.ToUpper(s) {
		if unicode.IsLetter(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func pad4(s string) string {
	s = lettersOnly(s)
	if len(s) >= 4 {
		return s[:4]
	}
	for len(s) < 4 {
		s += "X"
	}
	return s
}

func namePrefix(first, last string) string {
	return pad4(first) + pad4(last)
}

func generateEmployeeNumber(db *pgxpool.Pool, c *fiber.Ctx, first, last string) (string, error) {
	prefix := namePrefix(first, last)
	if prefix == "XXXXXXXX" {
		return "", fmt.Errorf("could not derive employee id from name")
	}
	for n := 1; n <= 99; n++ {
		candidate := fmt.Sprintf("%s%02d", prefix, n)
		var taken bool
		err := db.QueryRow(c.Context(), `
			SELECT EXISTS(SELECT 1 FROM employees WHERE upper(employee_number)=upper($1))`, candidate).Scan(&taken)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("no free employee_number for prefix %s", prefix)
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

func importCSV(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Rows []map[string]string `json:"rows"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.Rows) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "rows required")
		}
		created, skipped, errors := 0, 0, []string{}
		for i, row := range body.Rows {
			name := firstEmp(row, "employee_name", "name", "Name")
			first := firstEmp(row, "first_name", "first", "First Name")
			last := firstEmp(row, "last_name", "last", "Last Name")
			if name == "" {
				name = strings.TrimSpace(first + " " + last)
			}
			if name == "" {
				skipped++
				errors = append(errors, "row "+strconv.Itoa(i+2)+": name required")
				continue
			}
			parts := strings.Fields(name)
			if first == "" && len(parts) > 0 {
				first = parts[0]
			}
			if last == "" && len(parts) > 1 {
				last = parts[len(parts)-1]
			}
			role := firstEmp(row, "wms_role", "role", "Role")
			if role == "" {
				role = "picker"
			}
			empNo := firstEmp(row, "employee_number", "emp_id", "Employee Number")
			badge := firstEmp(row, "badge_code", "badge", "Badge")
			dept := firstEmp(row, "department", "Department")
			pin := firstEmp(row, "pin", "PIN")
			whID, _ := strconv.Atoi(firstEmp(row, "warehouse_id", "Warehouse ID"))

			if empNo == "" {
				generated, err := generateEmployeeNumber(db, c, first, last)
				if err != nil {
					errors = append(errors, name+": "+err.Error())
					continue
				}
				empNo = generated
			} else {
				var taken bool
				_ = db.QueryRow(c.Context(), `
					SELECT EXISTS(SELECT 1 FROM employees WHERE upper(employee_number)=upper($1))`, empNo).Scan(&taken)
				if taken {
					skipped++
					continue
				}
			}

			var pinHash any
			if pin != "" {
				h, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
				if err == nil {
					pinHash = string(h)
				}
			}
			var wh any
			if whID > 0 {
				wh = whID
			}
			_, err := db.Exec(c.Context(), `
				INSERT INTO employees (
					employee_name, employee_number, department, warehouse_id, wms_role,
					badge_code, pin_hash, status
				) VALUES ($1,$2,$3,$4,$5,$6,$7,'Active')`,
				name, empNo, nullEmpty(dept), wh, role, nullEmpty(badge), pinHash)
			if err != nil {
				errors = append(errors, name+": "+err.Error())
				continue
			}
			created++
		}
		return shared.OK(c, fiber.Map{
			"created": created, "skipped": skipped, "errors": errors, "total": len(body.Rows),
		})
	}
}

func firstEmp(row map[string]string, keys ...string) string {
	for _, k := range keys {
		if v, ok := row[k]; ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
		for rk, rv := range row {
			if strings.EqualFold(rk, k) && strings.TrimSpace(rv) != "" {
				return strings.TrimSpace(rv)
			}
		}
	}
	return ""
}
