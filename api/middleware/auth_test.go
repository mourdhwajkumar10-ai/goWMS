package middleware

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestParseAuthTokenRoundTrip(t *testing.T) {
	SetJWTSecret("test-secret")
	t.Cleanup(func() { SetJWTSecret("") })

	typed := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserID: 7,
		Role:   "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	typedStr, err := typed.SignedString([]byte("test-secret"))
	if err != nil {
		t.Fatal(err)
	}
	id, role, ok := parseAuthToken(typedStr)
	if !ok || id != 7 || role != "admin" {
		t.Fatalf("typed claims: id=%d role=%q ok=%v", id, role, ok)
	}

	mapped := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": 9,
		"role":    "wm",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	mappedStr, err := mapped.SignedString([]byte("test-secret"))
	if err != nil {
		t.Fatal(err)
	}
	id, role, ok = parseAuthToken(mappedStr)
	if !ok || id != 9 || role != "wm" {
		t.Fatalf("map claims: id=%d role=%q ok=%v", id, role, ok)
	}
}

func TestParseAuthTokenRejectsWrongSecret(t *testing.T) {
	SetJWTSecret("test-secret")
	t.Cleanup(func() { SetJWTSecret("") })

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": 1,
		"role":    "admin",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	signed, err := tok.SignedString([]byte("other-secret"))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, ok := parseAuthToken(signed); ok {
		t.Fatal("expected reject")
	}
}
