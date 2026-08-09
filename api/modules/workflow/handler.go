package workflow

import (
	"encoding/json"
	"strconv"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the workflow routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/definitions", createDefinition(db))
	r.Get("/definitions", listDefinitions(db))
	r.Post("/instances", createInstance(db))
	r.Get("/instances", listInstances(db))
	r.Post("/instances/:id/advance", advance(db))
}

func createDefinition(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Name        string          `json:"name"`
			EntityType  string          `json:"entity_type"`
			States      json.RawMessage `json:"states"`
			Transitions json.RawMessage `json:"transitions"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Name == "" || body.EntityType == "" {
			return shared.Err(c, fiber.StatusBadRequest, "name and entity_type required")
		}

		var id int
		err := db.QueryRow(c.Context(),
			`INSERT INTO workflow_definitions (name, entity_type, states, transitions)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			body.Name, body.EntityType, body.States, body.Transitions).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}

func listDefinitions(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, entity_type, states, transitions, active, created_at::text
			FROM workflow_definitions ORDER BY created_at DESC`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type def struct {
			ID          int             `json:"id"`
			Name        string          `json:"name"`
			EntityType  string          `json:"entity_type"`
			States      json.RawMessage `json:"states"`
			Transitions json.RawMessage `json:"transitions"`
			Active      bool            `json:"active"`
			CreatedAt   string          `json:"created_at"`
		}
		var list []def
		for rows.Next() {
			var d def
			if err := rows.Scan(&d.ID, &d.Name, &d.EntityType, &d.States, &d.Transitions, &d.Active, &d.CreatedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, d)
		}
		return shared.OK(c, list)
	}
}

func createInstance(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			WorkflowID int    `json:"workflow_id"`
			EntityType string `json:"entity_type"`
			EntityID   int    `json:"entity_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		var initialState string
		err := db.QueryRow(c.Context(),
			`SELECT states->0->>'name' FROM workflow_definitions WHERE id=$1`, body.WorkflowID).
			Scan(&initialState)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "workflow definition not found")
		}

		var id int
		err = db.QueryRow(c.Context(),
			`INSERT INTO workflow_instances (workflow_id, entity_type, entity_id, current_state)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			body.WorkflowID, body.EntityType, body.EntityID, initialState).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "current_state": initialState})
	}
}

func listInstances(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT wi.id, wi.entity_type, wi.entity_id, wi.current_state, wi.updated_at::text,
			       w.name AS workflow_name
			FROM workflow_instances wi
			JOIN workflow_definitions w ON w.id = wi.workflow_id
			ORDER BY wi.updated_at DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type inst struct {
			ID           int    `json:"id"`
			EntityType   string `json:"entity_type"`
			EntityID     int    `json:"entity_id"`
			CurrentState string `json:"current_state"`
			UpdatedAt    string `json:"updated_at"`
			WorkflowName string `json:"workflow_name"`
		}
		var list []inst
		for rows.Next() {
			var i inst
			if err := rows.Scan(&i.ID, &i.EntityType, &i.EntityID, &i.CurrentState, &i.UpdatedAt, &i.WorkflowName); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, i)
		}
		return shared.OK(c, list)
	}
}

func advance(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var body struct {
			Action string `json:"action"` // the target state
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Action == "" {
			return shared.Err(c, fiber.StatusBadRequest, "action required")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var currentState string
		err = tx.QueryRow(c.Context(),
			`SELECT current_state FROM workflow_instances WHERE id = $1 FOR UPDATE`, id).Scan(&currentState)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "instance not found")
		}

		// Validate the transition exists in the definition.
		var valid bool
		err = tx.QueryRow(c.Context(), `
			SELECT EXISTS (
				SELECT 1 FROM workflow_instances wi
				JOIN workflow_definitions w ON w.id = wi.workflow_id,
				jsonb_array_elements(w.transitions) t
				WHERE wi.id = $1 AND t->>'from' = $2 AND t->>'to' = $3
			)`, id, currentState, body.Action).Scan(&valid)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if !valid {
			return shared.Err(c, fiber.StatusBadRequest,
				"transition from "+currentState+" to "+body.Action+" not allowed")
		}

		tag, err := tx.Exec(c.Context(),
			`UPDATE workflow_instances SET current_state = $1, updated_at = NOW() WHERE id = $2`,
			body.Action, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "instance not found")
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "current_state": body.Action})
	}
}
