package attachments

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

const uploadDir = "uploads"

// Register wires the attachments routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", upload(db))
	r.Get("/:id", download(db))
	r.Get("/:id/meta", meta(db))
}

func upload(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		file, err := c.FormFile("file")
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "file missing")
		}

		entityType := c.FormValue("entity_type")
		entityID, _ := strconv.Atoi(c.FormValue("entity_id"))

		_ = os.MkdirAll(uploadDir, 0o755)
		storedName := fmt.Sprintf("%d-%s", time.Now().UnixNano(), filepath.Base(file.Filename))
		dst := filepath.Join(uploadDir, storedName)
		if err := c.SaveFile(file, dst); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var id int
		err = db.QueryRow(c.Context(),
			`INSERT INTO attachments (entity_type, entity_id, filename, stored_name, mime_type, size_bytes)
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			entityType, entityID, file.Filename, storedName, file.Header.Get("Content-Type"), file.Size).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, fiber.Map{"id": id})
	}
}

func meta(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var a struct {
			ID        int    `json:"id"`
			Filename  string `json:"filename"`
			MimeType  string `json:"mime_type"`
			SizeBytes int64  `json:"size_bytes"`
			CreatedAt string `json:"created_at"`
		}
		err = db.QueryRow(c.Context(),
			`SELECT id, filename, mime_type, size_bytes, created_at::text FROM attachments WHERE id=$1`, id).
			Scan(&a.ID, &a.Filename, &a.MimeType, &a.SizeBytes, &a.CreatedAt)
		if err != nil {
			// Match the original API: missing meta returns 200 with null data.
			return shared.OK(c, nil)
		}
		return shared.OK(c, a)
	}
}

func download(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var storedName, filename, mimeType string
		err = db.QueryRow(c.Context(),
			`SELECT stored_name, filename, mime_type FROM attachments WHERE id = $1`, id).
			Scan(&storedName, &filename, &mimeType)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "attachment not found")
		}

		path := filepath.Join(uploadDir, storedName)
		if _, err := os.Stat(path); err != nil {
			return shared.Err(c, fiber.StatusNotFound, "file missing on disk")
		}

		c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
		if mimeType != "" {
			c.Set("Content-Type", mimeType)
		}
		return c.SendFile(path)
	}
}
