# Receiving Pages Overhaul — Design Spec

**Date:** 2026-08-18
**Status:** Approved

## Overview

Overhaul the Receiving Management page and RF Scanner page to:
- Fix naming/emoji inconsistencies
- Expand manual entry form to all 15 packing list columns
- Simplify RF Scanner (remove Driver/Transport, limit to 5 POs FIFO)
- Add full receiving status with dynamic location tracking in detail modal
- Add per-field search/filter on every column
- Achieve "sellable WMS" visual quality

## 1. Sidebar + Page Naming

| Location | Current | Proposed |
|----------|---------|----------|
| Sidebar label | `Receiving Management` | `Receiving` |
| Sidebar icon | `📋` | `📋` |
| Page title | `📦 Packing List Management` | `📋 Receiving` |
| Upload modal title | `📦 Add Packing List` | `📦 Add Packing List` |

## 2. Manual Entry Form — All 15 Columns

The manual entry table will have all Excel packing list columns as editable fields:

| # | Column Header | Field Key | Width |
|---|--------------|-----------|-------|
| 1 | Dealer Code | `dealer_code` | 100px |
| 2 | Dealer | `dealer_name` | 140px |
| 3 | Branch | `branch` | 120px |
| 4 | InvoiceNo | `invoice_no` | 110px |
| 5 | InvoiceDate | `invoice_date` | 110px |
| 6 | Delivery No | `delivery_no` | 100px |
| 7 | Delivery date | `delivery_date` | 110px |
| 8 | Plant | `plant` | 80px |
| 9 | Box No.From | `box_no_from` | 90px |
| 10 | Box No.To | `box_no_to` | 80px |
| 11 | Part Code | `part_code` | 110px |
| 12 | Part Name | `part_name` | 160px |
| 13 | Qty | `qty` | 70px |
| 14 | Weight (KG) | `unit_weight` | 90px |
| 15 | Box Number | `box_number` | 100px |

### Auto-Suggest Behavior
- When typing Part Code or Part Name, show dropdown with item suggestions
- Suggestions display: `Part Code — Part Name` (easier to read)
- Final output remains in standard packing list Excel format

## 3. RF Scanner — Simplified & Professional

### Remove
- Driver Name field
- Phone field
- Truck / Transporter field
- Default Route selector
- Driver & Transport section entirely

### PO Selection
- Show **top 5 POs only** in FIFO order
- Clean card layout with PO name, supplier, item count, schedule date
- "Start" / "Resume" badges

### UI Polish
- Use professional Unicode symbols (not raw emojis in functional areas)
- Flash messages as **toast-style notifications** (non-blocking, auto-dismiss after 3s)
- Clean step indicator bar with progress
- Consistent card/section styling

## 4. Database Migration — 5 New Columns

Add to `grn_cartons` table:

```sql
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS branch varchar(255);
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS invoice_date timestamptz;
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS delivery_date timestamptz;
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS box_no_from varchar(50);
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS box_no_to varchar(50);
```

## 5. Backend Changes

### 5a. `importPackingListFile` (management.go)
Parse and persist the 5 new columns from Excel:
- `Branch` → `grn_cartons.branch`
- `InvoiceDate` → `grn_cartons.invoice_date`
- `Delivery date` → `grn_cartons.delivery_date`
- `Box No.From` → `grn_cartons.box_no_from`
- `Box No.To` → `grn_cartons.box_no_to`

### 5b. `getPackingList` (management.go)
Return all columns from `grn_cartons` + `grn_lines`:
- Carton: `carton_no`, `dealer_code`, `dealer_name`, `delivery_no`, `plant`, `branch`, `invoice_date`, `delivery_date`, `box_no_from`, `box_no_to`, `status`
- Line: `item_code`, `part_name`, `expected_qty`, `scanned_qty`, `unit_weight_kg`, `invoice_no`, `status`, `route_location`

### 5c. `xlsx_import.go`
Update column map to include `Box No.To` (currently missing).

## 6. Detail Modal — Full Receiving Status

### Summary Stats Bar
- Total Boxes / Received / Pending
- Locations Used count

### Items Table Columns
| Column | Source | Notes |
|--------|--------|-------|
| Box Number | `grn_cartons.carton_no` | |
| Part Code | `grn_lines.item_code` | |
| Part Name | `grn_lines.part_name` | |
| Qty | `expected_qty` / `scanned_qty` | Show as "10 / 10" |
| Status | `grn_lines.status` | Pending / In Progress / Completed |
| Current Location | `grn_lines.route_location` | Dynamic: "Receiving Dock" → putaway location |
| Location 1–5 | Multiple putaway locations | Up to 5 locations if items split across putaways |

### Per-Field Search/Filter
Every column gets its own search input:
- Text columns: text search (contains match)
- Status: dropdown filter (All / Pending / In Progress / Completed)
- Qty: range filter

## 7. Aesthetics — Sellable WMS Quality

### Design System
- **8px grid** spacing throughout
- **12px border radius** on cards
- **Muted blue** accent (#2563eb)
- **Clean grays** for backgrounds (#f9fafb, #f3f4f6)
- **Professional typography**: 14px body, 12px labels, 11px dimmed

### Visual Treatment
- Cards with subtle borders and shadows
- Tables with alternating row colors
- Status badges with color coding (green=completed, yellow=pending, blue=in-progress)
- Smooth hover transitions (120ms ease)
- Proper empty states with icons
- Loading skeletons for async data
- Toast-style flash messages (slide in from top-right)

## Files to Modify

| File | Change |
|------|--------|
| `web/src/components/Layout.tsx` | Sidebar label: "Receiving" |
| `web/src/pages/ReceivingManagement.tsx` | Page title, manual entry form (15 cols), detail modal (all cols + status + locations + search) |
| `web/src/pages/ReceivingWizard.tsx` | Remove Driver/Transport, limit 5 POs, toast flashes, professional symbols |
| `web/src/styles/receiving-wizard.css` | Aesthetic improvements, toast styles, table styles |
| `web/src/services/api.ts` | Update `packingListGet` types |
| `api/modules/packinglist/management.go` | Return all columns, persist new columns |
| `api/modules/packinglist/xlsx_import.go` | Add Box No.To to column map |
| `migrations/037_grn_cartons_extended_columns.sql` | New migration for 5 columns |
