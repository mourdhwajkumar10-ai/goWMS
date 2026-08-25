package rbac

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store caches role → permission codes loaded from role_permissions.
type Store struct {
	mu     sync.RWMutex
	byRole map[string]map[string]struct{}
	db     *pgxpool.Pool
}

var global *Store

// Init wires the process-wide permission store and loads from DB.
func Init(db *pgxpool.Pool) *Store {
	s := &Store{db: db, byRole: map[string]map[string]struct{}{}}
	global = s
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = s.Reload(ctx)
	return s
}

// Global returns the process store (may be nil before Init).
func Global() *Store { return global }

// Reload refreshes the in-memory map from PostgreSQL.
func (s *Store) Reload(ctx context.Context) error {
	if s == nil || s.db == nil {
		return nil
	}
	rows, err := s.db.Query(ctx, `
		SELECT r.code, rp.permission_code
		FROM roles r
		LEFT JOIN role_permissions rp ON rp.role_id = r.id
		ORDER BY r.code`)
	if err != nil {
		return err
	}
	defer rows.Close()

	next := map[string]map[string]struct{}{}
	for rows.Next() {
		var code string
		var perm *string
		if err := rows.Scan(&code, &perm); err != nil {
			return err
		}
		if _, ok := next[code]; !ok {
			next[code] = map[string]struct{}{}
		}
		if perm != nil && *perm != "" {
			next[code][*perm] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	s.byRole = next
	s.mu.Unlock()
	return nil
}

// Invalidate reloads after role/permission mutations.
func (s *Store) Invalidate(ctx context.Context) {
	_ = s.Reload(ctx)
}

// Has reports whether role has permission (or "*").
// admin always has full access as a safety net even if seed missing.
func (s *Store) Has(role, perm string) bool {
	if role == "" || perm == "" {
		return false
	}
	if strings.EqualFold(role, "admin") {
		return true
	}
	if s == nil {
		return false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	set, ok := s.byRole[role]
	if !ok {
		set, ok = s.byRole[strings.ToLower(role)]
		if !ok {
			return false
		}
	}
	if _, ok := set["*"]; ok {
		return true
	}
	_, ok = set[perm]
	return ok
}

// Codes returns sorted unique permission codes for a role (for UI / debug).
// Unknown roles and nil stores return nil (not an empty slice).
func (s *Store) Codes(role string) []string {
	if s == nil {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	set, ok := s.byRole[role]
	if !ok {
		set, ok = s.byRole[strings.ToLower(role)]
	}
	if !ok {
		return nil
	}
	out := make([]string, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}
