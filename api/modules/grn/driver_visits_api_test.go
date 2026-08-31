package grn

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"goWMS/api/internal/testdb"

	"github.com/gofiber/fiber/v2"
)

func TestDriverVisitAPI_CreateAdvanceSignOff(t *testing.T) {
	if testing.Short() {
		t.Skip("short")
	}
	pool := testdb.Open(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			if len(c.Response().Body()) > 0 {
				return nil
			}
			code := fiber.StatusInternalServerError
			msg := err.Error()
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
				msg = e.Message
			}
			return c.Status(code).JSON(fiber.Map{"error": msg, "ok": false})
		},
	})
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("role", "admin")
		c.Locals("user_id", 1)
		return c.Next()
	})
	RegisterDriverVisits(app.Group("/driver-visits"), pool)

	postJSON := func(path string, body any) (int, map[string]any) {
		t.Helper()
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		var parsed map[string]any
		_ = json.Unmarshal(raw, &parsed)
		return resp.StatusCode, parsed
	}

	code, created := postJSON("/driver-visits/", map[string]any{
		"truck_no":             "E2E-TRUCK-1",
		"driver_name":          "Ravi",
		"purchase_receipt_no":  "PO-TEST-1",
		"check_in_now":         true,
	})
	if code != http.StatusOK || created["ok"] != true {
		t.Fatalf("create: status=%d body=%v", code, created)
	}
	data, _ := created["data"].(map[string]any)
	id := int(data["id"].(float64))
	if data["status"] != "dock" {
		t.Fatalf("status=%v want dock", data["status"])
	}

	for _, want := range []string{"unloading", "box_verification", "signed_off"} {
		code, adv := postJSON("/driver-visits/"+itoa(id)+"/advance", map[string]any{"next": true})
		if code != http.StatusOK || adv["ok"] != true {
			t.Fatalf("advance to %s: %v", want, adv)
		}
		d, _ := adv["data"].(map[string]any)
		if d["status"] != want {
			t.Fatalf("got status=%v want %s", d["status"], want)
		}
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
