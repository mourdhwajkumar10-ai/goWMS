package dispatch

import (
	"strconv"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the dispatch routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", createTrip(db)) // frontend alias
	r.Post("/trip", createTrip(db))
	r.Get("/trips", listTrips(db))
	r.Get("/trip/:id", getTrip(db))
	r.Post("/trip/:id/load", loadBox(db))
	r.Post("/load", loadBox(db))
	r.Post("/trip/:id/start", startTrip(db))
	r.Post("/trip/:id/complete", completeTrip(db))
	r.Post("/signature", captureSignature(db))
	r.Post("/trip/:id/generate-dn", generateDN(db))
	r.Post("/trip/:id/stop/:stopId/visit", visitStop(db))
	r.Post("/trip/:id/complete-gated", completeTripGated(db)) // feature-flag style alternate
}

func createTrip(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			DriverID   *int   `json:"driver_id"`
			DriverName string `json:"driver_name"`
			VehicleNo  string `json:"vehicle_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		var id int
		var tripNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO delivery_trips (trip_no,driver_id,vehicle_no,driver_name,status)
			 VALUES ('DT-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('delivery_trips_id_seq')::TEXT,5,'0'),$1,$2,$3,'scheduled')
			 RETURNING id, trip_no`,
			body.DriverID, body.VehicleNo, nullEmpty(body.DriverName)).Scan(&id, &tripNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "trip_no": tripNo, "status": "scheduled"})
	}
}

func nullEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func listTrips(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, trip_no, vehicle_no, driver_id, driver_name, status, departure_time, created_at
			FROM delivery_trips ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type trip struct {
			ID            int        `json:"id"`
			TripNo        string     `json:"trip_no"`
			VehicleNo     *string    `json:"vehicle_no"`
			DriverID      *int       `json:"driver_id"`
			DriverName    *string    `json:"driver_name"`
			Status        string     `json:"status"`
			DepartureTime *time.Time `json:"departure_time"`
			CreatedAt     *time.Time `json:"created_at"`
		}
		var list []trip
		for rows.Next() {
			var t trip
			if err := rows.Scan(&t.ID, &t.TripNo, &t.VehicleNo, &t.DriverID, &t.DriverName,
				&t.Status, &t.DepartureTime, &t.CreatedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, t)
		}
		return shared.OK(c, list)
	}
}

