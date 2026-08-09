package packing

import (
	"fmt"
	"strconv"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the packing routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/", listBoxes(db))
	r.Post("/", createBox(db))
	r.Post("/:id/item", packItem(db))
	r.Post("/:id/reverse", reverseItem(db))
}

func listBoxes(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT b.id, b.label, b.pick_list_id, b.loaded, b.created_at,
			       COALESCE((SELECT SUM(quantity) FROM box_items bi WHERE bi.box_id = b.id),0) AS total_items
			FROM boxes b ORDER BY b.created_at DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type box struct {
			ID         int       `json:"id"`
			Label      string    `json:"label"`
			PickListID *int      `json:"pick_list_id"`
			Loaded     bool      `json:"loaded"`
			CreatedAt  time.Time `json:"created_at"`
			TotalItems float64   `json:"total_items"`
		}
		var list []box
		for rows.Next() {
			var b box
			if err := rows.Scan(&b.ID, &b.Label, &b.PickListID, &b.Loaded, &b.CreatedAt, &b.TotalItems); err != nil {
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
			Label      string `json:"label"`
			PickListID int    `json:"pick_list_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Label == "" {
			return shared.Err(c, fiber.StatusBadRequest, "label required")
		}

		// pick_list_id is nullable — 0 becomes NULL.
		var pickListID any
		if body.PickListID != 0 {
			pickListID = body.PickListID
		}

		var id int
		err := db.QueryRow(c.Context(),
			`INSERT INTO boxes (label, pick_list_id) VALUES ($1,$2) RETURNING id`,
			body.Label, pickListID).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "label": body.Label})
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

		var id int
		err = db.QueryRow(c.Context(),
			`INSERT INTO box_items (box_id,item_code,quantity,batch_no,scanned_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
			boxID, body.ItemCode, body.Quantity, body.BatchNo, userID(c)).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "box_id": boxID})
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

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}

var _ = fmt.Sprintf
