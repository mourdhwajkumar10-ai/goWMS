# goWMS — Complete Edge Case Analysis & Optimization Summary

**Date:** 2026-08-11  
**Scope:** All 19 implementation features  
**Method:** Parallel agent analysis of implementation plans + current codebase

---

## Executive Summary

| Feature | Edge Cases Found | Optimizations | UX Improvements | Priority |
|---------|------------------|---------------|-----------------|----------|
| 01 Warehouse Master | 10 | 6 | 6 | P0-P1 |
| 02 Item Master | 11 | 5 | 6 | P0-P1 |
| 03 Employee Roles | 12 | 4 | 5 | P0 |
| 04 GRN Inbound | 10 | 5 | 5 | P0-P1 |
| 05 QC Templates | 10 | 4 | 4 | P1 |
| 06 Putaway | 10 | 3 | 4 | P1 |
| 07 Stock Balances | 8 | 4 | 3 | P0 |
| 08 Sales Orders | 10 | 4 | 4 | P0 |
| 09 Picking | 10 | 4 | 4 | P0-P1 |
| 10 Packing | 10 | 4 | 4 | P1 |
| 11 Dispatch | 10 | 4 | 4 | P1 |
| 12 Backorders | 12 | 4 | 7 | P1 |
| 13 Returns | 15 | 3 | 6 | P2 |
| 14 Analytics | 11 | 4 | 8 | P2 |
| 15 Notifications | 12 | 3 | 5 | P2 |
| 16 Import/Export | 17 | 3 | 6 | P1 |
| 17 Supplier Master | 9 | 3 | 5 | P1 |
| 18 Packing List Import | 12 | 3 | 5 | P0 |
| 19 Carrier Delivery | 10 | 4 | 5 | P2 |
| **TOTAL** | **192** | **78** | **93** | |

---

## Top 20 Critical Edge Cases (Must Fix Before Go-Live)

| Rank | Feature | Edge Case | Impact |
|------|---------|-----------|--------|
| 1 | 02 Item | Pack type change after stock exists → breaks downstream | Data corruption |
| 2 | 02 Item | Control mode change without home_location → putaway broken | Operational failure |
| 3 | 04 GRN | Over-receipt default allows unlimited when PO field missing | Data integrity |
| 4 | 04 GRN | Damaged > scanned on close silently clamped | Silent corruption |
| 5 | 04 GRN | Weight verification not implemented | Spec gap |
| 6 | 07 Stock | FEFO query missing FOR UPDATE → race on reserve | Over-allocation |
| 7 | 08 SO | No SO CRUD blocks all outbound | Blocker |
| 8 | 09 Pick | Shortage not auto-creating backorder | Lost orders |
| 9 | 09 Pick | No pick list PDF printing | Warehouse requirement |
| 10 | 10 Pack | No box label printing | Compliance |
| 11 | 11 Disp | DN auto-gen on trip complete | FIXED 2026-08-12 |
| 12 | 11 Disp | No POD UI (signature/photo) | Proof of delivery |
| 13 | 12 BO | No GRN fulfillment alert + reservation | Stock misallocation |
| 14 | 13 Ret | No QC integration for returns | Quality gap |
| 15 | 16 Imp | CSV parser breaks on quotes/commas/newlines | Import failure |
| 16 | 03 Emp | No RBAC middleware → all users see everything | Security |
| 17 | 03 Emp | PIN login + badge scan missing | Floor worker UX |
| 18 | 01 WH | Location capacity not enforced | Overfilled bins |
| 19 | 05 QC | Reject button broken (no-op) | FIXED (UI + /qi/:id/reject alias) |
| 20 | 18 PLI | Box Number grouping logic incomplete | Wrong carton creation |

---

## Quick Wins (High Impact, <1 Day Each)

