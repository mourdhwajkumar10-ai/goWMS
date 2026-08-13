package audit

import (
	"encoding/json"
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires GET /audit for warehouse transaction logs UI.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/", list(db))
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		limit, _ := strconv.Atoi(c.Query("limit", "100"))
		if limit < 1 || limit > 500 {
			limit = 100
		}
		entityType := strings.TrimSpace(c.Query("entity_type"))
		entityID, _ := strconv.Atoi(c.Query("entity_id"))
		actorID, _ := strconv.Atoi(c.Query("actor_id"))
		from := strings.TrimSpace(c.Query("from"))
		to := strings.TrimSpace(c.Query("to"))
		q := strings.TrimSpace(c.Query("q"))

		sql := `
			SELECT a.id, a.operation, COALESCE(a.entity_type,''), COALESCE(a.entity_id,0),
			       a.old_value, a.new_value, COALESCE(a.actor_id,0),
			       COALESCE(u.username, ''), a.created_at::text
			FROM audit_log a
			LEFT JOIN users u ON u.id = a.actor_id
			WHERE 1=1`
		args := []any{}
		n := 1
		if entityType != "" {
			sql += ` AND a.entity_type = $` + strconv.Itoa(n)
			args = append(args, entityType)
			n++
		}
		if entityID > 0 {
			sql += ` AND a.entity_id = $` + strconv.Itoa(n)
			args = append(args, entityID)
			n++
		}
		if actorID > 0 {
			sql += ` AND a.actor_id = $` + strconv.Itoa(n)
			args = append(args, actorID)
			n++
		}
		if from != "" {
			sql += ` AND a.created_at >= $` + strconv.Itoa(n) + `::timestamptz`
			args = append(args, from)
			n++
		}
		if to != "" {
			sql += ` AND a.created_at <= $` + strconv.Itoa(n) + `::timestamptz`
			args = append(args, to)
			n++
		}
		if q != "" {
			sql += ` AND (a.operation ILIKE $` + strconv.Itoa(n) + ` OR COALESCE(a.entity_type,'') ILIKE $` + strconv.Itoa(n) + ` OR COALESCE(u.username,'') ILIKE $` + strconv.Itoa(n) + `)`
			args = append(args, "%"+q+"%")
			n++
		}
		sql += ` ORDER BY a.created_at DESC LIMIT $` + strconv.Itoa(n)
		args = append(args, limit)

		rows, err := db.Query(c.Context(), sql, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		out := []fiber.Map{}
		for rows.Next() {
			var id, entityIDVal, actor int
			var operation, entityTypeVal, username, created string
			var oldVal, newVal []byte
			if err := rows.Scan(&id, &operation, &entityTypeVal, &entityIDVal, &oldVal, &newVal, &actor, &username, &created); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": id, "operation": operation, "entity_type": entityTypeVal, "entity_id": entityIDVal,
				"actor_id": actor, "actor_name": username, "created_at": created,
				"old_value": decodeJSON(oldVal), "new_value": decodeJSON(newVal),
			})
		}
		return shared.OK(c, out)
	}
}

func decodeJSON(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return string(b)
	}
	return v
}
