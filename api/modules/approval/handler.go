package approval

import (
	"strconv"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the approval gates.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/intake/:id", intake(db))
	r.Post("/pre-invoice/:id", preInvoice(db))
}

// intake confirms goods intake for a GRN session (Gate 1).
func intake(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var body struct {
			Backorder bool `json:"create_backorder"`
		}
		_ = shared.Bind(c, &body)

		tag, err := db.Exec(c.Context(),
			`UPDATE grn_sessions SET status='confirmed' WHERE id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "confirmed"})
	}
}

// preInvoice marks a session as ready for invoicing (Gate 2).
func preInvoice(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE grn_sessions SET status='pre_invoice' WHERE id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "pre_invoice"})
	}
}