func getTrip(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var t struct {
			ID            int
			TripNo        string
			VehicleNo     *string
			DriverID      *int
			DriverName    *string
			Status        string
			DepartureTime *time.Time
			CreatedAt     *time.Time
		}
		err = db.QueryRow(c.Context(), `
			SELECT id, trip_no, vehicle_no, driver_id, driver_name, status, departure_time, created_at
			FROM delivery_trips WHERE id=$1`, id).
			Scan(&t.ID, &t.TripNo, &t.VehicleNo, &t.DriverID, &t.DriverName, &t.Status, &t.DepartureTime, &t.CreatedAt)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "trip not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		stopRows, err := db.Query(c.Context(), `
			SELECT id, delivery_note_no, customer, address, stop_order, visited
			FROM delivery_stops WHERE trip_id=$1 ORDER BY stop_order, id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer stopRows.Close()

		type stop struct {
			ID             int     `json:"id"`
			DeliveryNoteNo *string `json:"delivery_note_no"`
			Customer       *string `json:"customer"`
			Address        *string `json:"address"`
			StopOrder      *int    `json:"stop_order"`
			Visited        bool    `json:"visited"`
		}
		var stops []stop
		for stopRows.Next() {
			var s stop
			if err := stopRows.Scan(&s.ID, &s.DeliveryNoteNo, &s.Customer, &s.Address, &s.StopOrder, &s.Visited); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			stops = append(stops, s)
		}

		boxRows, err := db.Query(c.Context(), `
			SELECT b.id, b.label, b.pick_list_id, b.loaded, COALESCE(b.stock_consumed,false)
			FROM box_load_logs bl
			JOIN boxes b ON b.id = bl.box_id
			WHERE bl.trip_id=$1
			ORDER BY bl.id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer boxRows.Close()

		type box struct {
			ID            int    `json:"id"`
			Label         string `json:"label"`
			PickListID    *int   `json:"pick_list_id"`
			Loaded        bool   `json:"loaded"`
			StockConsumed bool   `json:"stock_consumed"`
		}
		var boxes []box
		for boxRows.Next() {
			var b box
			if err := boxRows.Scan(&b.ID, &b.Label, &b.PickListID, &b.Loaded, &b.StockConsumed); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			boxes = append(boxes, b)
		}

		return shared.OK(c, fiber.Map{
			"id": t.ID, "trip_no": t.TripNo, "vehicle_no": t.VehicleNo,
			"driver_id": t.DriverID, "driver_name": t.DriverName, "status": t.Status,
			"departure_time": t.DepartureTime, "created_at": t.CreatedAt,
			"stops": stops, "boxes": boxes,
		})
	}
}

func loadBox(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tripID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			tripID = 0
		}

		var body struct {
			BoxID  int `json:"box_id"`
			TripID int `json:"trip_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.BoxID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "box_id required")
		}
		if tripID == 0 {
			tripID = body.TripID
		}
		if tripID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "trip_id required")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var label string
		var pickListID *int
		var stockConsumed bool
		err = tx.QueryRow(c.Context(),
			`SELECT label, pick_list_id, COALESCE(stock_consumed,false) FROM boxes WHERE id=$1 FOR UPDATE`,
			body.BoxID).Scan(&label, &pickListID, &stockConsumed)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "box not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Consume reserved location stock on first load (pack or dispatch).
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
			_, _ = tx.Exec(c.Context(), `UPDATE boxes SET stock_consumed=true WHERE id=$1`, body.BoxID)
		}

		if _, err := tx.Exec(c.Context(),
			`INSERT INTO box_load_logs (box_id,trip_id,loaded_by) VALUES ($1,$2,$3)`,
			body.BoxID, tripID, userID(c)); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if _, err := tx.Exec(c.Context(),
			`UPDATE boxes SET loaded=true, loaded_at=NOW() WHERE id=$1`, body.BoxID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, fiber.Map{
			"box_id": body.BoxID, "trip_id": tripID, "loaded": true,
			"label": label, "stock_consumed": true,
		})
	}
}

func startTrip(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE delivery_trips SET status='in_transit', departure_time=NOW()
			WHERE id=$1 AND status IN ('draft','scheduled')`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "trip cannot be started")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "in_transit"})
	}
}

func completeTrip(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE delivery_trips SET status='completed' WHERE id=$1 AND status IN ('in_transit','scheduled')`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "trip cannot be completed")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "completed"})
	}
}

