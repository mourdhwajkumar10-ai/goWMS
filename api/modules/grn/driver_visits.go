package grn

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterDriverVisits mounts /api/driver-visits for the dock check-in board.
func RegisterDriverVisits(r fiber.Router, db *pgxpool.Pool) {
	// Dock check-in is a desk workflow — same access as viewing receiving.
	manage := rbac.RequirePermission("receiving.view")
	r.Get("/", manage, listDriverVisits(db))
	r.Post("/", manage, createDriverVisit(db))
	r.Get("/:id", manage, getDriverVisit(db))
	r.Patch("/:id", manage, updateDriverVisit(db))
	r.Post("/:id/advance", manage, advanceDriverVisit(db))
	r.Post("/:id/link-grn", manage, linkDriverVisitGRN(db))
}

var driverVisitStatusOrder = []string{
	"planned", "dock", "unloading", "box_verification", "signed_off",
}

func driverVisitStatusRank(status string) int {
	s := strings.ToLower(strings.TrimSpace(status))
	for i, st := range driverVisitStatusOrder {
		if st == s {
			return i
		}
	}
	if s == "cancelled" {
		return 99
	}
	return -1
}

func timestampColumnForStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "dock":
		return "dock_at"
	case "unloading":
		return "unloading_at"
	case "box_verification":
		return "box_verification_at"
	case "signed_off":
		return "signed_off_at"
	default:
		return ""
	}
}

