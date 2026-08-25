package shared

import "github.com/gofiber/fiber/v2"

// OK responds with a success payload: {"data": ..., "ok": true}
func OK(c *fiber.Ctx, data any) error {
	return c.JSON(fiber.Map{
		"data": data,
		"ok":   true,
	})
}

// Err writes {"error": msg, "ok": false} and returns a non-nil *fiber.Error.
// Callers must return this (or check it) so nested flows like finalize→doCloseSession
// stop instead of treating a successful JSON write as success (nil).
// The app ErrorHandler skips rewriting when the body was already sent.
func Err(c *fiber.Ctx, status int, msg string) error {
	if err := c.Status(status).JSON(fiber.Map{
		"error": msg,
		"ok":    false,
	}); err != nil {
		return err
	}
	return fiber.NewError(status, msg)
}

// Bind parses the JSON body into v, returning a friendly 400 on failure.
func Bind(c *fiber.Ctx, v any) error {
	if err := c.BodyParser(v); err != nil {
		return Err(c, fiber.StatusBadRequest, "invalid body")
	}
	return nil
}
