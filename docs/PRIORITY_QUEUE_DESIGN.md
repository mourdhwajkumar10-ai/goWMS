# Priority Queue for Order Fulfillment — Feature Design

**goWMS | Spare Parts Warehouse (₹20 Cr)**  
**Date:** 2026-08-11

---

## 1. Problem Statement

Currently, orders are fulfilled FIFO (first-in, first-out). In a real spare parts warehouse:
- A ₹50,000 engine part order from a key customer gets picked after a ₹200 brake pad order
- Emergency orders (vehicle breakdown, dealer urgent request) wait in queue
- Bulk orders from big customers block smaller but time-sensitive orders
- Sales team has no way to signal "this order is critical"

**Need:** A priority system so the warehouse fulfills the most important orders first, regardless of when they were received.

---

## 2. Priority Model

### 2.1 Scale: 1–10

| Priority | Label | Color | Use Case | SLA |
|----------|-------|-------|----------|-----|
| **10** | 🔴 Emergency | Red | Vehicle breakdown, safety-critical part | 2 hours |
| **9** | 🔴 Critical | Red | Key customer escalation, dealer stockout | 4 hours |
| **8** | 🟠 Urgent | Orange | Same-day delivery promise | Same day |
| **7** | 🟠 High | Orange | Premium/VIP customer orders | Same day |
| **6** | 🟡 Elevated | Yellow | Bulk orders (>₹10,000) | Next day AM |
| **5** | 🟡 Normal+ | Yellow | Standard orders with date commitment | Next day |
| **4** | ⚪ Normal | Grey | Regular dealer orders | 2 days |
| **3** | ⚪ Low | Grey | Stock replenishment, non-urgent | 3 days |
| **2** | ⚪ Bulk/Low | Grey | Bulk import, no urgency | 5 days |
| **1** | ⚪ Background | Grey | Internal transfers, testing | Best effort |

### 2.2 Default Priority Rules (Auto-assign on Import)

```
IF customer_type = "Key Account"       → default 7
IF order_value > ₹50,000               → default 7
IF order_value > ₹10,000               → default 6
IF delivery_date - today ≤ 1 day       → default 8
IF delivery_date - today ≤ 3 days      → default 5
ELSE                                    → default 4
```

> Admin can override defaults. Manual override always wins.

### 2.3 Priority Decay (Optional — Advanced)

For orders sitting unfulfilled, priority auto-escalates:
- Every 24 hours past SLA → priority +1 (capped at 10)
- Prevents low-priority orders from being forgotten indefinitely

---

## 3. Data Model Changes

### 3.1 Sales Order (new fields)

```json
{
  "name": "SO-2026-00001",
  "customer": "Ganju Automotives",
  "priority": 8,
  "priority_label": "Urgent",
  "priority_set_by": "admin",
  "priority_set_at": "2026-08-11T10:30:00Z",
  "priority_reason": "Same-day delivery promised to dealer",
  "delivery_deadline": "2026-08-11T18:00:00Z",
  "auto_priority": true,
  "status": "Confirmed",
  "items": [...]
}
```

### 3.2 Pick List (priority-aware)

```json
{
  "name": "PICK-2026-00001",
  "sales_order": "SO-2026-00001",
  "priority": 8,
  "pick_sequence": 1,
  "assigned_to": "picker_rahul",
  "status": "Allocated"
}
```

### 3.3 New Table: Priority Override Log

| Field | Type | Description |
|-------|------|-------------|
| order_id | text | Sales Order reference |
| old_priority | int | Previous priority |
| new_priority | int | Updated priority |
| changed_by | text | User who changed |
| changed_at | datetime | Timestamp |
| reason | text | Why the change |

---

## 4. UI Design

### 4.1 Sales Order List View

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Sales Orders                                            📷 Scan + New  │
├─────────────────────────────────────────────────────────────────────────┤
│ Filters: [All ▾] [Priority ▾] [Customer ▾] [Status ▾] [Date ▾]       │
├──────┬──────────────┬────────────┬──────┬────────┬───────┬─────────────┤
│ Pri  │ SO No        │ Customer   │Items │ Value  │ Status│ Action      │
├──────┼──────────────┼────────────┼──────┼────────┼───────┼─────────────┤
│ 🔴 8 │ SO-2026-0005 │ Ganju Auto │  3   │ ₹45,000│ Conf  │ Pick ▪ Edit │
│ 🟠 7 │ SO-2026-0004 │ Raj Parts  │  5   │ ₹72,000│ Conf  │ Pick ▪ Edit │
│ ⚪ 4 │ SO-2026-0003 │ Sharma & Co│  2   │ ₹8,000 │ Draft │ Edit        │
│ ⚪ 3 │ SO-2026-0002 │ Internal   │  1   │ ₹2,200 │ Draft │ Edit        │
└──────┴──────────────┴────────────┴──────┴────────┴───────┴─────────────┘
                                    Sort: Priority (High → Low) by default
