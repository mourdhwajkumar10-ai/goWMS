package auth

import (
	"time"

	"goWMS/api/config"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Register wires the auth routes (public group, before auth middleware).
func Register(r fiber.Router, db *pgxpool.Pool) {
	auth := r.Group("/auth")
	auth.Post("/register", register(db))
	auth.Post("/login", login(db))
}

func register(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
			Role     string `json:"role"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Username == "" || body.Password == "" {
			return shared.Err(c, fiber.StatusBadRequest, "username and password required")
		}
		if body.Role == "" {
			body.Role = "wm"
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to hash password")
		}

		_, err = db.Exec(c.Context(),
			`INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)`,
			body.Username, string(hash), body.Role)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, nil)
	}
}

func login(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		var (
			id           int
			passwordHash string
			role         string
		)
		err := db.QueryRow(c.Context(),
			`SELECT id, password_hash, role FROM users WHERE username=$1 AND is_active=true`,
			body.Username).Scan(&id, &passwordHash, &role)
		if err != nil {
			return shared.Err(c, fiber.StatusUnauthorized, "invalid credentials")
		}

		if bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(body.Password)) != nil {
			return shared.Err(c, fiber.StatusUnauthorized, "invalid credentials")
		}

		cfg, _ := config.Load()
		claims := jwt.MapClaims{
			"user_id": id,
			"role":    role,
			"exp":     time.Now().Add(cfg.TokenExpiry).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, err := token.SignedString([]byte(cfg.JWTSecret))
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to sign token")
		}

		return shared.OK(c, fiber.Map{
			"token": signed,
			"role":  role,
		})
	}
}
