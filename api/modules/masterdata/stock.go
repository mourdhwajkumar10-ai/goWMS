package masterdata

import (
	"strings"

	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// adjustStock posts qty into a location (used for opening / incoming receive before putaway).
func adjustStock(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			ItemCode   string  `json:"item_code"`
			LocationID int     `json:"location_id"`
			BatchNo    string  `json:"batch_no"`
			Quantity   float64 `json:"quantity"`
			ExpiryDate string  `json:"expiry_date"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.ItemCode = strings.TrimSpace(body.ItemCode)
		if body.ItemCode == "" || body.LocationID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "item_code and location_id required")
		}
		if body.Quantity == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "quantity required")
		}

		var complete bool
		err := db.QueryRow(c.Context(), `
			SELECT COALESCE(master_complete,false) FROM items WHERE code=$1`, body.ItemCode).Scan(&complete)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusConflict, "item not in master — complete item master first")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if !complete {
			return shared.Err(c, fiber.StatusConflict, "item master incomplete")
		}

		var warehouseID int
		err = db.QueryRow(c.Context(), `
			SELECT warehouse_id FROM warehouse_locations WHERE id=$1 AND COALESCE(disabled,false)=false`,
			body.LocationID).Scan(&warehouseID)
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "location not found")
		}

		batch := strings.TrimSpace(body.BatchNo)
		var batchArg any
		if batch == "" {
			batchArg = nil
		} else {
			batchArg = batch
			if body.ExpiryDate != "" {
				_, _ = db.Exec(c.Context(), `
					INSERT INTO batches (batch_id, item_code, expiry_date, batch_qty)
					SELECT $1,$2,$3::date,$4
					WHERE NOT EXISTS (SELECT 1 FROM batches WHERE batch_id=$1 AND item_code=$2)`,
					batch, body.ItemCode, body.ExpiryDate, body.Quantity)
			}
		}

		var existingID int
		qerr := db.QueryRow(c.Context(), `
			SELECT id FROM stock_location_balances
			WHERE item_code=$1 AND location_id=$2 AND COALESCE(batch_no,'')=COALESCE($3,'')`,
			body.ItemCode, body.LocationID, batchArg).Scan(&existingID)
		if qerr == pgx.ErrNoRows {
			_, err = db.Exec(c.Context(), `
				INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, batch_no, actual_qty, reserved_qty)
				VALUES ($1,$2,$3,$4,$5,0)`,
				body.ItemCode, warehouseID, body.LocationID, batchArg, body.Quantity)
		} else if qerr == nil {
			_, err = db.Exec(c.Context(), `
				UPDATE stock_location_balances SET actual_qty = actual_qty + $1, updated_at=now() WHERE id=$2`,
				body.Quantity, existingID)
		} else {
			err = qerr
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		_, _ = db.Exec(c.Context(), `
			UPDATE warehouse_locations SET is_occupied=true, current_item=$2, updated_at=now() WHERE id=$1`,
			body.LocationID, body.ItemCode)

		return shared.OK(c, fiber.Map{
			"item_code": body.ItemCode, "location_id": body.LocationID,
			"warehouse_id": warehouseID, "quantity": body.Quantity,
		})
	}
}

func registerStockRoutes(md fiber.Router, db *pgxpool.Pool) {
	md.Post("/stock/adjust", rbac.RequirePermission("inventory.adjust"), adjustStock(db))
	md.Get("/stock/by-item/:code", itemInventory(db))
}
