# Implementation Progress — goWMS

**Updated:** 2026-08-11 (admin-configurable RBAC)  
**Rule:** Extend integer/ERPNext schema only. Protect FEFO reserve→consume. Conflict designs in separate files.

---

## Done (RBAC — this session)

### Admin-configurable roles
- [x] `migrations/011_rbac_roles_permissions.sql` — `roles`, `role_permissions`; seeds admin/supervisor/picker/packer/qi/dispatcher (+ legacy wm/driver/billing)
- [x] Fixed permission catalog in `api/modules/rbac/catalog.go` (modules: masters, grn, qi, putaway, sales_orders, picking, packing, dispatch, backorders, returns, employees, roles, analytics, notifications, import_export)
- [x] JWT still uses `roles.code` via `employees.wms_role` / `users.role` (no breaking claim change)
- [x] Dropped `users_role_check` so custom role codes work

### APIs
- [x] `GET /api/permissions` — catalog
- [x] `GET/POST /api/roles`, `GET/PUT/DELETE /api/roles/:id`, `PUT /api/roles/:id/permissions`
- [x] System roles cannot be deleted; custom roles blocked if still assigned
- [x] `PUT /api/employees/:id/role` — assign `wms_role` (requires `employees.manage`)
- [x] Role mutations require `roles.manage` (admin always); employee mutations require `employees.manage`
- [x] Path enforcement still **default OFF** — `GOWMS_RBAC=1` loads DB perms (in-process cache)

### UI
- [x] **Employees** — role dropdown from `/roles`, inline assign, admin soft-gate
- [x] **Roles** — list, create custom, permission checkboxes by module
- [x] Layout nav: Employees + Roles soft-hidden unless admin/wm/supervisor

### Enable enforcement (after configuring roles)
```bash
psql "$DATABASE_URL" -f migrations/011_rbac_roles_permissions.sql
# In UI: Roles → set permissions; Employees → assign roles
export GOWMS_RBAC=1
go run ./cmd/server
```

---

## Done (prior continuation)

### Pick cancel → ReleaseReserved
- [x] `shared.ReleasePickListReservations` — releases unconsumed reserved qty only
- [x] `POST /picking/:id/cancel` — refuses if stock already consumed
- [x] Pick UI: **Cancel & Release**, **BO from shortage**

### Backorder v2
- [x] `migrations/010_backorders_v2_qc_templates.sql` — **apply this** (creates v2 tables, migrates open v1 rows)
- [x] `RegisterV2` at `/api/backorder/v2` (list/create/auto-from-pick/fulfill/open-by-item)
- [x] v1 UNIQUE(sales_order_no) **unchanged**
- [x] Backorders UI tabs v2 / v1

### Wave picking
- [x] `picking.RegisterWave` wired in `main.go`
- [x] Pick page **Wave Pick** UI (multi SO IDs → same FEFO allocate)

### Hard RBAC (flag)
- [x] Behind `GOWMS_RBAC=1` (default **OFF**); now DB-backed when enabled
- File: `api/middleware/rbac_enforced.go` + `api/modules/rbac`

### QC templates
- [x] `qc_templates` table (migration 010)
- [x] `/qi/templates` CRUD + `/qi/from-template`
- [x] Qi.tsx template dropdown + create template

### Excel packing-list import
- [x] excelize `POST /packing-list/import-xlsx` (multipart)
- [x] GRN UI **Import XLSX** alongside CSV

### Packing weight validation
- [x] Soft warning when `declared_weight` would exceed `boxes.max_weight` (item `weight_per_unit`)
- [x] Pack UI shows warning toast

### Priority / SLA decay
- [x] `POST /sales-orders/decay-priorities` — +1 priority (max 10) for past delivery / SLA
- [x] Sales Orders UI **Run SLA Decay**

### Import/export
- [x] `GET /masterdata/items/export` CSV
- [x] `GET /employees/export` CSV (+ Employees UI button)

### Notifications / offline / carrier
- [x] Shortage emit from backorder auto-from-pick; SO confirm emit (prior)
- [x] `web/src/utils/offlineQueue.ts` — Pack queues when offline
- [x] Supplier `vehicles` jsonb + `PUT /masterdata/suppliers/:id/vehicles`

---

## How to enable

| Feature | How |
|---------|-----|
| **RBAC setup UI** | Always on for admin; apply `011_…sql` |
| **RBAC API enforcement** | Configure roles first, then `GOWMS_RBAC=1` (default off) |
| **Backorder v2** | Apply `010_…sql`; routes live at `/api/backorder/v2` |
| **Wave** | Already registered; use Pick → Wave Pick |
| **xlsx import** | GRN session → Import XLSX |

```bash
psql "$DATABASE_URL" -f migrations/008_sales_orders_priority_indexes.sql
psql "$DATABASE_URL" -f migrations/010_backorders_v2_qc_templates.sql
psql "$DATABASE_URL" -f migrations/011_rbac_roles_permissions.sql
go run ./cmd/server
cd web && npm run dev
```

---

## Still deferred

- Email/SMS push (not started)
- WebSocket realtime (polling remains; offline queue is localStorage only)
- Full carrier fleet UI beyond vehicles JSON API
