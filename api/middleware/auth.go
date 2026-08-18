package middleware

import (
	"os"
	"strings"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// Claims is the JWT payload shape issued at login.
type Claims struct {
	UserID int    `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

var (
	jwtSecretMu sync.RWMutex
	jwtSecret   []byte
)

// SetJWTSecret pins the signing secret used by Auth so it always matches login.
func SetJWTSecret(secret string) {
	jwtSecretMu.Lock()
	defer jwtSecretMu.Unlock()
	jwtSecret = []byte(secret)
}

func jwtSecretBytes() []byte {
	jwtSecretMu.RLock()
	s := jwtSecret
	jwtSecretMu.RUnlock()
	if len(s) > 0 {
		return s
	}
	return []byte(getEnv("JWT_SECRET", "change-me-in-production"))
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func keyFunc(t *jwt.Token) (interface{}, error) {
	if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
		return nil, fiber.NewError(fiber.StatusUnauthorized, "unexpected signing method")
	}
	return jwtSecretBytes(), nil
}

func unauthorized(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"error": msg,
		"ok":    false,
	})
}

// Auth verifies the Bearer JWT and injects user_id + role into the context.
func Auth(c *fiber.Ctx) error {
	header := c.Get("Authorization")
	if header == "" {
		return unauthorized(c, "missing authorization header")
	}

	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return unauthorized(c, "invalid authorization header")
	}
	raw := strings.TrimSpace(parts[1])
	if raw == "" || raw == "undefined" || raw == "null" {
		return unauthorized(c, "missing authorization header")
	}

	userID, role, ok := parseAuthToken(raw)
	if !ok {
		return unauthorized(c, "invalid or expired token")
	}

	c.Locals("user_id", userID)
	c.Locals("role", role)
	return c.Next()
}

func parseAuthToken(raw string) (userID int, role string, ok bool) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, keyFunc)
	if err == nil && token.Valid {
		if claims, claimsOK := token.Claims.(*Claims); claimsOK && claims.Role != "" {
			return claims.UserID, claims.Role, true
		}
	}

	// Tokens issued with jwt.MapClaims still validate; user_id may be a float.
	generic, err := jwt.Parse(raw, keyFunc)
	if err != nil || !generic.Valid {
		return 0, "", false
	}
	mapClaims, claimsOK := generic.Claims.(jwt.MapClaims)
	if !claimsOK {
		return 0, "", false
	}
	role, _ = mapClaims["role"].(string)
	if role == "" {
		return 0, "", false
	}
	switch v := mapClaims["user_id"].(type) {
	case float64:
		userID = int(v)
	case int:
		userID = v
	case int64:
		userID = int(v)
	}
	return userID, role, true
}
