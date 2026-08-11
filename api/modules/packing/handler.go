package packing

import (
	"strconv"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the packing routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/", listBoxes(db))
	r.Get("/sessions", listBoxes(db)) // frontend alias
	r.Post("/", createBox(db))
	r.Get("/:id", getBox(db))
	r.Post("/:id/item", packItem(db))
	r.Post("/:id/reverse", reverseItem(db))
	r.Post("/:id/load", markLoaded(db)) // consume reserved stock
	r.Get("/:id/label", boxLabel(db))
}

func listBoxes(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT b.id, b.label, b.pick_list_id, b.delivery_note, b.loaded, b.created_at,
			       COALESCE(b.stock_consumed,false),
			       COALESCE((SELECT SUM(quantity) FROM box_items bi WHERE bi.box_id = b.id),0) AS total_items
			FROM boxes b ORDER BY b.created_at DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type box struct {
			ID            int       `json:"id"`
			Label         string    `json:"label"`
			PickListID    *int      `json:"pick_list_id"`
			DeliveryNote  *string   `json:"delivery_note"`
			Loaded        bool      `json:"loaded"`
			CreatedAt     time.Time `json:"created_at"`
			StockConsumed bool      `json:"stock_consumed"`
			TotalItems    float64   `json:"total_items"`
		}
		var list []box
		for rows.Next() {
			var b box
			if err := rows.Scan(&b.ID, &b.Label, &b.PickListID, &b.DeliveryNote, &b.Loaded, &b.CreatedAt,
				&b.StockConsumed, &b.TotalItems); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, b)
		}
		return shared.OK(c, list)
	}
}

func createBox(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Label        string `json:"label"`
			PickListID   int    `json:"pick_list_id"`
			DeliveryNote string `json:"delivery_note"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Label == "" {
			return shared.Err(c, fiber.StatusBadRequest, "label required")
		}

		var pickListID any
		if body.PickListID != 0 {
			pickListID = body.PickListID
		}
		var dn any
		if body.DeliveryNote != "" {
			dn = body.DeliveryNote
		}

		var id int
		err := db.QueryRow(c.Context(),
			`INSERT INTO boxes (label, pick_list_id, delivery_note) VALUES ($1,$2,$3) RETURNING id`,
			body.Label, pickListID, dn).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "label": body.Label})
	}
}

func getBox(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		boxID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid box id")
		}
		var (
			label         string
			pickListID    *int
			deliveryNote  *string
			loaded        bool
			stockConsumed bool
			createdAt     time.Time
		)
		err = db.QueryRow(c.Context(), `
			SELECT label, pick_list_id, delivery_note, COALESCE(loaded,false),
			       COALESCE(stock_consumed,false), created_at
			FROM boxes WHERE id=$1`, boxID).
			Scan(&label, &pickListID, &deliveryNote, &loaded, &stockConsumed, &createdAt)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "box not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		rows, err := db.Query(c.Context(), `
			SELECT id, item_code, COALESCE(quantity,0), batch_no
			FROM box_items WHERE box_id=$1 ORDER BY id`, boxID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type item struct {
			ID       int     `json:"id"`
			ItemCode string  `json:"item_code"`
			Quantity float64 `json:"quantity"`
			BatchNo  *string `json:"batch_no"`
		}
		var items []item
		for rows.Next() {
			var it item
			if err := rows.Scan(&it.ID, &it.ItemCode, &it.Quantity, &it.BatchNo); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			items = append(items, it)
		}

		return shared.OK(c, fiber.Map{
			"id": boxID, "label": label, "pick_list_id": pickListID,
			"delivery_note": deliveryNote, "loaded": loaded,
			"stock_consumed": stockConsumed, "created_at": createdAt, "items": items,
		})
	}
}

func packItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		boxID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid box id")
		}

		var body struct {
			ItemCode string  `json:"item_code"`
			Quantity float64 `json:"quantity"`
			BatchNo  string  `json:"batch_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" || body.Quantity <= 0 {
			return shared.Err(c, fiber.StatusBadRequest, "item_code and quantity > 0 required")
		}

		var exists bool
		_ = db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM items WHERE upper(code)=upper($1))`, body.ItemCode).Scan(&exists)
		if !exists {
			return shared.Err(c, fiber.StatusBadRequest, "item not found: "+body.ItemCode)
		}

		var batch any
		if body.BatchNo != "" {
			batch = body.BatchNo
		}

		// Soft weight validation from item master
		var unitWeight float64
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(weight_per_unit,0) FROM items WHERE code=$1`, body.ItemCode).Scan(&unitWeight)
		addWeight := unitWeight * body.Quantity

		var maxWeight *float64
		var declared float64
		_ = db.QueryRow(c.Context(), `
			SELECT max_weight, COALESCE(declared_weight,0) FROM boxes WHERE id=$1`, boxID).
			Scan(&maxWeight, &declared)
		newTotal := declared + addWeight
		var warning string
		if maxWeight != nil && *maxWeight > 0 && newTotal > *maxWeight {
			warning = "box weight would exceed max_weight (" +
				strconv.FormatFloat(newTotal, 'f', 2, 64) + " > " +
				strconv.FormatFloat(*maxWeight, 'f', 2, 64) + ")"
		}

		var id int
		err = db.QueryRow(c.Context(),
			`INSERT INTO box_items (box_id,item_code,quantity,batch_no,scanned_by,scanned_at)
			 VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id`,
			boxID, body.ItemCode, body.Quantity, batch, userID(c)).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if addWeight > 0 {
			_, _ = db.Exec(c.Context(), `
				UPDATE boxes SET declared_weight = COALESCE(declared_weight,0) + $1 WHERE id=$2`, addWeight, boxID)
		}
		resp := fiber.Map{"id": id, "box_id": boxID, "declared_weight": newTotal}
		if warning != "" {
			resp["warning"] = warning
			resp["weight_ok"] = false
		} else {
			resp["weight_ok"] = true
		}
		return shared.OK(c, resp)
	}
}

func reverseItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		boxID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid box id")
		}

		var body struct {
			ItemCode string  `json:"item_code"`
			Quantity float64 `json:"quantity"`
			Reason   string  `json:"reason"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" || body.Quantity <= 0 {
			return shared.Err(c, fiber.StatusBadRequest, "item_code and quantity > 0 required")
		}

		var itemID int
		err = db.QueryRow(c.Context(),
			`SELECT id FROM box_items WHERE box_id=$1 AND item_code=$2 ORDER BY id DESC LIMIT 1`,
			boxID, body.ItemCode).Scan(&itemID)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "box item not found")
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE box_items SET quantity=quantity-$1 WHERE id=$2 AND quantity>=$1`,
			body.Quantity, itemID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "insufficient quantity in box")
		}

		if _, err := db.Exec(c.Context(),
			`INSERT INTO pack_reversals (box_id, box_item_id, item_code, qty_removed, reason, reversed_by)
			 VALUES ($1,$2,$3,$4,$5,$6)`,
			boxID, itemID, body.ItemCode, body.Quantity, body.Reason, userID(c)); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, fiber.Map{"box_id": boxID, "qty_removed": body.Quantity})
	}
}

func markLoaded(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		boxID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid box id")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var pickListID *int
		var stockConsumed bool
		err = tx.QueryRow(c.Context(), `
			SELECT pick_list_id, COALESCE(stock_consumed,false) FROM boxes WHERE id=$1 FOR UPDATE`, boxID).
			Scan(&pickListID, &stockConsumed)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "box not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if !stockConsumed && pickListID != nil && *pickListID > 0 {
			var plConsumed bool
			_ = tx.QueryRow(c.Context(), `
				SELECT COALESCE(stock_consumed,false) FROM pick_lists WHERE id=$1 FOR UPDATE`, *pickListID).
				Scan(&plConsumed)
			if !plConsumed {
				if err := shared.ConsumePickListStock(c.Context(), tx, *pickListID); err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
			}
			_, _ = tx.Exec(c.Context(), `UPDATE boxes SET stock_consumed=true WHERE id=$1`, boxID)
		} else if !stockConsumed {
			_, _ = tx.Exec(c.Context(), `UPDATE boxes SET stock_consumed=true WHERE id=$1`, boxID)
		}

		if _, err := tx.Exec(c.Context(),
			`UPDATE boxes SET loaded=true, loaded_at=NOW() WHERE id=$1`, boxID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"box_id": boxID, "loaded": true, "stock_consumed": true})
	}
}

// boxLabel returns printable packing label payload (ZPL-ready fields + HTML snippet).
func boxLabel(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var label string
		var pickListID *int
		var dn *string
		err = db.QueryRow(c.Context(), `
			SELECT label, pick_list_id, delivery_note FROM boxes WHERE id=$1`, id).
			Scan(&label, &pickListID, &dn)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "box not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		rows, err := db.Query(c.Context(), `
			SELECT item_code, quantity, COALESCE(batch_no,'') FROM box_items WHERE box_id=$1 ORDER BY id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type line struct {
			ItemCode string  `json:"item_code"`
			Qty      float64 `json:"quantity"`
			BatchNo  string  `json:"batch_no"`
		}
		var items []line
		for rows.Next() {
			var l line
			if err := rows.Scan(&l.ItemCode, &l.Qty, &l.BatchNo); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			items = append(items, l)
		}
		if items == nil {
			items = []line{}
		}

		dnStr := ""
		if dn != nil {
			dnStr = *dn
		}
		html := "<div style='font-family:monospace;padding:12px;border:2px solid #000'>" +
			"<h2>BOX " + label + "</h2>" +
			"<p>DN: " + dnStr + "</p><ul>"
		for _, it := range items {
			html += "<li>" + it.ItemCode + " × " + strconv.FormatFloat(it.Qty, 'f', -1, 64) + "</li>"
		}
		html += "</ul></div>"

		return shared.OK(c, fiber.Map{
			"box_id": id, "label": label, "pick_list_id": pickListID,
			"delivery_note": dn, "items": items, "html": html,
			"zpl": "^XA^FO50,50^A0N,40,40^FD" + label + "^FS^XZ",
		})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