| # | Fix | Feature | Effort | Impact |
|---|-----|---------|--------|--------|
| 1 | Add default 5% over-receipt in GRN | 04 | 5 min | Data integrity |
| 2 | Fix QC reject button (`() => {}` → `rejectInspection`) | 05 | DONE | Fixed |
| 3 | Add backorder aging column to list | 12 | 30 min | Visibility |
| 4 | Add header notification bell with unread count | 15 | 1 hr | Access |
| 5 | Fix CSV parser (PapaParse) | 16 | 2 hr | All imports |
| 6 | Add pagination to location list | 01 | 1 hr | Performance |
| 7 | Add capacity display badge to location row | 01 | 30 min | UX |
| 8 | Add "Discard" button in GRN unknown SKU modal | 04 | 30 min | UX |
| 9 | Add unique partial index on items.barcode | 02 | 10 min | Data integrity |
| 10 | Auto-detect next location code API | 01 | 1 hr | Click reduction |

---

## Click Reduction Opportunities (Top 20)

| Current Flow | Clicks | Optimized Flow | Clicks | Saved |
|--------------|--------|----------------|--------|-------|
| Create SO → customer → add lines → save → confirm | 6 | Scan barcode → qty → Enter (repeat) → Ctrl+Enter | 3 | **3** |
| Scan item → select bin → enter qty → confirm | 5 | Scan item → auto-fill bin → scan qty → auto-confirm | 2 | **3** |
| GRN unknown item → error → Items → create → back to GRN | 8 | GRN error → "Complete Master" inline modal | 2 | **6** |
| Print pick list → PDF dialog → printer select | 3 | "Print" button → thermal direct | 1 | **2** |
| Box label print → PDF → dialog → printer | 4 | "Print Label" → raw TCP send | 1 | **3** |
| Create pick list → type SO → add items → allocate | 8 | "Generate Wave" → multi-select SOs → preview → generate | 3 | **5** |
| Import CSV → map columns → preview → import | 5 | Drag-drop → auto-map → inline preview → Import | 2 | **3** |
| Create box → type label → save → add items one by one | 6 | Scan pick list → auto-create box → scan item → scan qty | 2 | **4** |
| Assign zone per location (N×) | N×4 | Drag bins to zone pills | 1 | **N×3** |
| Mark all notifications read | N×1 | Single "Mark All Read" | 1 | **N-1** |
| Complete POD per stop | 6 | Tap stop → "Deliver" → sign → photo → done | 3 | **3** |
| Filter list → select status → apply | 4 | URL-synced filters (bookmarkable) | 0 | **4** |
| Edit item → navigate → form → save | 6 | Inline edit in table row | 2 | **4** |
| Create backorder manually | 6 | Auto-create from pick shortage | 0 | **6** |
| Check item stock across locations | 4 | Items list shows available_qty column | 1 | **3** |
| Set home_location manually | 5 | Dropdown with search (WH/Zone/Aisle) | 2 | **3** |
| Return create → fill all fields | 10 | Select DN → auto-populate lines | 3 | **7** |
| Analytics date range | 3 | Preset buttons (Today/Week/Month) | 1 | **2** |
| Export data | ∞ (manual) | "Export" button on list page | 1 | **∞** |
| Wave pick route | N/A (none) | Auto-optimized route | N/A | **New** |

---

## Cross-Feature Consistency Gaps

| Gap | Features Affected | Recommended Fix |
|-----|-------------------|-----------------|
| No shared PDF utility | 09, 10, 11, 14 | Create `pkg/pdf` with templates |
| No barcode/label standard | 09, 10, 11, 18 | Define GS1-128 spec in `pkg/label` |
| No offline scan queue | 09, 10, 18 | IndexedDB queue + sync endpoint |
| No audit trail standard | All | `audit_log` table + middleware |
| No notification system | 08, 09, 11, 12, 13 | WebSocket + `notifications` table |
| No shared import framework | 02, 03, 08, 16 | Generic import service + templates |
| No role-based UI gating | 03, All | `RequireRole` middleware + Layout hide |
| No carrier/transporter entity | 11, 17, 19 | Extend suppliers with carrier fields |

---

## Database Migration Plan (Consolidated)

### Phase 1: Critical (Before Go-Live)