```

### 4.2 Priority Badge Component

```
Inline display:   🔴 8 — Urgent
Compact:          [8]
With color bar:   ████████░░ 8/10
```

### 4.3 Priority Selector (on Import / Edit)

```
┌─ Set Priority ──────────────────────────────┐
│                                              │
│  [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]  │
│   ⚪  ⚪  ⚪  ⚪  🟡  🟡  🟠  🔴  🔴  🔴    │
│                              ▲               │
│                          selected: 7         │
│                                              │
│  Label: 🟠 High                              │
│  SLA: Same day                               │
│                                              │
│  Reason: [VIP customer — same day promise ]  │
│                                              │
│  ☐ Override auto-assigned priority           │
│                                              │
│  [Cancel]                    [Apply]         │
└──────────────────────────────────────────────┘
```

### 4.4 Pick List Generation — Priority View

When generating pick lists, show priority-sorted queue:

```
┌─ Generate Pick Lists ──────────────────────────────────────────────┐
│                                                                     │
│  Pending Orders (sorted by priority):                               │
│                                                                     │
│  ☑  🔴 8  SO-0005  Ganju Automotives   3 items  ₹45,000  2h ago  │
│  ☑  🟠 7  SO-0004  Raj Parts           5 items  ₹72,000  4h ago  │
│  ☐  ⚪ 4  SO-0003  Sharma & Co         2 items  ₹8,000   1d ago  │
│  ☐  ⚪ 3  SO-0002  Internal            1 item   ₹2,200   2d ago  │
│                                                                     │
│  ☑ Auto-select orders with priority ≥ [6]                          │
│  ☑ Group picks by zone for efficiency                               │
│                                                                     │
│  Selected: 2 orders → Estimated: 1 pick list, ~15 min              │
│                                                                     │
│  [Cancel]                              [Generate Pick Lists]        │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.5 Pick List Dashboard — Priority Queue

```
┌─ Pick Queue ─────────────────────────────────────────────────────┐
│                                                                   │
│  ⏱ SLA Breach Warning: 1 order past deadline                     │
│                                                                   │
│  PICK-0001  🔴 8  SO-0005  Ganju  [████████░░] 80%  ⏰ 45m left │
│  PICK-0002  🟠 7  SO-0004  Raj    [██░░░░░░░░] 20%  ⏰ 2h left  │
│  PICK-0003  ⚪ 4  SO-0003  Sharma [░░░░░░░░░░]  0%  ⏰ No SLA   │
│                                                                   │
│  [Pick Next Highest Priority]  [View All]                        │
└───────────────────────────────────────────────────────────────────┘
```

---

## 5. Import Flow with Priority

### 5.1 CSV/Excel Import

```csv
so_number,customer,item_code,qty,delivery_date,priority
SO-0001,Ganju Automotives,BRAKE-PAD-001,10,2026-08-12,8
SO-0002,Raj Parts,FILTER-OIL-002,50,2026-08-15,
SO-0003,Sharma & Co,BRAKE-PAD-003,5,2026-08-20,3
```

- If `priority` column is empty → auto-assign based on rules
- If `priority` column has value → use it (manual override)

### 5.2 Import UI

```
┌─ Import Sales Orders ──────────────────────────────────────────┐
│                                                                 │
│  📄 Drop CSV/Excel here or [Browse Files]                      │
│                                                                 │
│  ┌─ Auto-Priority Rules ──────────────────────────────────┐    │
│  │ ☑ Enable auto-priority assignment                      │    │
│  │                                                        │    │
│  │ Key Account customer        → default [7]              │    │
│  │ Order value > ₹50,000       → default [7]              │    │
│  │ Order value > ₹10,000       → default [6]              │    │
│  │ Delivery within 1 day       → default [8]              │    │
│  │ Delivery within 3 days      → default [5]              │    │
│  │ All others                  → default [4]              │    │
│  │                                                        │    │
│  │ ☑ Apply priority decay (escalate +1 per 24h past SLA) │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Preview: 12 orders imported, priorities assigned:              │
│  🔴 8×2  🟠 7×3  🟡 6×2  ⚪ 4×4  ⚪ 3×1                       │
│                                                                 │
│  [Cancel]                          [Import & Assign Priorities] │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Business Rules Engine

### 6.1 Priority Assignment Rules (Configurable)

```yaml
# priority_rules.yaml
rules:
  - name: "Key Account Rush"
    condition: "customer.type == 'Key Account' AND delivery_within(1d)"
    priority: 9
    reason: "Key account with same-day deadline"

  - name: "High Value"
    condition: "order_value > 50000"
    priority: 7
    reason: "High-value order"

  - name: "Dealer Stockout"
    condition: "customer.type == 'Dealer' AND tags contains 'stockout'"
    priority: 9
    reason: "Dealer facing stockout"

  - name: "Bulk Replenishment"
    condition: "customer.type == 'Internal' AND order_value < 5000"
    priority: 2
    reason: "Internal stock replenishment"

  - name: "Default"
    condition: "true"
    priority: 4
    reason: "Standard order"
