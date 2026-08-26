package picking

// Wave picking — batches multiple confirmed SOs into one FEFO pick list.
// Writes wave_order_lines with priority-attributed shares for put-to-order.

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"goWMS/api/modules/fulfillment"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterWave wires wave-picking endpoints under /picking.
func RegisterWave(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/wave", createWave(db))
	r.Post("/generate-wave", createWave(db)) // docs/QA alias
	r.Get("/waves", listWaves(db))
}

func createWave(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SalesOrderIDs []int  `json:"sales_order_ids"`
			WarehouseID   int    `json:"warehouse_id"`
			WaveName      string `json:"wave_name"`
			Sort          string `json:"sort"` // location | item
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
		sortBy := strings.ToLower(strings.TrimSpace(body.Sort))
		if sortBy != "item" {
			sortBy = "location"
		}

		type soDemand struct {
			SalesOrderID     int
			SalesOrderItemID int
			SOName           string
			Customer         string
			Priority         int
			ItemCode         string
			Qty              float64
		}
		var demands []soDemand
		soLabels := []string{}
		seenSO := map[int]bool{}

		for _, soID := range body.SalesOrderIDs {
			var soName, customer, status string
			var priority int
			err := db.QueryRow(c.Context(), `
				SELECT name, COALESCE(customer_name,''), COALESCE(wms_status, status, 'draft'),
				       COALESCE(priority, 99)
				FROM sales_orders WHERE id=$1`, soID).
				Scan(&soName, &customer, &status, &priority)
			if err != nil {
				return shared.Err(c, fiber.StatusBadRequest, fmt.Sprintf("sales order %d not found", soID))
			}
			if strings.EqualFold(status, "draft") || strings.EqualFold(status, "cancelled") {
				return shared.Err(c, fiber.StatusBadRequest, soName+" must be confirmed")
			}
			if !seenSO[soID] {
				soLabels = append(soLabels, soName)
				seenSO[soID] = true
			}

			rows, err := db.Query(c.Context(), `
				SELECT soi.id, soi.item_code,
				       COALESCE(soi.qty,0) - COALESCE(soi.picked_qty,0)
				     - COALESCE((SELECT SUM(GREATEST(
				           COALESCE(pli.allocated_qty,0) - COALESCE(pli.picked_qty,0)
				         - COALESCE(pli.consumed_qty,0), 0))
				       FROM pick_list_items pli
				       JOIN pick_lists pl ON pl.id = pli.pick_list_id
				       WHERE pl.sales_order_no = $2
				         AND pl.status IN ('draft','open')
				         AND pli.item_code = soi.item_code), 0) AS open_qty
				FROM sales_order_items soi
				WHERE soi.sales_order_id = $1`, soID, soName)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			for rows.Next() {
				var itemID int
				var code string
				var qty float64
				if err := rows.Scan(&itemID, &code, &qty); err != nil {
					rows.Close()
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				if qty <= 0 {
					continue
				}
				demands = append(demands, soDemand{
					SalesOrderID: soID, SalesOrderItemID: itemID, SOName: soName,
					Customer: customer, Priority: priority, ItemCode: code, Qty: qty,
				})
			}
			rows.Close()
		}

		if len(demands) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "no open lines across selected orders")
		}

		type aggDemand struct {
			ItemCode string
			Qty      float64
			Shares   []soDemand
		}
		agg := map[string]*aggDemand{}
		for _, d := range demands {
			if a, ok := agg[d.ItemCode]; ok {
				a.Qty += d.Qty
				a.Shares = append(a.Shares, d)
			} else {
				agg[d.ItemCode] = &aggDemand{ItemCode: d.ItemCode, Qty: d.Qty, Shares: []soDemand{d}}
			}
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
		packLocID, err := fulfillment.ResolvePackingLocationID(c.Context(), tx, whID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "packing location: "+err.Error())
		}
		err = tx.QueryRow(c.Context(), `
			INSERT INTO pick_lists (name, sales_order_no, customer, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
			VALUES ('PL-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_lists_id_seq')::TEXT,5,'0'),
				$1, $2, $3, 'open', 'wave', 'wave', $4)
			RETURNING id, name`, soCSV, waveLabel, whID, packLocID).Scan(&pickID, &pickName)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		allocatedAny := false
		type boGroup struct {
			SOName, Customer string
			Lines            []shared.ShortageLine
		}
		boBySO := map[int]*boGroup{}

		for _, d := range agg {
			cands, err := shared.ListFEFOCandidates(c.Context(), tx, whID, d.ItemCode, true)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			remaining := d.Qty
			allocated := 0.0
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
				allocated += take
				remaining -= take
			}

			// Attribute allocated qty to orders by priority (lower = higher priority).
			shares := append([]soDemand(nil), d.Shares...)
			sort.SliceStable(shares, func(i, j int) bool {
				if shares[i].Priority != shares[j].Priority {
					return shares[i].Priority < shares[j].Priority
				}
				return shares[i].SalesOrderID < shares[j].SalesOrderID
			})
			left := allocated
			for _, sh := range shares {
				take := sh.Qty
				if take > left {
					take = left
				}
				short := sh.Qty - take
				if take > 0 {
					_, err = tx.Exec(c.Context(), `
						INSERT INTO wave_order_lines
						  (pick_list_id, sales_order_id, sales_order_item_id, item_code, required_qty, consolidated_qty)
						VALUES ($1,$2,$3,$4,$5,0)`,
						pickID, sh.SalesOrderID, sh.SalesOrderItemID, sh.ItemCode, take)
					if err != nil {
						return shared.Err(c, fiber.StatusInternalServerError, err.Error())
					}
					left -= take
				}
				if short > 0.0001 {
					g := boBySO[sh.SalesOrderID]
					if g == nil {
						g = &boGroup{SOName: sh.SOName, Customer: sh.Customer}
						boBySO[sh.SalesOrderID] = g
					}
					g.Lines = append(g.Lines, shared.ShortageLine{ItemCode: sh.ItemCode, Qty: short})
				}
			}
			if remaining > 0.0001 {
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

		for _, g := range boBySO {
			if _, _, err := shared.CreateBackorderFromShortages(
				c.Context(), tx, pickID, g.SOName, g.Customer, whName, g.Lines); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, "backorder: "+err.Error())
			}
		}

		// Persist preferred walk sort as a comment on the list name prefix when item-sorted.
		if sortBy == "item" {
			_, _ = tx.Exec(c.Context(), `
				UPDATE pick_lists SET customer = COALESCE(customer,'') || CASE
				  WHEN COALESCE(customer,'') LIKE '%[sort:item]%' THEN '' ELSE ' [sort:item]' END
				WHERE id=$1`, pickID)
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
			"fulfillment_type": "wave", "sort": sortBy,
			"pick_list_id": pickID,
		})
	}
}

func listWaves(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, sales_order_no, customer, status, created_at,
			       COALESCE(fulfillment_type,'')
			FROM pick_lists WHERE picking_mode='wave' ORDER BY id DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type row struct {
			ID              int        `json:"id"`
			Name            string     `json:"name"`
			SalesOrder      *string    `json:"sales_order_no"`
			Customer        *string    `json:"customer"`
			Status          *string    `json:"status"`
			CreatedAt       *time.Time `json:"created_at"`
			FulfillmentType string     `json:"fulfillment_type"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ID, &r.Name, &r.SalesOrder, &r.Customer, &r.Status, &r.CreatedAt, &r.FulfillmentType); err != nil {
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
