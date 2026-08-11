# goWMS — Edge Case Analysis, Optimization & UX Improvement Report

**Generated:** August 11, 2026  
**Scope:** All 19 features across backend (Go) and frontend (React)  
**Priority:** Production readiness + floor-worker efficiency

---

## 1. Critical Edge Cases Missed Across Features

| Feature | Edge Case | Severity | Fix |
|---------|-----------|----------|-----|
| **03 Employees/Roles** | PIN collision (2 employees same PIN) | HIGH | Add unique constraint on `pin_hash + warehouse_id` |
| | PIN reset doesn't invalidate old JWTs | HIGH | Add token version/refresh token rotation |
| | Badge scan fallback when camera unavailable | MED | Add manual PIN entry as backup |
| **04 GRN** | Duplicate carton scan in same session | HIGH | Idempotent key: `(session_id, carton_no)` — exists but verify |
| | Weight mismatch >5% during box check | MED | Flag warning, allow override with reason |
| | Supplier part code ≠ internal SKU mapping lost | HIGH | Store `supplier_sku` in `grn_lines` for traceability |
| **06 Putaway** | Rule capacity race condition (concurrent putaways) | HIGH | `FOR UPDATE` lock on stock balances during suggest |
| | No validation target location has capacity | MED | Check `max_capacity_qty` before confirm |
| **08 Sales Orders** | Priority override without audit trail | HIGH | Add `priority_history` table with old/new/reason/user |
| | Delivery date in past allowed | MED | Validate `delivery_date >= today` |
| **09 Picking** | Partial pick leaves reserved stock orphaned | HIGH | `ReleaseReserved` on pick list cancel/expire |
| | Location drift detection false positive (zone-level) | MED | Allow zone-level match, not exact bin |
| **10 Packing** | Box weight not validated against sum of items | MED | Auto-calc weight from item master + qty |
| | No check box capacity exceeded | MED | Validate total weight/volume vs box limits |
| **11 Dispatch** | Trip complete without all stops visited | HIGH | Block complete until all stops visited or marked "skipped" |
| | POD signature not stored with DN | HIGH | Auto-link signature to `delivery_notes` on confirm |
| **12 Backorders** | Same item on multiple SOs → duplicate backorders | HIGH | Dedup by `(item_code, warehouse)` on auto-create |
| | Backorder fulfilled but SO not updated | MED | Link backorder fulfillment to SO `per_picked` |
| **13 Returns** | Restock to wrong location (damaged → good) | HIGH | Force returns location selection with type=hold/damaged |
| | Credit note not auto-created on restock | MED | Integrate with billing module |
| **17 Supplier** | `is_transporter=true` but no carrier fields filled | MED | Validate carrier fields when `is_transporter=true` |
| **18 Packing List Import** | Excel date parsing (US vs EU format) | HIGH | Detect format or require ISO dates |
| | Box Number column empty for some rows | MED | Skip rows with empty `box_number`, warn user |
| **19 Carrier** | Carrier assigned but vehicle not in carrier's fleet | MED | Validate `vehicle_no` against carrier's registered vehicles |

---

## 2. User Experience — Minimum Click Optimizations

### Current vs Target Click Counts

| Workflow | Current Clicks | Target Clicks | Optimization |
|----------|----------------|---------------|--------------|
| **GRN: Receive 10 items from PO** | 40+ | 12 | Packing list import (Feature 18) |
| **Create pick list for SO** | 8 | 3 | SO dropdown + auto-allocate |
| **Pick 20 items (scan)** | 20 scans + 20 clicks | 20 scans + 0 clicks | Auto-advance to next line after scan |
| **Pack box + print label** | 6 | 2 | Auto-print on load |
| **Dispatch trip with 5 stops** | 15 | 5 | Bulk load boxes, auto-generate DN |
| **Create item master** | 12 fields | 4 | Smart defaults + barcode scan |

### Specific UX Improvements

#### 2.1 Keyboard-First Flows (Warehouse Floor Workers)

```typescript
// Pick.tsx:
// - Enter key in scan field → auto-log pick (currently needs button click)
// - Tab order: Item → Bin → Qty → Enter = done
// - Escape = clear scan fields

// GRN.tsx:
// - Enter in carton field → add carton
// - Enter in item field → add line
// - F2 = Fill from PO (currently button click)
```

