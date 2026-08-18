package auth

import (
	"strings"
	"time"

	"goWMS/api/config"
	"goWMS/api/middleware"
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
	auth.Post("/pin-login", pinLogin(db))
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
		body.Username = strings.TrimSpace(body.Username)
		body.Password = strings.TrimSpace(body.Password)
		if body.Username == "" || body.Password == "" {
			return shared.Err(c, fiber.StatusBadRequest, "username and password required")
		}
		if len(body.Password) < 4 {
			return shared.Err(c, fiber.StatusBadRequest, "password must be at least 4 characters")
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
		body.Username = strings.TrimSpace(body.Username)
		body.Password = strings.TrimSpace(body.Password)
		if body.Username == "" || body.Password == "" {
			return shared.Err(c, fiber.StatusUnauthorized, "invalid credentials")
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
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.Claims{
			UserID: id,
			Role:   role,
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(cfg.TokenExpiry)),
			},
		})
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

// pinLogin authenticates warehouse floor staff via employee PIN (parallel to password auth).
func pinLogin(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			BadgeCode   string `json:"badge_code"`
			EmployeeNo  string `json:"employee_number"`
			PIN         string `json:"pin"`
			WarehouseID *int   `json:"warehouse_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.PIN == "" {
			return shared.Err(c, fiber.StatusBadRequest, "pin required")
		}

		var (
			id      int
			pinHash string
			wmsRole string
			name    string
			whID    *int
			tokVer  int
		)
		var err error
		if body.BadgeCode != "" {
			err = db.QueryRow(c.Context(), `
				SELECT id, pin_hash, COALESCE(wms_role,'picker'), employee_name, warehouse_id, COALESCE(token_version,1)
				FROM employees
				WHERE badge_code=$1 AND COALESCE(disabled,false)=false AND status='Active' AND pin_hash IS NOT NULL`,
				body.BadgeCode).Scan(&id, &pinHash, &wmsRole, &name, &whID, &tokVer)
		} else if body.EmployeeNo != "" {
			err = db.QueryRow(c.Context(), `
				SELECT id, pin_hash, COALESCE(wms_role,'picker'), employee_name, warehouse_id, COALESCE(token_version,1)
				FROM employees
				WHERE employee_number=$1 AND COALESCE(disabled,false)=false AND status='Active' AND pin_hash IS NOT NULL`,
				body.EmployeeNo).Scan(&id, &pinHash, &wmsRole, &name, &whID, &tokVer)
		} else {
			return shared.Err(c, fiber.StatusBadRequest, "badge_code or employee_number required")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusUnauthorized, "invalid credentials")
		}
		if bcrypt.CompareHashAndPassword([]byte(pinHash), []byte(body.PIN)) != nil {
			return shared.Err(c, fiber.StatusUnauthorized, "invalid credentials")
		}
		if body.WarehouseID != nil && whID != nil && *body.WarehouseID != *whID {
			return shared.Err(c, fiber.StatusUnauthorized, "employee not assigned to this warehouse")
		}
		_ = tokVer

		cfg, _ := config.Load()
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.Claims{
			UserID: id,
			Role:   wmsRole,
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(cfg.TokenExpiry)),
			},
		})
		signed, err := token.SignedString([]byte(cfg.JWTSecret))
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to sign token")
		}
		return shared.OK(c, fiber.Map{
			"token":         signed,
			"role":          wmsRole,
			"employee_id":   id,
			"employee_name": name,
			"auth":          "pin",
		})
	}
}
