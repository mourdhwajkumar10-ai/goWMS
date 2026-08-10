package notifications

import (
	"strconv"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the notifications routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/", list(db))
	r.Get("/list", list(db))
	r.Post("/", create(db))
	r.Post("/:id/read", markRead(db))
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, type, title, message, is_read, created_at::text
			FROM notifications ORDER BY created_at DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type n struct {
			ID        int     `json:"id"`
			Type      string  `json:"type"`
			Title     string  `json:"title"`
			Message   *string `json:"message"`
			IsRead    bool    `json:"is_read"`
			CreatedAt string  `json:"created_at"`
		}
		var list []n
		for rows.Next() {
			var item n
			if err := rows.Scan(&item.ID, &item.Type, &item.Title, &item.Message, &item.IsRead, &item.CreatedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, item)
		}
		return shared.OK(c, list)
	}
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Type    string `json:"type"`
			Title   string `json:"title"`
			Message string `json:"message"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Title == "" {
			return shared.Err(c, fiber.StatusBadRequest, "title required")
		}
		if body.Type == "" {
			body.Type = "info"
		}

		var id int
		err := db.QueryRow(c.Context(),
			`INSERT INTO notifications (type, title, message) VALUES ($1, $2, $3) RETURNING id`,
			body.Type, body.Title, body.Message).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}

func markRead(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE notifications SET is_read=true WHERE id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "notification not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "is_read": true})
	}
}
