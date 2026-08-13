package shared

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ActorID returns the authenticated user id from Fiber locals (0 if missing).
func ActorID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}

// WriteAudit inserts an immutable audit_log row. Failures are ignored so
// business mutations are never blocked by logging.
func WriteAudit(db *pgxpool.Pool, ctx context.Context, actorID int, operation, entityType string, entityID int, oldVal, newVal any) {
	if db == nil || operation == "" {
		return
	}
	var oldJSON, newJSON []byte
	if oldVal != nil {
		oldJSON, _ = json.Marshal(oldVal)
	}
	if newVal != nil {
		newJSON, _ = json.Marshal(newVal)
	}
	var actor any
	if actorID > 0 {
		actor = actorID
	}
	var eid any
	if entityID > 0 {
		eid = entityID
	}
	_, _ = db.Exec(ctx, `
		INSERT INTO audit_log (operation, entity_type, entity_id, old_value, new_value, actor_id)
		VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
		operation, nullEmpty(entityType), eid, nullBytes(oldJSON), nullBytes(newJSON), actor)
}

func nullEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullBytes(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return string(b)
}
