# goWMS — Development Specs Index

**Project:** goWMS (Warehouse Management System)  
**Domain:** Spare Parts Warehouse (₹20 Cr turnover, 2,000-5,000 SKUs)  
**Date:** 2026-08-11  

---

## Spec Files

| # | File | Coverage |
|---|------|----------|
| 01 | `SPEC_01_WAREHOUSE_SETUP.md` | Warehouse structure, location naming, items, categories, customers, suppliers, employees, roles, auth |
| 02 | `SPEC_02_INBOUND.md` | GRN sessions, box receiving, item verification, quality inspection (QC), putaway, stock tracking by box/bin/SKU/batch |
| 03 | `SPEC_03_OUTBOUND.md` | Sales orders, priority queue (1-10), pick list generation, picking, packing, dispatch, delivery notes, backorders, returns |

---

## Key Design Principles

1. **Simplicity first** — Big buttons, clear labels, minimal taps. A warehouse person with no tech background should be able to use it.
2. **Box is the primary unit** — Supplier ships in boxes, warehouse tracks by boxes, dispatches in boxes.
3. **Priority-driven fulfillment** — 1-10 scale, color-coded, auto-assigned on import.
4. **Configurable, not hardcoded** — Warehouse structure, QC templates, naming conventions are all user-configurable.
5. **Scan-first** — Every screen supports barcode scanning, but manual entry always works too.
6. **Mobile-ready** — All floor operations (picking, packing, putaway) designed for phone/tablet.

---

## Tech Stack (Recommended)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React + Tailwind | SPA, responsive |
| Backend | Node.js (Express/Fastify) or Python (FastAPI) | REST API |
| Database | PostgreSQL | JSONB for flexible fields |
| Auth | JWT + PIN | PIN for floor workers, JWT for admin |
| File Storage | S3/MinIO | Photos, documents |
| Barcode | QuaggaJS / ZXing | Browser-based scanning |
| PDF | Puppeteer / wkhtmltopdf | Labels, pick slips, delivery notes |

---

## Database Tables Summary

| Spec | Tables |
|------|--------|
| 01 | `warehouses`, `warehouse_structure`, `locations`, `categories`, `items`, `customers`, `suppliers`, `employees`, `roles` |
| 02 | `grn_sessions`, `grn_lines`, `grn_boxes`, `qc_inspections`, `qc_templates`, `stock`, `stock_ledger` |
| 03 | `sales_orders`, `so_lines`, `pick_lists`, `pick_so_map`, `pick_lines`, `boxes`, `box_lines`, `box_so_map`, `trips`, `trip_boxes`, `delivery_notes`, `backorders`, `returns`, `return_lines` |

---

## Sample Data (From Your Packing List)

The supplier packing list analysis revealed:
- **Supplier:** Bajaj Auto, Waluj Plant
- **Dealer:** Nirvana Auto Agency (Code: 0000016105)
- **Part Types:** Engine blocks, pistons, brake pads, forks, headlamps, fuel tubes, speedometer gears, wheels, gaskets, spark plug caps
- **Box Structure:** Delivery Number + Box Number (e.g., `0043996767-E0064`)
- **Weight Range:** 0.3 kg (unit regulator) to 12 kg (brake pad set)
- **Qty Range:** 1 (fork front) to 250 (fuel tube)

This data should be used for seeding the database with realistic test data.

---

## Assumptions (Shared Across All Specs)

1. Standalone WMS (no ERP dependency, API endpoints for future integration)
2. INR currency, IST timezone
3. Dates stored ISO 8601, displayed DD/MM/YYYY
4. Box-based receiving and dispatch
5. Batch/serial tracking is optional per item
6. QC is configurable per item/category
7. 5-15 warehouse staff
8. Desktop + mobile/tablet access
9. Barcode scanning optional (manual entry always works)
10. Partial fulfillment with backorder support

---

## Implementation Priority

### Phase 1 (Week 1-2) — Foundation
- [ ] Warehouse setup with location generator
- [ ] Item master with import
- [ ] Employee/role setup with PIN login
- [ ] Customer/Supplier master

### Phase 2 (Week 3-4) — Inbound
- [ ] GRN sessions with packing list import
- [ ] Box-level receiving
- [ ] Item verification
- [ ] QC inspection with templates
- [ ] Putaway with location suggestion
- [ ] Stock tracking (by box, bin, SKU, batch)

### Phase 3 (Week 5-6) — Outbound
- [ ] Sales order management with import
- [ ] Priority queue (1-10)
- [ ] Pick list generation (single + batch)
- [ ] Picking UI (mobile-friendly)
- [ ] Packing with box labels
- [ ] Dispatch with trips
- [ ] Delivery notes with POD

### Phase 4 (Week 7-8) — Advanced
- [ ] Backorder management
- [ ] Returns flow
- [ ] Analytics dashboard
- [ ] Reports (GRN summary, pick performance, stock aging)
- [ ] Notifications
