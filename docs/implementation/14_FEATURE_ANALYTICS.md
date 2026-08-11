# Feature 14 — Analytics

**Spec References:** goWMS_Outbound_Analysis.md §10
**Status:** PARTIAL (inventory health only, no outbound KPIs)
**Priority:** LOW

---

## Current Implementation

### Backend (api/modules/analytics/handler.go — 212 lines)
| Endpoint | Metric |
|----------|--------|
| `/analytics/dashboard` | TotalItems, TotalStock, PendingGRN, OpenPickLists, PendingBackorders, DueCycleCounts |
| `/analytics/fast-moving` | Items classified "fast" by turnover |
| `/analytics/slow-moving` | Items classified "slow" |
| `/analytics/dead-stock` | Items classified "dead" |
| `/analytics/expiry` | Top 50 expiring items |
| `/analytics/fill-rate` | % orders with 100% fill |
| `/analytics/pick-accuracy` | % pick scans without location drift |
| `/analytics/warehouse-metrics` | Bin utilization, pick accuracy per warehouse |
| `/analytics/supplier-performance` | GRN accuracy per supplier |

### Backend (api/modules/reports/handler.go — 84 lines)
- `/reports/grn-summary` — GRN session summary
- `/reports/pick-performance` — Pick scan logs

### Frontend
- `Analytics.tsx` — Tabs for Fast/Slow/Dead/Expiry + dashboard KPIs
- `Reports.tsx` — Tabs for GRN Summary + Pick Performance

---

## Gaps

### 1. No Outbound-Specific KPIs
- goWMS_Outbound_Analysis.md §10 lists missing metrics:
  - Order Fulfillment Rate (% shipped on time)
  - Average Pick Time (per item/order)
  - Packing Throughput (boxes/hour)
  - Dispatch SLA (% trips on schedule)
  - Return Rate (% returned)
- **Plan:**
  1. Add new analytics endpoints:
    - `/analytics/fulfillment-rate` — % SOs with per_picked=100 within delivery_date
    - `/analytics/pick-time` — avg time from pick start to complete
    - `/analytics/dispatch-sla` — % trips completed before delivery_date
    - `/analytics/return-rate` — % DNs with returns
  2. Add outbound tab to Analytics.tsx
- **Effort:** 1-2 days

### 2. No Priority Distribution Widget
- PRIORITY_QUEUE_DESIGN.md §8.1 defines priority distribution widget
- **Plan:** Add to dashboard or analytics page
- **Effort:** 0.5 day

### 3. No SLA Monitor
- PRIORITY_QUEUE_DESIGN.md §8.2 defines SLA monitor widget
- **Plan:** Add overdue orders widget to dashboard
- **Effort:** 0.5 day

---

## Conflict Analysis

No conflicts — analytics is read-only, depends on data from other modules.

---

## Acceptance Criteria

- [x] Dashboard KPIs (stock, GRN, picks, backorders)
- [x] Fast/slow/dead stock classification
- [x] Expiry warnings
- [x] Fill rate and pick accuracy
- [ ] Outbound KPIs (fulfillment rate, pick time, dispatch SLA) (TODO)
- [ ] Priority distribution widget (TODO)
- [ ] SLA monitor widget (TODO)

---

## Implementation Plan

### Phase 1 — Outbound KPIs (1-2 days)
1. Add fulfillment-rate, pick-time, dispatch-sla, return-rate endpoints
2. Add outbound tab to Analytics.tsx

### Phase 2 — Dashboard Widgets (1 day)
1. Priority distribution widget
2. SLA monitor widget (overdue orders)
