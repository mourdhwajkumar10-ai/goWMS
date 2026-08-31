package inventory

import (
	"fmt"
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// listBalances returns paginated stock_location_balances for warehouse browsing.
// Query: warehouse_id, item_code, location, page, limit, include_zero
func listBalances(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		warehouseID, _ := strconv.Atoi(c.Query("warehouse_id"))
		itemCode := strings.TrimSpace(c.Query("item_code"))
		location := strings.TrimSpace(c.Query("location"))
		includeZero := c.Query("include_zero") == "1" || strings.EqualFold(c.Query("include_zero"), "true")

		page, _ := strconv.Atoi(c.Query("page", "1"))
		if page < 1 {
			page = 1
		}
		limit, _ := strconv.Atoi(c.Query("limit", "50"))
		if limit < 1 {
			limit = 50
		}
		if limit > 200 {
			limit = 200
		}
		offset := (page - 1) * limit

		where := []string{"1=1"}
		args := []any{}
		argN := 1

		if warehouseID > 0 {
			where = append(where, fmt.Sprintf("slb.warehouse_id = $%d", argN))
			args = append(args, warehouseID)
			argN++
		}
		if itemCode != "" {
			where = append(where, fmt.Sprintf("UPPER(slb.item_code) LIKE UPPER($%d)", argN))
			args = append(args, "%"+itemCode+"%")
			argN++
		}
		if location != "" {
			where = append(where, fmt.Sprintf("UPPER(wl.code) LIKE UPPER($%d)", argN))
			args = append(args, "%"+location+"%")
			argN++
		}
		if !includeZero {
			where = append(where, "slb.actual_qty <> 0")
		}

		whereSQL := strings.Join(where, " AND ")

		var total int
		countSQL := `
			SELECT COUNT(*)
			FROM stock_location_balances slb
			JOIN warehouse_locations wl ON wl.id = slb.location_id
			WHERE ` + whereSQL
		if err := db.QueryRow(c.Context(), countSQL, args...).Scan(&total); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		type summary struct {
			TotalQty      float64 `json:"total_qty"`
			AvailableQty  float64 `json:"available_qty"`
			ReservedQty   float64 `json:"reserved_qty"`
			SKUCount      int     `json:"sku_count"`
			LocationCount int     `json:"location_count"`
		}
		var sum summary
		sumSQL := `
			SELECT
			  COALESCE(SUM(slb.actual_qty),0),
			  COALESCE(SUM(slb.actual_qty - slb.reserved_qty),0),
			  COALESCE(SUM(slb.reserved_qty),0),
			  COUNT(DISTINCT slb.item_code),
			  COUNT(DISTINCT slb.location_id)
			FROM stock_location_balances slb
			JOIN warehouse_locations wl ON wl.id = slb.location_id
			WHERE ` + whereSQL
		_ = db.QueryRow(c.Context(), sumSQL, args...).Scan(
			&sum.TotalQty, &sum.AvailableQty, &sum.ReservedQty, &sum.SKUCount, &sum.LocationCount)

		listArgs := append(append([]any{}, args...), limit, offset)
		limitPh := fmt.Sprintf("$%d", argN)
		offsetPh := fmt.Sprintf("$%d", argN+1)

		rows, err := db.Query(c.Context(), `
			SELECT slb.id, slb.item_code, COALESCE(i.name,''),
			       slb.warehouse_id, w.code, w.name,
			       slb.location_id, wl.code,
			       COALESCE(wl.aisle,''), COALESCE(wl.shelf, COALESCE(wl.rack,'')),
			       COALESCE(wl.level,''), COALESCE(wl.location_type,'storage'),
			       COALESCE(slb.batch_no,''),
			       b.expiry_date::text,
			       slb.actual_qty, COALESCE(slb.reserved_qty,0),
			       (slb.actual_qty - COALESCE(slb.reserved_qty,0)) AS available_qty,
			       CASE
			         WHEN COALESCE(slb.allocation_status,'') = 'unallocatable'
			              OR wl.location_type IN ('incoming','hold','damaged','staging')
			           THEN 'unallocatable'
			         WHEN COALESCE(slb.reserved_qty,0) <= 0 THEN 'available'
			         WHEN COALESCE(slb.reserved_qty,0) >= slb.actual_qty THEN 'fully_allocated'
			         ELSE 'partial'
			       END AS allocation_status
			FROM stock_location_balances slb
			JOIN warehouses w ON w.id = slb.warehouse_id
			JOIN warehouse_locations wl ON wl.id = slb.location_id
			LEFT JOIN items i ON i.code = slb.item_code
			LEFT JOIN LATERAL (
				SELECT expiry_date FROM batches
				WHERE item_code = slb.item_code AND batch_id = slb.batch_no
				ORDER BY id DESC LIMIT 1
			) b ON true
			WHERE `+whereSQL+`
			ORDER BY w.code, wl.code, slb.item_code, slb.batch_no
			LIMIT `+limitPh+` OFFSET `+offsetPh, listArgs...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			ID               int      `json:"id"`
			ItemCode         string   `json:"item_code"`
			ItemName         string   `json:"item_name"`
			WarehouseID      int      `json:"warehouse_id"`
			WarehouseCode    string   `json:"warehouse_code"`
			WarehouseName    string   `json:"warehouse_name"`
			LocationID       int      `json:"location_id"`
			LocationCode     string   `json:"location_code"`
			Aisle            string   `json:"aisle"`
			Shelf            string   `json:"shelf"`
			Level            string   `json:"level"`
			LocationType     string   `json:"location_type"`
			BatchNo          string   `json:"batch_no"`
			ExpiryDate       *string  `json:"expiry_date"`
			ActualQty        float64  `json:"actual_qty"`
			ReservedQty      float64  `json:"reserved_qty"`
			AvailableQty     float64  `json:"available_qty"`
			AllocationStatus string   `json:"allocation_status"`
		}

		out := make([]row, 0)
		for rows.Next() {
			var r row
			var expiry *string
			if err := rows.Scan(
				&r.ID, &r.ItemCode, &r.ItemName,
				&r.WarehouseID, &r.WarehouseCode, &r.WarehouseName,
				&r.LocationID, &r.LocationCode,
				&r.Aisle, &r.Shelf, &r.Level, &r.LocationType,
				&r.BatchNo, &expiry,
				&r.ActualQty, &r.ReservedQty, &r.AvailableQty, &r.AllocationStatus,
			); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			r.ExpiryDate = expiry
			out = append(out, r)
		}

		totalPages := 0
		if total > 0 {
			totalPages = (total + limit - 1) / limit
		}

		return shared.OK(c, fiber.Map{
			"data": out,
			"summary": sum,
			"pagination": fiber.Map{
				"page":        page,
				"limit":       limit,
				"total":       total,
				"total_pages": totalPages,
			},
		})
	}
}
