package shared

import "github.com/gofiber/fiber/v2"

// OK responds with a success payload: {"data": ..., "ok": true}
func OK(c *fiber.Ctx, data any) error {
	return c.JSON(fiber.Map{
		"data": data,
		"ok":   true,
	})
}

// Err responds with an error payload: {"error": ..., "ok": false}
func Err(c *fiber.Ctx, status int, msg string) error {
	return c.Status(status).JSON(fiber.Map{
		"error": msg,
		"ok":    false,
	})
}

// Bind parses the JSON body into v, returning a friendly 400 on failure.
func Bind(c *fiber.Ctx, v any) error {
	if err := c.BodyParser(v); err != nil {
		return Err(c, fiber.StatusBadRequest, "invalid body")
	}
	return nil
}