```

### 6.2 Fulfillment Sequence Algorithm

```
function getNextOrderToPick():
    pendingOrders = getOrdersWithStatus("Confirmed")
    
    // Sort by: Priority DESC → Deadline ASC → Order Value DESC
    sorted = pendingOrders.sort(
        by: priority DESC,
        then_by: delivery_deadline ASC,
        then_by: order_value DESC
    )
    
    // Filter out orders with unmet dependencies
    ready = sorted.filter(order => 
        order.items.all(item => item.available_stock > 0)
    )
    
    return ready.first()
```

### 6.3 Conflict Resolution

| Scenario | Rule |
|----------|------|
| Two orders same priority | Earlier deadline wins |
| Same priority + same deadline | Higher value wins |
| Same everything | First created wins |
| Priority changed mid-pick | Current pick completes; re-sort queue |
| Emergency order arrives | Interrupt current pick (if picker confirms) |

---

## 7. API Endpoints

### 7.1 Set Priority

```
PATCH /api/sales-orders/{id}/priority
{
  "priority": 8,
  "reason": "Customer escalation",
  "set_by": "admin"
}
```

### 7.2 Bulk Priority Update

```
POST /api/sales-orders/bulk-priority
{
  "order_ids": ["SO-001", "SO-002", "SO-003"],
  "priority": 7,
  "reason": "Festival season rush"
}
```

### 7.3 Get Priority Queue

```
GET /api/pick-queue?min_priority=6&status=confirmed
Response: [
  {"so": "SO-005", "priority": 8, "deadline": "...", "items": 3},
  {"so": "SO-004", "priority": 7, "deadline": "...", "items": 5}
]
```

### 7.4 Import with Priority

```
POST /api/sales-orders/import
Content-Type: multipart/form-data
Body: file=orders.csv, auto_priority=true
```

---

## 8. Dashboard Widgets

### 8.1 Priority Distribution Widget

```
┌─ Priority Distribution ────────┐
│                                 │
│  🔴 Emergency/Critical  ██ 2   │
│  🟠 Urgent/High         ████ 4 │
│  🟡 Elevated/Normal+    ██████ 6│
│  ⚪ Normal/Low          ██████████ 10│
│                                 │
│  Total pending: 22 orders       │
│  SLA breach risk: 2             │
└─────────────────────────────────┘
```

### 8.2 SLA Monitor Widget

```
┌─ SLA Monitor ──────────────────────────────────┐
│                                                  │
│  ⚠️ OVERDUE                                     │
│  SO-0005  🔴 8  Ganju  2h overdue  [Rush Pick] │
│                                                  │
│  ⏰ DUE TODAY                                    │
│  SO-0004  🟠 7  Raj    Due 6:00 PM             │
│  SO-0008  🟡 6  Sharma Due 8:00 PM             │
│                                                  │
│  ✅ ON TRACK                                     │
│  18 orders within SLA                           │
└──────────────────────────────────────────────────┘
```

---

## 9. Implementation Phases

### Phase 1 — MVP (Week 1)
- [ ] Add `priority` field (1-10) to Sales Order
- [ ] Priority badge in list view (color-coded)
- [ ] Manual priority set/edit on order
- [ ] Sort pick queue by priority
- [ ] Priority column in CSV import

### Phase 2 — Auto-Assignment (Week 2)
- [ ] Configurable auto-priority rules
- [ ] Auto-assign on import based on rules
- [ ] Priority override with reason logging
- [ ] Pick list generation respects priority order

### Phase 3 — SLA & Monitoring (Week 3)
- [ ] SLA deadlines per priority level
- [ ] SLA breach alerts (notifications)
- [ ] Priority decay (auto-escalate overdue)
- [ ] Dashboard widgets (priority distribution, SLA monitor)

### Phase 4 — Advanced (Week 4)
- [ ] Emergency interrupt (pause current pick for priority 9-10)
- [ ] Priority-based resource allocation (best pickers for high-priority)
- [ ] Customer-facing priority visibility (portal)
- [ ] Analytics: fulfillment time by priority level

---

## 10. For Your ₹20Cr Warehouse — Specific Recommendations

### What to Prioritize (Pun Intended)

1. **Start simple:** Manual priority (1-10) on Sales Order + sort by priority in pick queue. This alone solves 80% of the problem.

2. **Key accounts first:** Your top 10-15 customers probably drive 60-70% of revenue. Tag them as "Key Account" and auto-assign priority 7+.

3. **Same-day cutoff:** If you promise same-day delivery for orders before 2 PM, auto-assign priority 8 for those.

4. **Don't over-engineer:** Skip priority decay and interrupt-based picking for now. Manual override + auto-assignment rules are enough at ₹20Cr.

5. **Measure it:** Track "average fulfillment time by priority" after 1 month. If priority 8 orders aren't shipping faster than priority 4, the system isn't working.

### Expected Impact

| Metric | Before | After Priority Queue |
|--------|--------|---------------------|
| High-priority order fulfillment time | Same as all orders | 50-70% faster |
| Customer complaints (delivery delay) | Baseline | 30-40% reduction |
| Warehouse picker idle time | Some | Reduced (clear priority) |
| Revenue from key accounts | Baseline | 10-15% increase (better service) |