func scanDriverVisitRow(rows pgx.Rows) (fiber.Map, error) {
	var (
		id, warehouseID                                                           int
		truckNo, status                                                           string
		driverName, driverPhone, transporter, dock, poName, supplier, notes, sessNo *string
		poID, grnID, createdBy                                                    *int
		plannedAt                                                                 time.Time
		dockAt, unloadAt, boxAt, signedAt, createdAt, updatedAt                   *time.Time
		grnStatus                                                                 *string
	)
	err := rows.Scan(
		&id, &warehouseID, &truckNo, &driverName, &driverPhone, &transporter, &dock,
		&poID, &poName, &supplier, &grnID, &status,
		&plannedAt, &dockAt, &unloadAt, &boxAt, &signedAt,
		&notes, &createdBy, &createdAt, &updatedAt, &sessNo, &grnStatus,
	)
	if err != nil {
		return nil, err
	}
	timerStart := plannedAt
	if dockAt != nil {
		timerStart = *dockAt
	}
	timerEnd := time.Now()
	done := false
	if signedAt != nil {
		timerEnd = *signedAt
		done = true
	}
	elapsedSec := int(timerEnd.Sub(timerStart).Seconds())
	if elapsedSec < 0 {
		elapsedSec = 0
	}
	out := fiber.Map{
		"id":                   id,
		"warehouse_id":         warehouseID,
		"truck_no":             truckNo,
		"driver_name":          derefStr(driverName),
		"driver_phone":         derefStr(driverPhone),
		"transporter":          derefStr(transporter),
		"dock":                 derefStr(dock),
		"purchase_order_id":    derefInt(poID),
		"purchase_receipt_no":  derefStr(poName),
		"supplier_name":        derefStr(supplier),
		"grn_session_id":       derefInt(grnID),
		"grn_session_no":       derefStr(sessNo),
		"grn_status":           derefStr(grnStatus),
		"status":               status,
		"planned_at":           plannedAt.UTC().Format(time.RFC3339),
		"dock_at":              fmtTime(dockAt),
		"unloading_at":         fmtTime(unloadAt),
		"box_verification_at":  fmtTime(boxAt),
		"signed_off_at":        fmtTime(signedAt),
		"notes":                derefStr(notes),
		"created_by":           derefInt(createdBy),
		"created_at":           fmtTime(createdAt),
		"updated_at":           fmtTime(updatedAt),
		"elapsed_seconds":      elapsedSec,
		"timer_running":        !done && status != "cancelled",
		"status_rank":          driverVisitStatusRank(status),
	}
	return out, nil
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func derefInt(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func fmtTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC().Format(time.RFC3339)
}

const driverVisitSelect = `
	SELECT v.id, COALESCE(v.warehouse_id,0), v.truck_no,
	       NULLIF(v.driver_name,''), NULLIF(v.driver_phone,''), NULLIF(v.transporter,''), NULLIF(v.dock,''),
	       v.purchase_order_id, NULLIF(v.purchase_receipt_no,''), NULLIF(v.supplier_name,''),
	       v.grn_session_id, v.status,
	       v.planned_at, v.dock_at, v.unloading_at, v.box_verification_at, v.signed_off_at,
	       NULLIF(v.notes,''), v.created_by, v.created_at, v.updated_at,
	       gs.session_no, gs.status
	FROM driver_visits v
	LEFT JOIN grn_sessions gs ON gs.id = v.grn_session_id`

func listDriverVisits(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		status := strings.ToLower(strings.TrimSpace(c.Query("status")))
		activeOnly := c.Query("active") == "1" || c.Query("active") == "true"
		q := strings.TrimSpace(c.Query("q"))
		limit, _ := strconv.Atoi(c.Query("limit", "100"))
		if limit < 1 || limit > 500 {
			limit = 100
		}

		sql := driverVisitSelect + ` WHERE 1=1`
		args := []any{}
		n := 1
		if status != "" && status != "all" {
			sql += fmt.Sprintf(` AND v.status=$%d`, n)
			args = append(args, status)
			n++
		} else if activeOnly {
			sql += ` AND v.status NOT IN ('signed_off','cancelled')`
		}
		if q != "" {
			sql += fmt.Sprintf(` AND (
				v.truck_no ILIKE $%d OR COALESCE(v.driver_name,'') ILIKE $%d
				OR COALESCE(v.purchase_receipt_no,'') ILIKE $%d
				OR COALESCE(gs.session_no,'') ILIKE $%d
				OR COALESCE(v.supplier_name,'') ILIKE $%d
			)`, n, n, n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		sql += fmt.Sprintf(` ORDER BY
			CASE v.status
				WHEN 'dock' THEN 0 WHEN 'unloading' THEN 1 WHEN 'box_verification' THEN 2
				WHEN 'planned' THEN 3 WHEN 'signed_off' THEN 4 ELSE 5 END,
			v.planned_at DESC
			LIMIT $%d`, n)
		args = append(args, limit)

		rows, err := db.Query(c.Context(), sql, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		list := []fiber.Map{}
		for rows.Next() {
			row, err := scanDriverVisitRow(rows)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, row)
		}
		return shared.OK(c, list)
	}
}

func getDriverVisit(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		rows, err := db.Query(c.Context(), driverVisitSelect+` WHERE v.id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		if !rows.Next() {
			return shared.Err(c, fiber.StatusNotFound, "visit not found")
		}
		row, err := scanDriverVisitRow(rows)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, row)
	}
}

func createDriverVisit(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			WarehouseID       int    `json:"warehouse_id"`
			TruckNo           string `json:"truck_no"`
			DriverName        string `json:"driver_name"`
			DriverPhone       string `json:"driver_phone"`
			Transporter       string `json:"transporter"`
			Dock              string `json:"dock"`
			PurchaseOrderID   int    `json:"purchase_order_id"`
			PurchaseReceiptNo string `json:"purchase_receipt_no"`
			SupplierName      string `json:"supplier_name"`
			GRNSessionID      int    `json:"grn_session_id"`
			Status            string `json:"status"`
			Notes             string `json:"notes"`
			CheckInNow        bool   `json:"check_in_now"` // start at dock immediately
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		truck := strings.TrimSpace(body.TruckNo)
		if truck == "" {
			return shared.Err(c, fiber.StatusBadRequest, "truck_no is required")
		}
		status := "planned"
		if body.CheckInNow {
			status = "dock"
		}
		if s := strings.ToLower(strings.TrimSpace(body.Status)); s != "" {
			if driverVisitStatusRank(s) < 0 && s != "cancelled" {
				return shared.Err(c, fiber.StatusBadRequest, "invalid status")
			}
			status = s
		}
		wid := body.WarehouseID
		if wid < 1 {
			if w, err := shared.EnsureDefaultWarehouse(c.Context(), db); err == nil {
				wid = w
			}
		}
		poName := strings.TrimSpace(body.PurchaseReceiptNo)
		supplier := strings.TrimSpace(body.SupplierName)
		if body.PurchaseOrderID > 0 {
			if poName == "" {
				_ = db.QueryRow(c.Context(), `SELECT name FROM purchase_orders WHERE id=$1`, body.PurchaseOrderID).Scan(&poName)
			}
			if supplier == "" {
				_ = db.QueryRow(c.Context(), `SELECT COALESCE(supplier_name,'') FROM purchase_orders WHERE id=$1`, body.PurchaseOrderID).Scan(&supplier)
			}
		}

		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO driver_visits (
				warehouse_id, truck_no, driver_name, driver_phone, transporter, dock,
				purchase_order_id, purchase_receipt_no, supplier_name, grn_session_id,
				status, planned_at, dock_at, notes, created_by
			) VALUES (
				NULLIF($1,0)::int, $2::text, NULLIF($3,'')::text, NULLIF($4,'')::text, NULLIF($5,'')::text, NULLIF($6,'')::text,
				NULLIF($7,0)::int, NULLIF($8,'')::text, NULLIF($9,'')::text, NULLIF($10,0)::int,
				$11::text, NOW(),
				CASE WHEN $11::text IN ('dock','unloading','box_verification','signed_off') THEN NOW() ELSE NULL END,
				NULLIF($12,'')::text, NULLIF($13,0)::int
			) RETURNING id`,
			wid, truck, strings.TrimSpace(body.DriverName), strings.TrimSpace(body.DriverPhone),
			strings.TrimSpace(body.Transporter), strings.TrimSpace(body.Dock),
			body.PurchaseOrderID, poName, supplier, body.GRNSessionID,
			status, strings.TrimSpace(body.Notes), userID(c),
		).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		shared.UpsertTransport(c.Context(), db, truck, body.DriverName, body.DriverPhone)
		rows, err := db.Query(c.Context(), driverVisitSelect+` WHERE v.id=$1`, id)
		if err != nil {
			return shared.OK(c, fiber.Map{"id": id, "status": status})
		}
		defer rows.Close()
		if rows.Next() {
			row, _ := scanDriverVisitRow(rows)
			return shared.OK(c, row)
		}
		return shared.OK(c, fiber.Map{"id": id, "status": status})
	}
}

func updateDriverVisit(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			TruckNo           *string `json:"truck_no"`
			DriverName        *string `json:"driver_name"`
			DriverPhone       *string `json:"driver_phone"`
			Transporter       *string `json:"transporter"`
			Dock              *string `json:"dock"`
			PurchaseOrderID   *int    `json:"purchase_order_id"`
			PurchaseReceiptNo *string `json:"purchase_receipt_no"`
			SupplierName      *string `json:"supplier_name"`
			GRNSessionID      *int    `json:"grn_session_id"`
			Notes             *string `json:"notes"`
			WarehouseID       *int    `json:"warehouse_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE driver_visits SET
				truck_no = COALESCE(NULLIF($2,''), truck_no),
				driver_name = COALESCE($3, driver_name),
				driver_phone = COALESCE($4, driver_phone),
				transporter = COALESCE($5, transporter),
				dock = COALESCE($6, dock),
				purchase_order_id = COALESCE($7, purchase_order_id),
				purchase_receipt_no = COALESCE($8, purchase_receipt_no),
				supplier_name = COALESCE($9, supplier_name),
				grn_session_id = COALESCE($10, grn_session_id),
				notes = COALESCE($11, notes),
				warehouse_id = COALESCE($12, warehouse_id),
				updated_at = NOW()
			WHERE id=$1`,
			id,
			ptrStr(body.TruckNo), ptrStr(body.DriverName), ptrStr(body.DriverPhone),
			ptrStr(body.Transporter), ptrStr(body.Dock),
			body.PurchaseOrderID, ptrStr(body.PurchaseReceiptNo), ptrStr(body.SupplierName),
			body.GRNSessionID, ptrStr(body.Notes), body.WarehouseID,
		)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "visit not found")
		}
		return getDriverVisit(db)(c)
	}
}