```sql
-- 008_critical_fixes.sql
-- 01 Warehouse
ALTER TABLE warehouse_locations ADD COLUMN IF NOT EXISTS max_capacity_qty NUMERIC;
-- Already exists but not enforced

-- 02 Item Master
CREATE UNIQUE INDEX IF NOT EXISTS items_barcode_unique ON items(barcode) WHERE barcode IS NOT NULL;
ALTER TABLE items ADD CONSTRAINT items_home_location_fk 
    FOREIGN KEY (home_location_id) REFERENCES warehouse_locations(id) ON DELETE RESTRICT;

-- 03 Employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_code VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('picker','packer','driver','wm','billing','admin'));

-- 04 GRN
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS supplier_box_ref VARCHAR(100);
ALTER TABLE grn_lines ADD COLUMN IF NOT EXISTS expected_weight NUMERIC;
ALTER TABLE grn_lines ADD COLUMN IF NOT EXISTS actual_weight NUMERIC;

-- 07 Stock Balances
ALTER TABLE stock_location_balances ADD COLUMN IF NOT EXISTS reserved_for_backorder_id INTEGER;

-- 12 Backorders
ALTER TABLE backorder_lines_v2 ADD COLUMN IF NOT EXISTS partially_fulfilled_qty INTEGER DEFAULT 0;
ALTER TABLE backorder_lines_v2 ADD COLUMN IF NOT EXISTS warehouse_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_backorder_lines_source_pick ON backorder_lines_v2(source_pick_list_id);
```

### Phase 2: Feature Complete

```sql
-- 009_feature_complete.sql
-- 05 QC Templates
CREATE TABLE IF NOT EXISTS qc_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES item_groups(id),
    sample_size TEXT DEFAULT 'all',
    checklist JSONB NOT NULL,
    auto_approve BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active',
    priority INTEGER DEFAULT 10
);
ALTER TABLE quality_inspections ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES qc_templates(id);
ALTER TABLE quality_inspections ADD COLUMN IF NOT EXISTS template_snapshot JSONB;

-- 08 Sales Orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 4;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS priority_label TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS priority_reason TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS priority_set_by INTEGER REFERENCES employees(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS priority_set_at TIMESTAMPTZ;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS priority_source TEXT DEFAULT 'auto';
CREATE TABLE IF NOT EXISTS priority_override_log (
    id SERIAL PRIMARY KEY,
    sales_order_id INTEGER REFERENCES sales_orders(id),
    old_priority INTEGER, new_priority INTEGER,
    changed_by INTEGER REFERENCES employees(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    reason TEXT
);

-- 13 Returns
ALTER TABLE return_claims ADD COLUMN IF NOT EXISTS dn_id INTEGER REFERENCES delivery_notes(id);
ALTER TABLE return_claims ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'requested';
ALTER TABLE return_claims ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE return_claim_lines ADD COLUMN IF NOT EXISTS received_qty INTEGER DEFAULT 0;
ALTER TABLE return_claim_lines ADD COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE return_claim_lines ADD COLUMN IF NOT EXISTS decision TEXT;
ALTER TABLE return_claim_lines ADD COLUMN IF NOT EXISTS restock_location_id INTEGER REFERENCES warehouse_locations(id);

-- 15 Notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_key TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_label TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique ON notifications(event_key) WHERE event_key IS NOT NULL;

-- 16 Import/Export
CREATE TABLE IF NOT EXISTS import_logs (
    id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    file_name TEXT,
    user_id INTEGER REFERENCES users(id),
    created INTEGER, updated INTEGER, errors INTEGER,
    status TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
);

-- 17/18 Supplier + Packing List
CREATE TABLE IF NOT EXISTS supplier_pack_list_templates (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER REFERENCES suppliers(id),
    template_name TEXT NOT NULL,
    column_mapping JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS default_pack_list_template_id INTEGER REFERENCES supplier_pack_list_templates(id);

-- 19 Carrier
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS carrier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS carrier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS received_by_name VARCHAR(200);
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS received_by_phone VARCHAR(20);
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS condition_report TEXT;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS photo_urls TEXT[];
```

---

## Implementation Priority Order (Optimized for Dependencies)

