# Implementation Progress — goWMS

**Updated:** 2026-08-11 (warehouse configure UI + location priority)  
**Rule:** Extend integer/ERPNext schema only. Protect FEFO reserve→consume. Conflict designs in separate files.

---

## Done (Warehouse configure — this session)

- [x] Migration `013_location_putaway_priority.sql` — `putaway_priority` (1–10), widen location types, normalize levels
- [x] Levels: **lower / middle / upper** (legacy `low` → lower); UI labels **Aisle / Bay / Level / Bin**
- [x] Create any location + bulk generate with level checkboxes + type + priority
- [x] Inline **Edit** location: type, priority, capacity, mixed, disabled
- [x] Putaway empty-bin suggest orders by `putaway_priority` ASC

---

## Done (Roles UX + employee IDs — prior)

### Sync Roles ↔ Employees
- [x] Removed Employees hardcoded role fallback — dropdown = `/api/roles` only
- [x] Empty-state + **Seed default roles** on both pages → `POST /api/roles/seed-defaults`
- [x] Migration `012_role_access_profile.sql` — `roles.access_profile` JSONB

### High-level access (Inbound / Outbound / Admin × None|View|Edit)
- [x] `api/modules/rbac/access_levels.go` — expands profile → `role_permissions`
- [x] `PUT /api/roles/:id/access` — save profile + rewrite permissions
- [x] Roles UI rebuilt: 3 dropdowns (no fine-grained checkbox grid)
- [x] Admin Edit ⇒ `*`; Admin View excludes `employees.manage` / `roles.manage`

### Auto employee ID
- [x] Format `{first4}{last4}{NN}` e.g. Rahul Sharma → `RAHUSHAR01`
- [x] `GET /api/employees/next-id?first=&last=` preview
- [x] Create form: first + last name; ID auto-generated server-side

### Enable on VM
```bash
# After deploy / git pull:
docker compose run --rm migrate   # or apply 011+012
# In UI: Roles → Seed default roles (if empty) → set Inbound/Outbound/Admin → Employees assign
```

---

## Done (RBAC — prior)

### Admin-configurable roles
- [x] `migrations/011_rbac_roles_permissions.sql` — `roles`, `role_permissions`; seeds admin/supervisor/picker/packer/qi/dispatcher (+ legacy wm/driver/billing)
- [x] Fixed permission catalog in `api/modules/rbac/catalog.go`
- [x] JWT still uses `roles.code` via `employees.wms_role` / `users.role`
- [x] Path enforcement still **default OFF** — `GOWMS_RBAC=1`

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