func ptrStr(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func advanceDriverVisit(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Status string `json:"status"`
			Next   bool   `json:"next"` // advance one step
		}
		_ = shared.Bind(c, &body)

		var cur string
		err = db.QueryRow(c.Context(), `SELECT status FROM driver_visits WHERE id=$1`, id).Scan(&cur)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "visit not found")
		}
		if cur == "cancelled" || cur == "signed_off" {
			return shared.Err(c, fiber.StatusBadRequest, "visit is already "+cur)
		}

		target := strings.ToLower(strings.TrimSpace(body.Status))
		if body.Next || target == "" {
			rank := driverVisitStatusRank(cur)
			if rank < 0 || rank >= len(driverVisitStatusOrder)-1 {
				return shared.Err(c, fiber.StatusBadRequest, "cannot advance from "+cur)
			}
			target = driverVisitStatusOrder[rank+1]
		}
		tr := driverVisitStatusRank(target)
		cr := driverVisitStatusRank(cur)
		if target == "cancelled" {
			_, err = db.Exec(c.Context(), `
				UPDATE driver_visits SET status='cancelled', updated_at=NOW() WHERE id=$1`, id)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			return getDriverVisit(db)(c)
		}
		if tr < 0 {
			return shared.Err(c, fiber.StatusBadRequest, "invalid status")
		}
		if tr < cr {
			return shared.Err(c, fiber.StatusBadRequest, "cannot move status backwards")
		}

		sql := `UPDATE driver_visits SET status=$2, updated_at=NOW()`
		// Fill timestamps for every step from current+1 through target (inclusive).
		for _, st := range driverVisitStatusOrder {
			if driverVisitStatusRank(st) <= cr {
				continue
			}
			if driverVisitStatusRank(st) > tr {
				break
			}
			c2 := timestampColumnForStatus(st)
			if c2 != "" {
				sql += `, ` + c2 + ` = COALESCE(` + c2 + `, NOW())`
			}
		}
		sql += ` WHERE id=$1`
		if _, err = db.Exec(c.Context(), sql, id, target); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return getDriverVisit(db)(c)
	}
}

