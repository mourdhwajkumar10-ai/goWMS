package putaway

import (
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the putaway routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", createLog(db))
}

func createLog(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			GRNLineID       int     `json:"grn_line_id"`
			ItemCode        string  `json:"item_code"`
			BatchNo         string  `json:"batch_no"`
			SourceWarehouse string  `json:"source_warehouse"`
			TargetLocation  string  `json:"target_location"`
			Quantity        float64 `json:"quantity"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" || body.TargetLocation == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code and target_location required")
		}

		// grn_line_id is nullable — 0 becomes NULL.
		var grnLineID any
		if body.GRNLineID != 0 {
			grnLineID = body.GRNLineID
		}

		var id int
		var logNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO putaway_logs (log_no,grn_line_id,item_code,batch_no,source_warehouse,target_location,quantity,placed_at,placed_by)
			 VALUES ('PA-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('putaway_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,$5,$6,NOW(),$7)
			 RETURNING id, log_no`,
			grnLineID, body.ItemCode, body.BatchNo, body.SourceWarehouse,
			body.TargetLocation, body.Quantity, userID(c)).Scan(&id, &logNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "log_no": logNo})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
