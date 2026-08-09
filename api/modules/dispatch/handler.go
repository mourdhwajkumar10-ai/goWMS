package dispatch

import (
	"strconv"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the dispatch routes. Route shapes match the frontend bundle:
//   - POST /trip            -> create delivery trip
//   - GET  /trips           -> list delivery trips
//   - POST /trip/:id/load   -> load a box onto a trip (trip id in path)
//   - POST /load            -> load a box (trip id in body)
//   - POST /signature       -> capture a delivery signature
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/trip", createTrip(db))
	r.Get("/trips", listTrips(db))
	r.Post("/trip/:id/load", loadBox(db))
	r.Post("/load", loadBox(db))
	r.Post("/signature", captureSignature(db))
}

func createTrip(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			DriverID  *int   `json:"driver_id"`
			VehicleNo string `json:"vehicle_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		var id int
		var tripNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO delivery_trips (trip_no,driver_id,vehicle_no)
			 VALUES ('DT-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('delivery_trips_id_seq')::TEXT,5,'0'),$1,$2)
			 RETURNING id, trip_no`,
			body.DriverID, body.VehicleNo).Scan(&id, &tripNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "trip_no": tripNo, "status": "draft"})
	}
}

func listTrips(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, trip_no, vehicle_no, driver_id, status, created_at
			FROM delivery_trips ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type trip struct {
			ID        int        `json:"id"`
			TripNo    string     `json:"trip_no"`
			VehicleNo *string    `json:"vehicle_no"`
			DriverID  *int       `json:"driver_id"`
			Status    string     `json:"status"`
			CreatedAt *time.Time `json:"created_at"`
		}
		var list []trip
		for rows.Next() {
			var t trip
			if err := rows.Scan(&t.ID, &t.TripNo, &t.VehicleNo, &t.DriverID, &t.Status, &t.CreatedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, t)
		}
		return shared.OK(c, list)
	}
}

func loadBox(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Trip id may come from the path (/trip/:id/load) or the body.
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

		var label string
		err = db.QueryRow(c.Context(),
			`SELECT label FROM boxes WHERE id=$1`, body.BoxID).Scan(&label)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "box not found")
		}

		if _, err := db.Exec(c.Context(),
			`INSERT INTO box_load_logs (box_id,trip_id,loaded_by) VALUES ($1,$2,$3)`,
			body.BoxID, tripID, userID(c)); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if _, err := db.Exec(c.Context(),
			`UPDATE boxes SET loaded=true, loaded_at=NOW() WHERE id=$1`, body.BoxID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, fiber.Map{"box_id": body.BoxID, "trip_id": tripID, "loaded": true})
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