#### 2.2 Smart Defaults & Auto-Fill

```typescript
// Pick.tsx: Pre-fill next line after scan
const logScan = async () => {
  // ... existing code
  if (r.ok) {
    // AUTO-ADVANCE: Find next unpicked line and pre-fill
    const nextLine = selectedList.items?.find(
      (x: PickItem) => x.id > scanLineId && x.status !== 'picked'
    );
    if (nextLine) selectLine(nextLine);
  }
};

// GRN.tsx: Auto-create carton from Box Number in packing list import
// Pack.tsx: Auto-suggest box label from SO/customer
```

#### 2.3 One-Click Actions

```typescript
// Add to all list pages: "Quick Actions" column
// - Pick list: [Print] [Assign to Me] [Start Picking]
// - GRN session: [Import Packing List] [Close & Putaway] [Print Receiving Report]
// - Trip: [Load All Boxes] [Print Manifest] [Start Trip]
```

#### 2.4 Contextual Navigation (Reduce Page Switching)

```typescript
// Layout.tsx: Add breadcrumbs + quick jump
// Example: In Pick detail → "Pack" button jumps to Pack.tsx with pick_list_id pre-filled
// In GRN close modal → "Go to Putaway" already exists (good pattern)

// Add to sidebar: 
// - "My Tasks" showing: assigned pick lists, pending GRN, active trips
```

#### 2.5 Mobile-Optimized Scan Flows

- Camera scan stays open until user closes (not close after each scan)
- Haptic feedback on successful scan
- Large touch targets (min 48px) for scanner buttons
- Offline queue for scans when network drops

---

## 3. Implementation Priority Order

| Phase | Features | Effort | Rationale |
|-------|----------|--------|-----------|
| **P0: Foundation (Week 1-2)** | 03 Employees/Roles (RBAC + PIN), 08 Sales Orders (CRUD) | 5-6 days | Blocks all other features; RBAC required for production |
| **P1: Core Inbound (Week 2-3)** | 18 Packing List Import, 17 Supplier Master (enhanced) | 4-5 days | Eliminates 80% manual GRN entry; biggest ROI |
| **P2: Core Outbound (Week 3-4)** | 09 Picking (wave + print), 10 Packing (label print), 11 Dispatch (DN + POD) | 6-7 days | Completes order-to-cash loop |
| **P3: Automation (Week 4-5)** | 12 Backorders (auto-create), 15 Notifications (event wiring) | 3-4 days | Reduces manual follow-up |
| **P4: Polish (Week 5-6)** | 02 Item Master (edit + import), 05 QC Templates, 14 Analytics (outbound KPIs), 16 Import/Export, 13 Returns, 19 Carrier | 5-6 days | Nice-to-have, incremental value |

---

## 4. Quick Wins (Can Ship This Week)

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | **Fix Qi.tsx Reject Button Bug** | 5 min | Line 206: `() => {}` → `() => rejectInspection(inspection.id)` |
| 2 | **Add Enter Key Handlers** | 1 hr | Pick.tsx, GRN.tsx, Pack.tsx scan forms |
| 3 | **Auto-Advance Pick Line** | 30 min | After successful scan, pre-fill next unpicked line |
| 4 | **Add "Go to Pack" from Pick Detail** | 30 min | Pass `pick_list_id` to Pack.tsx |
| 5 | **Keyboard Shortcuts** | 1 hr | `Cmd+K` search, `N` new, `Esc` cancel globally |
| 6 | **Priority Badge Colors in SO List** | 1 hr | Visual priority at a glance |

---

## 5. Architecture Recommendations

### 5.1 Shared State Management
```typescript
// Add React Context for:
// - Current warehouse (persist in localStorage)
// - User role/permissions (for conditional rendering)
// - Active pick list / GRN session / trip (deep linking)
```

### 5.2 API Error Handling Standardization
```typescript
// api.ts: Add retry logic for network errors
// Add toast notifications for 401 (auto-logout), 403 (permission denied)
```

### 5.3 Optimistic Updates
```typescript
// For scan operations: update UI immediately, rollback on error
// Reduces perceived latency for floor workers
```

