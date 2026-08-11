package picking

// Wave picking — batches multiple confirmed SOs into one FEFO pick list.
// Uses the same shared.ListFEFOCandidates + ReserveBalance path as single-order pick.
// Registered via picking.RegisterWave from main.go.

import (
	"fmt"
	"strings"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterWave wires wave-picking endpoints under /picking.
func RegisterWave(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/wave", createWave(db))
	r.Get("/waves", listWaves(db))
}

func createWave(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SalesOrderIDs []int  `json:"sales_order_ids"`
			WarehouseID   int    `json:"warehouse_id"`
			WaveName      string `json:"wave_name"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.SalesOrderIDs) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "sales_order_ids required")
		}
		whID, err := shared.ResolveWarehouseID(c.Context(), db, &body.WarehouseID)
		if err != nil || whID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "warehouse_id required")
		}

		// Aggregate demand across SOs
		type demand struct {
			ItemCode string
			Qty      float64
			SONames  []string
		}
		agg := map[string]*demand{}
		soLabels := []string{}

		for _, soID := range body.SalesOrderIDs {
			var soName, status string
			err := db.QueryRow(c.Context(), `
				SELECT name, COALESCE(wms_status, status, 'draft') FROM sales_orders WHERE id=$1`, soID).
				Scan(&soName, &status)
			if err != nil {
				return shared.Err(c, fiber.StatusBadRequest, fmt.Sprintf("sales order %d not found", soID))
			}
			if strings.EqualFold(status, "draft") || strings.EqualFold(status, "cancelled") {
				return shared.Err(c, fiber.StatusBadRequest, soName+" must be confirmed")
			}
			soLabels = append(soLabels, soName)

			rows, err := db.Query(c.Context(), `
				SELECT item_code, COALESCE(qty,0)-COALESCE(picked_qty,0)
				FROM sales_order_items WHERE sales_order_id=$1 AND COALESCE(qty,0)>COALESCE(picked_qty,0)`, soID)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			for rows.Next() {
				var code string
				var qty float64
				if err := rows.Scan(&code, &qty); err != nil {
					rows.Close()
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				if qty <= 0 {
					continue
				}
				if d, ok := agg[code]; ok {
					d.Qty += qty
					d.SONames = append(d.SONames, soName)
				} else {
					agg[code] = &demand{ItemCode: code, Qty: qty, SONames: []string{soName}}
				}
			}
			rows.Close()
		}

		if len(agg) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "no open lines across selected orders")
		}

		var whName string
		_ = db.QueryRow(c.Context(), `SELECT COALESCE(name,code) FROM warehouses WHERE id=$1`, whID).Scan(&whName)

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		waveLabel := body.WaveName
		if waveLabel == "" {
			waveLabel = "WAVE-" + time.Now().Format("20060102-1504")
		}
		soCSV := strings.Join(soLabels, ",")

		var pickID int
		var pickName string
		err = tx.QueryRow(c.Context(), `
			INSERT INTO pick_lists (name, sales_order_no, customer, warehouse_id, status, picking_mode)
			VALUES ('PL-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_lists_id_seq')::TEXT,5,'0'),
				$1, $2, $3, 'open', 'wave')
			RETURNING id, name`, soCSV, waveLabel, whID).Scan(&pickID, &pickName)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		allocatedAny := false
		for _, d := range agg {
			cands, err := shared.ListFEFOCandidates(c.Context(), tx, whID, d.ItemCode, true)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			remaining := d.Qty
			for _, cand := range cands {
				if remaining <= 0 {
					break
				}
				take := cand.Available
				if take > remaining {
					take = remaining
				}
				if err := shared.ReserveBalance(c.Context(), tx, cand.BalanceID, take); err != nil {
					return shared.Err(c, fiber.StatusConflict, err.Error())
				}
				locID, balID := cand.LocationID, cand.BalanceID
				var batch any
				if cand.BatchNo != "" {
					batch = cand.BatchNo
				}
				var expiry any
				if cand.ExpiryDate != nil {
					expiry = cand.ExpiryDate.Format("2006-01-02")
				}
				_, err = tx.Exec(c.Context(), `
					INSERT INTO pick_list_items (
						pick_list_id, item_code, warehouse, ordered_qty, picked_qty,
						allocated_qty, status, batch_no, location_id, location_code,
						balance_id, expiry_date, shortage_qty
					) VALUES ($1,$2,$3,$4,0,$4,'pending',$5,$6,$7,$8,$9,0)`,
					pickID, d.ItemCode, whName, take, batch, locID, cand.LocationCode, balID, expiry)
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				allocatedAny = true
				remaining -= take
			}
			if remaining > 0 {
				_, _ = tx.Exec(c.Context(), `
					INSERT INTO pick_list_items (
						pick_list_id, item_code, warehouse, ordered_qty, picked_qty,
						allocated_qty, status, shortage_qty
					) VALUES ($1,$2,$3,$4,0,0,'shortage',$4)`, pickID, d.ItemCode, whName, remaining)
			}
		}
		if !allocatedAny {
			return shared.Err(c, fiber.StatusConflict, "insufficient stock for wave")
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		for _, soID := range body.SalesOrderIDs {
			_, _ = db.Exec(c.Context(), `UPDATE sales_orders SET wms_status='picking', updated_at=NOW() WHERE id=$1`, soID)
		}

		return shared.OK(c, fiber.Map{
			"id": pickID, "name": pickName, "wave": waveLabel,
			"sales_orders": soLabels, "picking_mode": "wave",
			"note": "Wave picking — review before enabling in production UI",
		})
	}
}

func listWaves(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, sales_order_no, customer, status, created_at
			FROM pick_lists WHERE picking_mode='wave' ORDER BY id DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type row struct {
			ID         int        `json:"id"`
			Name       string     `json:"name"`
			SalesOrder *string    `json:"sales_order_no"`
			Customer   *string    `json:"customer"`
			Status     *string    `json:"status"`
			CreatedAt  *time.Time `json:"created_at"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ID, &r.Name, &r.SalesOrder, &r.Customer, &r.Status, &r.CreatedAt); err != nil {
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