func captureSignature(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			StopID        int    `json:"stop_id"`
			OrderNo       string `json:"order_no"`
			SignatureData string `json:"signature_data"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.StopID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "stop_id required")
		}

		if _, err := db.Exec(c.Context(),
			`INSERT INTO delivery_signatures (stop_id,order_no,signature_data,captured_by) VALUES ($1,$2,$3,$4)`,
			body.StopID, body.OrderNo, body.SignatureData, userID(c)); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if _, err := db.Exec(c.Context(),
			`UPDATE delivery_stops SET visited=true, visited_time=NOW() WHERE id=$1`, body.StopID); err != nil {
			// non-fatal if the stop does not exist
		}

		return shared.OK(c, nil)
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}

// generateDN auto-creates a delivery note from trip stops / loaded boxes and links POD-ready DN.
func generateDN(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tripID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid trip id")
		}
		var body struct {
			Customer       string `json:"customer"`
			StopID         *int   `json:"stop_id"`
			AgainstSO      string `json:"against_sales_order"`
			CreateStop     bool   `json:"create_stop"`
		}
		_ = shared.Bind(c, &body)

		var tripNo string
		err = db.QueryRow(c.Context(), `SELECT trip_no FROM delivery_trips WHERE id=$1`, tripID).Scan(&tripNo)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "trip not found")
		}

		var dnID int
		var dnName string
		err = db.QueryRow(c.Context(), `
			INSERT INTO delivery_notes (name, customer_name, status, against_sales_order, trip_id)
			VALUES ('DN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('delivery_notes_id_seq')::TEXT,5,'0'),
				$1, 'draft', $2, $3)
			RETURNING id, name`,
			nullEmpty(body.Customer), nullEmpty(body.AgainstSO), tripID).Scan(&dnID, &dnName)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Copy items from loaded boxes on this trip
		_, _ = db.Exec(c.Context(), `
			INSERT INTO delivery_note_items (delivery_note_id, item_code, qty, against_sales_order)
			SELECT $1, bi.item_code, bi.quantity, $2
			FROM box_load_logs bl
			JOIN box_items bi ON bi.box_id = bl.box_id
			WHERE bl.trip_id=$3`, dnID, body.AgainstSO, tripID)

		stopID := 0
		if body.StopID != nil {
			stopID = *body.StopID
			_, _ = db.Exec(c.Context(), `
				UPDATE delivery_stops SET delivery_note_no=$2 WHERE id=$1 AND trip_id=$3`,
				stopID, dnName, tripID)
		} else if body.CreateStop || body.Customer != "" {
			_ = db.QueryRow(c.Context(), `
				INSERT INTO delivery_stops (trip_id, delivery_note_no, customer, stop_order, visited)
				VALUES ($1,$2,$3, COALESCE((SELECT MAX(stop_order)+1 FROM delivery_stops WHERE trip_id=$1),1), false)
				RETURNING id`, tripID, dnName, nullEmpty(body.Customer)).Scan(&stopID)
		}

		return shared.OK(c, fiber.Map{
			"delivery_note_id": dnID, "delivery_note": dnName,
			"trip_id": tripID, "stop_id": stopID,
		})
	}
}

func visitStop(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tripID, _ := strconv.Atoi(c.Params("id"))
		stopID, err := strconv.Atoi(c.Params("stopId"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid stop id")
		}
		var body struct {
			Skipped       bool   `json:"skipped"`
			SignatureData string `json:"signature_data"`
			OrderNo       string `json:"order_no"`
		}
		_ = shared.Bind(c, &body)

		tag, err := db.Exec(c.Context(), `
			UPDATE delivery_stops SET visited=true, visited_time=NOW()
			WHERE id=$1 AND trip_id=$2`, stopID, tripID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "stop not found on trip")
		}

		if body.SignatureData != "" {
			var sigID int
			_ = db.QueryRow(c.Context(), `
				INSERT INTO delivery_signatures (stop_id, order_no, signature_data, captured_by)
				VALUES ($1,$2,$3,$4) RETURNING id`,
				stopID, body.OrderNo, body.SignatureData, userID(c)).Scan(&sigID)
			// Link POD to DN if stop has DN
			_, _ = db.Exec(c.Context(), `
				UPDATE delivery_notes dn
				SET pod_signature_id=$1, delivered_at=NOW(), status='Delivered'
				FROM delivery_stops ds
				WHERE ds.id=$2 AND ds.delivery_note_no = dn.name`, sigID, stopID)
		}

		return shared.OK(c, fiber.Map{"stop_id": stopID, "visited": true, "skipped": body.Skipped})
	}
}

// completeTripGated blocks complete until all stops visited or explicitly skipped.
// Use this path when ready; default /complete remains permissive.
func completeTripGated(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var pending int
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM delivery_stops WHERE trip_id=$1 AND visited=false`, id).Scan(&pending)
		if pending > 0 {
			return shared.Err(c, fiber.StatusBadRequest,
				strconv.Itoa(pending)+" stop(s) not visited — mark visited/skipped or use /complete")
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE delivery_trips SET status='completed' WHERE id=$1 AND status IN ('in_transit','scheduled')`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "trip cannot be completed")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "completed", "gated": true})
	}
}
