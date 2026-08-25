package shared

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestErrReturnsNonNilAfterWritingJSON(t *testing.T) {
	app := fiber.New(fiber.Config{
		// Mirror server: do not overwrite a body already written by Err.
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

	app.Get("/nested", func(c *fiber.Ctx) error {
		if err := failingStep(c); err != nil {
			return err
		}
		// Must not run if Err returns non-nil (the GRN finalize bug).
		return OK(c, fiber.Map{"continued": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/nested", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("status=%d want %d", resp.StatusCode, fiber.StatusBadRequest)
	}
	body, _ := io.ReadAll(resp.Body)
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("json: %v body=%s", err, body)
	}
	if payload["ok"] != false {
		t.Fatalf("ok=%v want false", payload["ok"])
	}
	if payload["error"] != "boom" {
		t.Fatalf("error=%v want boom", payload["error"])
	}
	if _, continued := payload["data"]; continued {
		t.Fatal("handler continued after Err; expected stop")
	}
}

func failingStep(c *fiber.Ctx) error {
	return Err(c, fiber.StatusBadRequest, "boom")
}

func TestErrValueIsFiberError(t *testing.T) {
	app := fiber.New()
	var got error
	app.Get("/", func(c *fiber.Ctx) error {
		got = Err(c, fiber.StatusConflict, "nope")
		return got
	})
	_, _ = app.Test(httptest.NewRequest(http.MethodGet, "/", nil))
	fe, ok := got.(*fiber.Error)
	if !ok || fe == nil {
		t.Fatalf("got %T %#v, want *fiber.Error", got, got)
	}
	if fe.Code != fiber.StatusConflict || fe.Message != "nope" {
		t.Fatalf("fiber.Error=%#v", fe)
	}
}