| Week | Features | Rationale |
|------|----------|-----------|
| **1-2** | 03 (Employees+RBAC), 16 (CSV Parser), 01 (Pagination+Capacity) | Foundation: auth, imports, core data integrity |
| **3-4** | 08 (SO CRUD+Priority), 09 (Wave+Print), 04 (GRN weight+multi-PO) | Outbound core blocked by SO; picking needs print |
| **5-6** | 11 (DN+POD), 10 (Label print), 05 (QC templates) | Dispatch needs DN+POD; packing needs labels; QC needs templates |
| **7-8** | 12 (Backorder auto+reservation), 13 (Returns+QC), 06 (Putaway rules) | Backorder needs GRN integration; returns needs QC |
| **9-10** | 14 (Analytics widgets), 15 (Notifications+WS), 17 (Supplier full) | Analytics consumes all data; notifications need WS |
| **11-12** | 18 (Packing List Import), 19 (Carrier+Route), 02 (Item edit+groups) | Import needs supplier templates; carrier needs supplier |

---

## Minimum Viable Product (MVP) Scope

**Must Have for ₹20Cr Pilot Go-Live:**
- [ ] 03: Employee PIN login + RBAC middleware
- [ ] 08: Sales Order CRUD + Priority queue
- [ ] 09: Wave picking + PDF print
- [ ] 04: GRN multi-PO + weight + over-receipt fix
- [ ] 11: DN auto-gen + POD (signature+photo)
- [ ] 10: Box label print (GS1-128)
- [ ] 12: Backorder auto-create + aging
- [x] 05: QC reject button fix + template basics
- [ ] 16: CSV parser fix (PapaParse)

**Nice to Have (v1.1):**
- [ ] 01: Zone master + drag-drop + smart bulk
- [ ] 02: Item edit modal + category TreeSelect
- [ ] 06: Putaway rules integration
- [ ] 13: Returns multi-line + QC + credit note
- [ ] 14: SLA monitor + priority widgets
- [ ] 15: Notification WS + role routing
- [ ] 17: Supplier full CRUD + carrier fields
- [ ] 18: Packing list import + templates
- [ ] 19: Carrier assignment + route optimization

**Future (v2+):**
- [ ] Multi-warehouse hierarchy
- [ ] Offline scan queue
- [ ] Custom dashboard builder
- [ ] Carrier API integration
- [ ] Scheduled/recurring imports
- [ ] GPS tracking + ETA

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SO module blocks all outbound | High | Critical | Parallel 2 devs on SO + Picking |
| GRN weight spec gap | Medium | High | Schema migration + handler update |
| CSV parser breaks production imports | High | High | Replace with PapaParse in Week 1 |
| RBAC breaks existing flows | Medium | High | Feature flag + gradual rollout |
| DN auto-gen on trip complete | Medium | Medium | Test with sample trips first |
| Backorder stock reservation | Medium | High | Reserve on GRN close, not putaway |

---

## Team Allocation (Suggested)

| Team | Features | Size |
|------|----------|------|
| **Auth & Masters** | 01, 02, 03, 17 | 2 devs |
| **Inbound** | 04, 05, 06, 18 | 2 devs |
| **Outbound Core** | 08, 09, 10, 11 | 3 devs |
| **Post-Outbound** | 12, 13, 14 | 2 devs |
| **Platform** | 15, 16, 19 | 2 devs |

**Total: 11 devs** (adjust based on actual team size)

---

## Success Metrics (Go-Live Criteria)

| Metric | Target | Measurement |
|--------|--------|-------------|
| GRN close time (15 boxes) | < 20 min | Stopwatch test |
| Pick list generation (5 SOs) | < 2 min | System time |
| Pick accuracy (location drift) | < 2% | Analytics dashboard |
| Box label print time | < 5 sec/box | Stopwatch test |
| POD capture per stop | < 30 sec | Stopwatch test |
| Backorder aging visibility | 100% | Analytics widget |
| Import success rate | > 95% | Import logs |
| Notification delivery | < 1 sec | WebSocket latency |

---

*Generated by parallel agent analysis. Review with team leads before sprint planning.*