func linkDriverVisitGRN(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			GRNSessionID int `json:"grn_session_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.GRNSessionID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "grn_session_id required")
		}
		var sessNo, poName, supplier, truck, driver string
		err = db.QueryRow(c.Context(), `
			SELECT session_no, COALESCE(purchase_receipt_no,''), COALESCE(supplier_name,''),
			       COALESCE(truck_no,''), COALESCE(driver_name,'')
			FROM grn_sessions WHERE id=$1`, body.GRNSessionID).
			Scan(&sessNo, &poName, &supplier, &truck, &driver)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "GRN session not found")
		}
		_, err = db.Exec(c.Context(), `
			UPDATE driver_visits SET
				grn_session_id=$2,
				purchase_receipt_no = COALESCE(NULLIF(purchase_receipt_no,''), NULLIF($3,'')),
				supplier_name = COALESCE(NULLIF(supplier_name,''), NULLIF($4,'')),
				truck_no = CASE WHEN truck_no = '' OR truck_no IS NULL THEN COALESCE(NULLIF($5,''), truck_no) ELSE truck_no END,
				driver_name = COALESCE(NULLIF(driver_name,''), NULLIF($6,'')),
				updated_at=NOW()
			WHERE id=$1`, id, body.GRNSessionID, poName, supplier, truck, driver)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		_ = sessNo
		return getDriverVisit(db)(c)
	}
}
