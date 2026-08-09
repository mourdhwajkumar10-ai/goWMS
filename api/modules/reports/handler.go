package reports

import (
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the reports routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/grn-summary", grnSummary(db))
	r.Get("/pick-performance", pickPerformance(db))
}

func grnSummary(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT gs.session_no, gs.supplier_name, gs.status, gs.created_at::text,
			       COUNT(DISTINCT gc.id) AS carton_count,
			       COALESCE(SUM(gl.scanned_qty),0) AS received_qty,
			       COALESCE(SUM(CASE WHEN gl.status='shortage' THEN gl.expected_qty - gl.scanned_qty ELSE 0 END),0) AS shortage_qty
			FROM grn_sessions gs
			LEFT JOIN grn_cartons gc ON gc.grn_session_id = gs.id
			LEFT JOIN grn_lines gl ON gl.grn_carton_id = gc.id
			GROUP BY gs.id ORDER BY gs.created_at DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			SessionNo   string  `json:"session_no"`
			Supplier    *string `json:"supplier_name"`
			Status      string  `json:"status"`
			CreatedAt   string  `json:"created_at"`
			CartonCount int64   `json:"carton_count"`
			ReceivedQty float64 `json:"received_qty"`
			ShortageQty float64 `json:"shortage_qty"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.SessionNo, &r.Supplier, &r.Status, &r.CreatedAt,
				&r.CartonCount, &r.ReceivedQty, &r.ShortageQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func pickPerformance(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT ps.log_no, pl.name AS pick_list, ps.item_code, ps.quantity, ps.location_drift, ps.scanned_at::text
			FROM pick_scan_logs ps
			LEFT JOIN pick_lists pl ON pl.id = ps.pick_list_id
			ORDER BY ps.scanned_at DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			LogNo         string   `json:"log_no"`
			PickList      *string  `json:"pick_list"`
			ItemCode      string   `json:"item_code"`
			Quantity      *float64 `json:"quantity"`
			LocationDrift bool     `json:"location_drift"`
			ScannedAt     *string  `json:"scanned_at"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.LogNo, &r.PickList, &r.ItemCode, &r.Quantity, &r.LocationDrift, &r.ScannedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}
