package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration loaded from .env
type Config struct {
	DatabaseURL string
	JWTSecret   string
	TokenExpiry time.Duration
	Port        string
	RedisURL    string
}

// Load reads .env (if present) and returns a fully populated Config.
func Load() (*Config, error) {
	_ = godotenv.Load()
	_ = godotenv.Load(".env")
	_ = godotenv.Load("../.env")

	cfg := &Config{
		JWTSecret:   getEnv("JWT_SECRET", "change-me-in-production"),
		TokenExpiry: time.Duration(getEnvInt("TOKEN_EXPIRY_HOURS", 24)) * time.Hour,
		Port:        getEnv("PORT", "8080"),
		RedisURL:    getEnv("REDIS_URL", "localhost:6379"),
	}

	dbUser := getEnv("DB_USER", "gowms")
	dbPass := getEnv("DB_PASSWORD", "secret")
	dbName := getEnv("DB_NAME", "gowms")
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")

	cfg.DatabaseURL = fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s",
		dbUser, dbPass, dbHost, dbPort, dbName,
	)

	return cfg, nil
}

// DatabaseURL returns the constructed Postgres connection string.
func (c *Config) DatabaseURLString() string { return c.DatabaseURL }

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
