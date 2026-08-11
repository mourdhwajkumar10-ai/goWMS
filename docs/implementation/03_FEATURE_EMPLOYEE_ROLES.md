# Feature 03 — Employee Roles & PIN Login

**Spec References:** SPEC_01_WAREHOUSE_SETUP.md §3, SPEC.md §0
**Status:** PARTIAL (major gaps)
**Priority:** HIGH — blocks RBAC for all modules

---

## Current Implementation

### Database
- `users` table: id, username, password_hash, role (CHECK: picker/packer/driver/wm/billing/admin), is_active
- `employees` table: id, employee_name, first_name, department, designation, reports_to (ERPNext-style HR fields)
- No PIN field, no employee-to-user linkage

### Backend
- `api/modules/auth/handler.go`:
  - `POST /auth/register` — username + password + role
  - `POST /auth/login` — bcrypt verify, returns JWT with user_id + role claims
- `api/middleware/auth.go`:
  - Extracts user_id + role from JWT into `c.Locals()`
  - Does NOT enforce roles — any authenticated user accesses any endpoint

### Frontend
- `Login.tsx` — username + password form
- No Employees page
- `Layout.tsx` — shows role badge but doesn't hide nav items by role

---

## Gaps (All HIGH Priority)

### 1. No Employees Page/Handler
- `employees` table exists but no CRUD handler, no React page
- No way to manage warehouse staff (Picker, Packer, Receiver, etc.)
- **Plan:**
  1. Create `api/modules/employees/handler.go` with CRUD endpoints:
     - `GET /api/employees` — list (filter by warehouse, role)
     - `POST /api/employees` — create (emp_id, name, phone, role, warehouse_id, pin_hash)
     - `PUT /api/employees/:id` — update
     - `POST /api/employees/:id/reset-pin` — reset PIN
  2. Create `web/src/pages/Employees.tsx` — table + create/edit form
  3. Add route `/employees` in App.tsx
  4. Add "Employees" to Layout sidebar under Masters
- **Files:** New handler + new page + App.tsx + Layout.tsx
- **Effort:** 2-3 days

### 2. No PIN Login
- Spec defines 4-6 digit PIN for floor workers + badge scan login
- Only username+password exists
- **Plan:**
  1. Add `pin_hash` column to `employees` table (or use separate `employee_pins` table)
  2. Add `pin_code` column to employees (badge barcode)
  3. Create `POST /auth/pin-login` endpoint:
     - Accepts pin (4-6 digits) + warehouse_id
     - Looks up employee by pin_hash, returns JWT
  4. Create `POST /auth/scan-login` endpoint:
     - Accepts barcode string
     - Looks up employee by pin_code, returns JWT
  5. Add PIN pad UI to Login.tsx (numpad component)
  6. Add "Scan Badge" button (uses BarcodeScanner component)
- **Files:** Migration, auth handler, Login.tsx
- **Effort:** 2-3 days
- **Conflict:** Auth module — must not break existing username+password flow

### 3. No RBAC Middleware
- Role extracted but never checked
- Any user can access any endpoint
- **Plan:**
  1. Create `RequireRole(roles ...string)` middleware factory:
     ```go
     func RequireRole(allowed ...string) fiber.Handler {
         return func(c *fiber.Ctx) error {
             role := c.Locals("role").(string)
             for _, r := range allowed {
                 if r == role { return c.Next() }
             }
             return c.Status(403).JSON(fiber.Map{"error": "insufficient permissions"})
         }
     }
     ```
  2. Apply to sensitive endpoints:
     - Admin only: user management, settings, stock reconciliation
     - WM only: GRN close, putaway confirm, dispatch complete
     - Picker: pick scan only
     - Packer: pack items only
     - Billing: invoice operations
  3. Update Layout.tsx to hide nav items by role
- **Files:** `api/middleware/auth.go`, all handler files, Layout.tsx
- **Effort:** 2-3 days
- **Conflict:** Touches ALL handlers — must be done carefully to avoid breaking existing flows

### 4. No Employee-to-User Linkage
- employees and users are separate tables with no FK
- No way to link a picker login to their employee record
- **Plan:**
  1. Add `user_id` FK to `employees` table
  2. Or: merge into single table with both auth and HR fields
  3. For simplicity: use employees as the primary table, add username/password fields
- **Effort:** 1 day (schema change + migration)

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| ALL modules | RBAC gates access | Apply middleware last, after all features work |
| Auth | PIN login must not break password login | Add new endpoints, keep existing |
| Layout | Nav hiding by role | Add role check to sidebar rendering |

---

## Acceptance Criteria

- [ ] Admin can create employees with role, warehouse, PIN
- [ ] Floor worker can login with 4-6 digit PIN
- [ ] Floor worker can login by scanning badge barcode
- [ ] Role-based access: picker can only pick, packer can only pack
- [ ] Admin/WM can access all modules
- [ ] Layout hides irrelevant nav items per role
- [ ] Existing password login still works

---

## Implementation Plan

### Phase 1 — Employees CRUD (2 days)
1. Create employees handler (CRUD + list by warehouse/role)
2. Create Employees.tsx page with table + form
3. Add route and sidebar nav

### Phase 2 — PIN Login (2 days)
1. Migration: add pin_hash, pin_code, user_id to employees
2. Create /auth/pin-login and /auth/scan-login endpoints
3. Add PIN pad to Login.tsx
4. Add badge scan button

### Phase 3 — RBAC Middleware (2 days)
1. Create RequireRole middleware
2. Apply to all handlers (admin, wm, picker, packer, driver, billing)
3. Update Layout.tsx to filter nav by role
4. Test each role can only access permitted endpoints
