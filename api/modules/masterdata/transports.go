package masterdata

import (
	"strconv"
	"strings"

	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerTransportRoutes(md fiber.Router, db *pgxpool.Pool) {
	manage := rbac.RequirePermission("masterdata.manage")
	md.Get("/transports", listTransports(db))
	md.Post("/transports", manage, createTransport(db))
	md.Put("/transports/:id", manage, updateTransport(db))
}

type transportBody struct {
	TruckNo     string `json:"truck_no"`
	Name        string `json:"name"`
	Transporter string `json:"transporter"`
	DriverName  string `json:"driver_name"`
	DriverPhone string `json:"driver_phone"`
	Notes       string `json:"notes"`
	Disabled    *bool  `json:"disabled"`
}

func listTransports(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		q := strings.TrimSpace(c.Query("q"))
		sql := `
			SELECT id, truck_no, COALESCE(name,''), COALESCE(transporter,''),
			       COALESCE(driver_name,''), COALESCE(driver_phone,''), COALESCE(notes,''), disabled
			FROM transports
			WHERE disabled=false`
		args := []any{}
		if q != "" {
			sql += ` AND (
				truck_no ILIKE $1 OR COALESCE(name,'') ILIKE $1 OR COALESCE(transporter,'') ILIKE $1
				OR COALESCE(driver_name,'') ILIKE $1 OR COALESCE(driver_phone,'') ILIKE $1
			)`
			args = append(args, "%"+q+"%")
		}
		sql += ` ORDER BY updated_at DESC, id DESC LIMIT 50`
		rows, err := db.Query(c.Context(), sql, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		list := []fiber.Map{}
		for rows.Next() {
			var id int
			var truckNo, name, transporter, driver, phone, notes string
			var disabled bool
			if err := rows.Scan(&id, &truckNo, &name, &transporter, &driver, &phone, &notes, &disabled); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, fiber.Map{
				"id": id, "truck_no": truckNo, "name": name, "transporter": transporter,
				"driver_name": driver, "driver_phone": phone, "notes": notes, "disabled": disabled,
			})
		}
		return shared.OK(c, list)
	}
}

func createTransport(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body transportBody
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		truckNo := strings.TrimSpace(body.TruckNo)
		if truckNo == "" {
			return shared.Err(c, fiber.StatusBadRequest, "truck_no required")
		}
		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO transports (truck_no, name, transporter, driver_name, driver_phone, notes)
			VALUES ($1,$2,$3,$4,$5,$6)
			ON CONFLICT ((lower(btrim(truck_no)))) DO UPDATE SET
				name = COALESCE(NULLIF(EXCLUDED.name,''), transports.name),
				transporter = COALESCE(NULLIF(EXCLUDED.transporter,''), transports.transporter),
				driver_name = COALESCE(NULLIF(EXCLUDED.driver_name,''), transports.driver_name),
				driver_phone = COALESCE(NULLIF(EXCLUDED.driver_phone,''), transports.driver_phone),
				notes = COALESCE(NULLIF(EXCLUDED.notes,''), transports.notes),
				updated_at = now()
			RETURNING id`,
			truckNo, nullIfEmpty(body.Name), nullIfEmpty(body.Transporter),
			nullIfEmpty(body.DriverName), nullIfEmpty(body.DriverPhone), nullIfEmpty(body.Notes),
		).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id": id, "truck_no": truckNo, "name": body.Name, "transporter": body.Transporter,
			"driver_name": body.DriverName, "driver_phone": body.DriverPhone,
		})
	}
}

func updateTransport(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body transportBody
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		truckNo := strings.TrimSpace(body.TruckNo)
		if truckNo == "" {
			return shared.Err(c, fiber.StatusBadRequest, "truck_no required")
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE transports SET
				truck_no=$2, name=$3, transporter=$4, driver_name=$5, driver_phone=$6, notes=$7,
				disabled=COALESCE($8, disabled), updated_at=now()
			WHERE id=$1`,
			id, truckNo, nullIfEmpty(body.Name), nullIfEmpty(body.Transporter),
			nullIfEmpty(body.DriverName), nullIfEmpty(body.DriverPhone), nullIfEmpty(body.Notes), body.Disabled)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "transport not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "updated": true})
	}
}