### 5.4 WebSocket for Real-Time
```typescript
// Notifications: Replace polling with WebSocket
// Live updates: Pick list status, GRN progress, trip location
```

---

## 6. Database Indexes Needed (Performance)

```sql
-- High impact missing indexes:
CREATE INDEX idx_grn_lines_session_item ON grn_lines(grn_session_id, item_code);
CREATE INDEX idx_pick_list_items_list_status ON pick_list_items(pick_list_id, status);
CREATE INDEX idx_stock_balances_item_wh ON stock_location_balances(item_code, warehouse_id);
CREATE INDEX idx_sales_orders_priority_date ON sales_orders(priority DESC, delivery_date);
CREATE INDEX idx_backorders_so_status ON backorders(sales_order_no, status);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
```

---

## 7. Summary: Top 5 Impact Items

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 1 | **Feature 18: Packing List Import** | Eliminates 80% GRN manual entry | 4-5 days |
| 2 | **Feature 03: RBAC + PIN Login** | Production readiness, security | 5-6 days |
| 3 | **Feature 08: Sales Orders CRUD** | Unblocks picking, backorders, dispatch | 3-4 days |
| 4 | **Keyboard-First Scan Flows** | 50% faster floor operations | 2-3 days |
| 5 | **Feature 11: DN Auto-Gen + POD** | Completes delivery proof loop | 4-5 days |

---

## 8. Files Referenced

### Implementation Plans (19 features)
- `docs/implementation/00_IMPLEMENTATION_INDEX.md`
- `docs/implementation/01_FEATURE_WAREHOUSE_MASTER.md` — DONE
- `docs/implementation/02_FEATURE_ITEM_MASTER.md` — DONE (minor gaps)
- `docs/implementation/03_FEATURE_EMPLOYEE_ROLES.md` — PARTIAL (major gaps)
- `docs/implementation/04_FEATURE_GRN_INBOUND.md` — DONE (minor gap)
- `docs/implementation/05_FEATURE_QC_TEMPLATES.md` — PARTIAL
- `docs/implementation/06_FEATURE_PUTAWAY.md` — DONE (minor gap)
- `docs/implementation/07_FEATURE_STOCK_BALANCES.md` — DONE
- `docs/implementation/08_FEATURE_SALES_ORDERS.md` — PARTIAL (schema only)
- `docs/implementation/09_FEATURE_PICKING.md` — PARTIAL
- `docs/implementation/10_FEATURE_PACKING.md` — PARTIAL
- `docs/implementation/11_FEATURE_DISPATCH.md` — PARTIAL
- `docs/implementation/12_FEATURE_BACKORDERS.md` — PARTIAL
- `docs/implementation/13_FEATURE_RETURNS.md` — NOT DONE
- `docs/implementation/14_FEATURE_ANALYTICS.md` — PARTIAL
- `docs/implementation/15_FEATURE_NOTIFICATIONS.md` — PARTIAL
- `docs/implementation/16_FEATURE_IMPORT_EXPORT.md` — NOT DONE
- `docs/implementation/17_FEATURE_SUPPLIER_MASTER.md` — PARTIAL
- `docs/implementation/18_FEATURE_PACKING_LIST_IMPORT.md` — NOT DONE
- `docs/implementation/19_FEATURE_CARRIER_DELIVERY.md` — NOT DONE

### Key Frontend Pages Analyzed
- `web/src/pages/Pick.tsx` (367 lines)
- `web/src/pages/GRN.tsx` (684 lines)
- `web/src/pages/Items.tsx` (338 lines)
- `web/src/components/Layout.tsx` (118 lines)
- `web/src/services/api.ts` (204 lines)

---

## 9. Next Steps

1. **Immediate:** Apply quick wins (Qi.tsx bug, Enter key handlers, auto-advance)
2. **Week 1-2:** Feature 03 (RBAC) + Feature 08 (Sales Orders) — parallel tracks
3. **Week 2-3:** Feature 18 (Packing List Import) + Feature 17 (Supplier Master)
4. **Week 3-4:** Feature 09/10/11 (Outbound completion)
5. **Ongoing:** UX polish per keyboard-first spec

---

*Document generated by opencode analysis. For questions or implementation start, reference this file.*