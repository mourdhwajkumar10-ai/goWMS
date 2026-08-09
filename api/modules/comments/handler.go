package comments

import (
	"strconv"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the comments routes, namespaced under /comments so the
// two-segment wildcard does not shadow sibling routes like /po/list.
func Register(r fiber.Router, db *pgxpool.Pool) {
	g := r.Group("/comments")
	g.Get("/:entity_type/:entity_id", list(db))
	g.Post("/:entity_type/:entity_id", create(db))
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		entityType := c.Params("entity_type")
		entityID, err := strconv.Atoi(c.Params("entity_id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid entity id")
		}

		rows, err := db.Query(c.Context(), `
			SELECT c.id, c.text, c.created_at::text, u.username as author
			FROM comments c JOIN users u ON u.id = c.user_id
			WHERE c.entity_type=$1 AND c.entity_id=$2 ORDER BY c.created_at ASC`,
			entityType, entityID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type cm struct {
			ID        int    `json:"id"`
			Text      string `json:"text"`
			CreatedAt string `json:"created_at"`
			Author    string `json:"author"`
		}
		var list []cm
		for rows.Next() {
			var m cm
			if err := rows.Scan(&m.ID, &m.Text, &m.CreatedAt, &m.Author); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, m)
		}
		return shared.OK(c, list)
	}
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		entityType := c.Params("entity_type")
		entityID, err := strconv.Atoi(c.Params("entity_id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid entity id")
		}

		var body struct {
			Text string `json:"text"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Text == "" {
			return shared.Err(c, fiber.StatusBadRequest, "text required")
		}

		var id int
		err = db.QueryRow(c.Context(),
			`INSERT INTO comments (entity_type, entity_id, user_id, text) VALUES ($1, $2, $3, $4) RETURNING id`,
			entityType, entityID, userID(c), body.Text).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
