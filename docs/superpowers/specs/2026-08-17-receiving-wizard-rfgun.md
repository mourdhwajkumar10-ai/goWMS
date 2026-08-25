# Receiving Wizard — RF Gun Style Inbound Flow

**Date:** August 17, 2026  
**Status:** Draft (v2 — post-analysis revision)  
**Author:** Buffy (Codebuff Agent)  
**Revised by:** Analysis review  
**Priority:** P1 — Core Inbound  
**Estimated Effort:** 4–5 days

---

## 1. Problem Statement

The current GRN (Goods Received Note) page is a 4000+ line monolith that tries to handle every inbound scenario — gate check, truck arrival, box receiving, item verification, exceptions, audit, and putaway — in a single page. Warehouse floor workers using RF guns (handheld barcode scanners) need a fast, minimal-tap flow that prioritizes:

1. **Speed** — scan-to-confirm in under 2 seconds
2. **Clarity** — one screen, one task, no confusion
3. **Progress** — always know "X of Y done"
4. **Accountability** — who brought what, when, where it went

The supplier packing list arrives daily as an Excel file. The receiving operator must:
- Import the packing list
- Open each box and verify items via QR scan
- Map items against expected quantities
- Route exception items to QC/REJECT (normal items auto-route to INCOMING)
- Track which driver/transporter delivered the boxes

### 1.1 Design Principles (v2)

- **Extend, don't duplicate** — use existing `grn_cartons` + `grn_lines` tables, no parallel staging tables
- **Single-scan for single-item boxes** — 59 of 60 boxes in typical packing lists contain 1 item; auto-complete these with one box scan
- **Auto-skip when obvious** — if only 1 invoice and 1 delivery note, skip selection screen
- **Default routing** — 95% of items go to INCOMING-01; only ask for exceptions

---

## 2. Packing List Format

### 2.1 Excel Structure (Spares PackingLIST.xlsx)

| Column | Header | Example | Import Field | Notes |
|--------|--------|---------|-------------|-------|
| A | Dealer Code | `0000016105` | `dealer_code` | 10-digit dealer ID |
| B | Dealer | `NIRVANA AUTO AGENCY (16105)` | `dealer_name` | Full dealer name with code |
| C | Branch | `NIRVANA AUTO AGENCY (16105) ( 0000016105 )` | `branch` | Branch name (note extra spaces) |
| D | InvoiceNo | `0541626874` | `invoice_no` | **No space** — header is `InvoiceNo` not `Invoice No` |
| E | InvoiceDate | `2024-07-09 00:00:00` | `invoice_date` | Datetime format |
| F | Delivery No | `0043996767` | `delivery_no` | **Has space** — header is `Delivery No` |
| G | Delivery date | `2024-07-05 00:00:00` | `delivery_date` | Datetime format |
| H | Plant | `Waluj` | `plant` | Plant/warehouse origin |
| I | Box No.From | `0043996767-E0064` | *(reference only)* | Box range start |
| J | Box No.To | *(empty or `MIN=`)* | *(reference only)* | Box range end; `MIN=` on summary row |
| K | Part Code | `JF402006` | `part_code` | **Header is `Part Code`** not `Part No` |
| L | Part Name | `UNIT REGULATOR` | `part_name` | Item description |
| M | Qty | `10` | `qty` | Expected quantity in this box |
| N | Calculated Part Weight(in KG) | `1.62` | `unit_weight_kg` | Per-unit weight in KG |
| O | Box Number | `0043996767-E0064` | `box_number` | **Actual box barcode — primary box identifier** |
| P | *(empty)* | — | *(unused)* | No price column in packing list |

> **⚠ Column mapping corrections (vs v1):**
> - Part column header is **`Part Code`** (not `Part No`) — existing code in `xlsx_import.go` must be updated
> - Invoice column header is **`InvoiceNo`** (no space, not `Invoice No`)
> - **No price column** exists in the Excel — `unit_price` comes only from item QR codes at scan time
> - **No batch column** exists — the `Batch No` mapping in existing code will always return empty

**Key observations:**
- Most boxes contain a **single item** (59 of 60 in sample data). Only 1 box (E0055) has multiple items (4 items).
- Summary row detection: the **last row** has `Box No.To` (col J) = `MIN=`, `Part Code` (col K) = empty, `Box Number` (col O) = empty, `Qty` = total sum. **Skip rows where `box_number` is empty or `part_code` is empty.**
- Box Number format: `{delivery_no}-{suffix}` where suffix is `C0001`–`C9999` (cartons) or `E0001`–`E9999` (envelopes)
- Box numbering is **non-contiguous** — e.g., E0057–E0060 may be missing. Do not assume sequential numbers.
- One packing list can contain multiple deliveries (different Delivery No values)

### 2.2 Sample Data (from actual Excel)

```
Dealer Code: 0000016105
Dealer:      NIRVANA AUTO AGENCY (16105)
Invoice:     0541626874
Delivery:    0043996767
Plant:       Waluj

--- Cartons (54 boxes, single-item each) ---
Box C0001: YDH31005 FORK INNER PIPE × 10
Box C0002: YDH31005 FORK INNER PIPE × 10
Box C0003: YDH31005 FORK INNER PIPE × 10
Box C0004: JF402006 UNIT REGULATOR × 9
Box C0005: YJF25001 H/L ASSEMBLY WO BULBS RINDER × 4
Box C0006: YJF25001 H/L ASSEMBLY WO BULBS RINDER × 4
Box C0007: YJF25001 H/L ASSEMBLY WO BULBS RINDER × 4
Box C0008: YJF25001 H/L ASSEMBLY WO BULBS RINDER × 4
Box C0009: 36DS1002 Valve Kit × 100
Box C0010: 36DS1002 Valve Kit × 100
Box C0011: 36DS1002 Valve Kit × 100
Box C0012: JW131807 BRAKE PAD SET × 100
Box C0013: JW131807 BRAKE PAD SET × 100
Box C0014: JL601251 RADIATOR ASSEMBLY × 1
Box C0015: JL601251 RADIATOR ASSEMBLY × 1
Box C0016: DH151085 WHEEL 1.85X17 × 1
Box C0017: DH151085 WHEEL 1.85X17 × 1
Box C0018: DS141014 FUEL TUBE × 250
Box C0019: DS141014 FUEL TUBE × 250
Box C0020: DS141014 FUEL TUBE × 250
Box C0021: DS141014 FUEL TUBE × 250
Box C0022: 36DJ4032 (part) × 150
Box C0023: JF151018 (part) × 1
Box C0024: JF151018 (part) × 1
Box C0025: 36DS1502 (part) × 150
Box C0026–C0037: DH101864 BLOCK PISTON ASSLY (4 each, 12 boxes)
Box C0038: DH101864 BLOCK PISTON ASSLY × 4
Box C0039–C0053: 36DH4103 / DY401002 / JR121017 (various single-item boxes)
Box C0054: JR121017 × 1

--- Envelopes (6 boxes) ---
Box E0055: JF161015 PEDAL ASSEMBLY BRAKE × 5       ← MULTI-ITEM BOX
           DM101139 GASKET (GEN. COVER) × 70
           36JF0005 KIT CHAIN GUIDE × 20
           36DH4405 KIT SET LOCK + PT CAP × 6
Box E0056: 36JF0196 KIT BLOCK PISTON K10UG × 2
Box E0061: DH111015 CAP - SPARK PLUG × 100
Box E0062: JW131807 BRAKE PAD SET × 80
Box E0063: 36JR0113 KIT CLUTCH PLATE STEEL × 10
Box E0064: JF402006 UNIT REGULATOR × 1

Totals: 60 boxes, 22 unique parts, 2268 total pcs
        54 cartons (C), 6 envelopes (E)
        59 single-item boxes, 1 multi-item box
```

---

## 3. Box Label & QR Code Format

### 3.1 Box Label (from physical label image)

```
┌─────────────────────────────────────────────┐
│  PTL              DELIVERY - BOX NO.  [QR]  │
│           0041859150-C0010                  │
│  DATE: 12/09/2025         [QR] 6DK0024     │
│  DEALER: NIRVANA AUTO AGENCY                │
│  CITY: DEOGHAR                              │
│  TRPT: SAFEXPRESS PVT LTD                   │
│  LOC: BC-34          S. QTY: 10/10          │
│  [QR] 0041859150-C0010        (19460)       │
└─────────────────────────────────────────────┘
```

**Barcode (left side, vertical):** `0041859150-C0010` — this is the box identifier  
**QR code (top right):** Contains encoded delivery + box data  
**QR code (bottom left):** Contains the box number again  

### 3.2 Item QR Code Format

The QR code on individual item labels follows this format:

```
{item_code}-{qty}-{price}
```

**Examples:**
| QR Code Content | Item Code | Qty | Price |
|----------------|-----------|-----|-------|
| `JF402006-1-150.00` | JF402006 | 1 | ₹150.00 |
| `36JR0113-10-2800.00` | 36JR0113 | 10 | ₹2,800.00 |
| `JW131807-80-450.00` | JW131807 | 80 | ₹450.00 |

**Parsing rules:**
1. Split by `-` from the right (since item codes can contain hyphens)
2. Last segment = price (numeric with optional decimal)
3. Second-to-last segment = qty (integer)
4. Everything before = item_code
5. Fallback: if only 1 segment, treat as item_code with qty=1, price=0
6. **Validation:** after parsing, verify `item_code` exists in the packing list for the current box. If not, try the full raw string as `item_code` (handles plain barcodes without qty/price encoding).

```go
func ParseItemQR(raw string) (itemCode string, qty int, price float64) {
    parts := strings.Split(raw, "-")
    if len(parts) >= 3 {
        price, _ = strconv.ParseFloat(parts[len(parts)-1], 64)
        qty, _ = strconv.Atoi(parts[len(parts)-2])
        itemCode = strings.Join(parts[:len(parts)-2], "-")
    } else if len(parts) == 2 {
        qty, _ = strconv.Atoi(parts[1])
        itemCode = parts[0]
    } else {
        itemCode = raw
        qty = 1
    }
    if qty <= 0 { qty = 1 }
    return
}
```

### 3.3 Box Barcode Format

The box barcode is the `Box Number` from the packing list:

```
{delivery_no}-{suffix}
```

Where:
- `delivery_no` = the Delivery No column (e.g., `0043996767`)
- `suffix` = `C0001`–`C9999` for cartons, `E0001`–`E9999` for envelopes/packets

**Examples:**
- `0043996767-C0001` — Carton 1 of delivery 0043996767
- `0043996767-E0064` — Envelope 64 of delivery 0043996767

---

## 4. Database Schema Changes

### 4.1 Architecture Decision: Extend Existing Tables

**No new staging or driver tables.** The existing `grn_sessions`, `grn_cartons`, and `grn_lines` tables already hold the right data. We extend them with the few missing columns.

Existing schema (via migrations 002 + 018):
- `grn_sessions` — already has `driver_name`, `driver_phone`, `truck_no`, `plant`, `invoice_nos`
- `grn_cartons` — already has `carton_no`, `status`, `scanned_at`, `scanned_by`, `invoice_no`
- `grn_lines` — already has `item_code`, `expected_qty`, `scanned_qty`, `status`, `invoice_no`

### 4.2 Migration 036: Receiving Wizard Extensions

```sql
-- Migration 036: Receiving Wizard — extend existing tables for RF-gun flow

-- 4.2.1 Add delivery_no and packing-list metadata to grn_cartons
ALTER TABLE public.grn_cartons 
    ADD COLUMN IF NOT EXISTS delivery_no varchar(100);
ALTER TABLE public.grn_cartons
    ADD COLUMN IF NOT EXISTS dealer_code varchar(50);
ALTER TABLE public.grn_cartons
    ADD COLUMN IF NOT EXISTS dealer_name varchar(255);
ALTER TABLE public.grn_cartons
    ADD COLUMN IF NOT EXISTS plant varchar(100);
ALTER TABLE public.grn_cartons
    ADD COLUMN IF NOT EXISTS box_type varchar(10);  -- 'carton' or 'envelope'

CREATE INDEX IF NOT EXISTS idx_grn_cartons_delivery 
    ON public.grn_cartons(delivery_no);

-- 4.2.2 Add weight and routing to grn_lines
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS unit_weight_kg numeric(18,6);
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS unit_price numeric(18,6);
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS route_location varchar(100);
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS routed_at timestamp with time zone;
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS part_name varchar(255);

-- 4.2.3 Add transporter to grn_sessions (driver_name, driver_phone, truck_no already exist via 018)
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS transporter varchar(255);
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS delivery_no varchar(100);
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS default_route_location varchar(100) DEFAULT 'INCOMING-01';
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS boxes_total integer DEFAULT 0;
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS boxes_received integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_grn_sessions_delivery
    ON public.grn_sessions(delivery_no);
```

### 4.3 Schema Relationships (unchanged — no new tables)

```
grn_sessions (extended with transporter, delivery_no, default_route_location)
    ├── grn_cartons (extended with delivery_no, dealer_code, plant, box_type)
    │       └── grn_lines (extended with unit_weight_kg, unit_price, route_location, part_name)
    ├── grn_events (existing — audit trail)
    └── grn_exceptions (existing — shortage/excess/unknown tracking)
```

---

## 5. Backend API Endpoints

### 5.1 Module: Extend `api/modules/packinglist/` + `api/modules/grn/`

No new module. Add receiving-wizard-specific handlers to the existing packinglist and grn modules.

**New files:**
- `api/modules/packinglist/receiving.go` — wizard-specific import + filtering endpoints
- `api/modules/grn/rf_scan.go` — RF gun scan + auto-complete logic

### 5.2 Endpoints

#### POST /api/receiving/import — Upload Packing List

Accepts multipart Excel file. Creates or links to a GRN session.

**Request:**
```
Content-Type: multipart/form-data
- file: Spares PackingLIST.xlsx
- grn_session_id: 123 (optional, creates new session if omitted)
- driver_name: "Ramesh Kumar" (optional)
- driver_phone: "9876543210" (optional)
- transporter: "SAFEXPRESS PVT LTD" (optional)
- default_route: "INCOMING-01" (optional, defaults to INCOMING-01)
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "grn_session_id": 456,
    "import_summary": {
      "total_rows": 64,
      "rows_imported": 63,
      "rows_skipped": 1,
      "unique_invoices": ["0541626874"],
      "unique_delivery_nos": ["0043996767"],
      "total_boxes": 60,
      "single_item_boxes": 59,
      "multi_item_boxes": 1,
      "total_unique_items": 22,
      "total_qty": 2268,
      "dealer": "NIRVANA AUTO AGENCY (16105)",
      "plant": "Waluj"
    },
    "auto_skip": true,
    "auto_selected_invoice": "0541626874",
    "auto_selected_dn": "0043996767"
  }
}
```

**Logic:**
1. Parse Excel file (first sheet), map columns by **exact header names** (see §2.1 table)
2. Skip rows where `box_number` (col O) is empty OR `part_code` (col K) is empty OR `qty` ≤ 0
3. Create/get `grn_session`, stamp `driver_name`, `driver_phone`, `transporter`, `delivery_no`, `plant`
4. For each row: upsert `grn_cartons` (one per unique Box Number), create `grn_lines` (one per item per box)
5. Stamp `delivery_no`, `dealer_code`, `dealer_name`, `plant`, `box_type` on each carton
6. Stamp `unit_weight_kg`, `part_name` on each line
7. If only 1 invoice + 1 DN → set `auto_skip: true` in response (frontend skips to scan screen)
8. Log `PACKING_LIST_IMPORTED` event

**Column mapping (corrected):**
```go
colMap := map[string]string{
    "part_code":     "Part Code",    // NOT "Part No"
    "part_name":     "Part Name",
    "qty":           "Qty",
    "box_number":    "Box Number",
    "invoice_no":    "InvoiceNo",    // NO space
    "delivery_no":   "Delivery No",  // HAS space
    "dealer_code":   "Dealer Code",
    "dealer_name":   "Dealer",
    "plant":         "Plant",
    "invoice_date":  "InvoiceDate",
    "delivery_date": "Delivery date",
    "unit_weight":   "Calculated Part Weight(in KG)",
    "branch":        "Branch",
    "box_no_from":   "Box No.From",
}
```

---

#### GET /api/receiving/invoices — List Unique Invoices

**Request:**
```
GET /api/receiving/invoices?session_id=456
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "invoice_no": "0541626874",
      "invoice_date": "2024-07-09",
      "delivery_count": 1,
      "box_count": 60,
      "total_qty": 2268
    }
  ]
}
```

---

#### GET /api/receiving/delivery-notes — List DNs for an Invoice

**Request:**
```
GET /api/receiving/delivery-notes?session_id=456&invoice_no=0541626874
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "delivery_no": "0043996767",
      "delivery_date": "2024-07-05",
      "plant": "Waluj",
      "dealer": "NIRVANA AUTO AGENCY (16105)",
      "box_count": 60,
      "single_item_boxes": 59,
      "total_qty": 2268,
      "boxes_received": 0
    }
  ]
}
```

---

#### GET /api/receiving/boxes — List Boxes for a Delivery

**Request:**
```
GET /api/receiving/boxes?session_id=456&delivery_no=0043996767
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "delivery_no": "0043996767",
    "total_boxes": 60,
    "boxes_received": 0,
    "overall_progress_pct": 0,
    "boxes": [
      {
        "box_number": "0043996767-C0001",
        "box_type": "carton",
        "item_count": 1,
        "is_single_item": true,
        "total_qty": 10,
        "scanned_qty": 0,
        "status": "expected",
        "items": [
          {
            "part_code": "YDH31005",
            "part_name": "FORK INNER PIPE",
            "expected_qty": 10,
            "scanned_qty": 0,
            "unit_weight_kg": 12.6,
            "status": "pending"
          }
        ]
      },
      {
        "box_number": "0043996767-E0055",
        "box_type": "envelope",
        "item_count": 4,
        "is_single_item": false,
        "total_qty": 101,
        "scanned_qty": 0,
        "status": "expected",
        "items": [
          { "part_code": "JF161015", "part_name": "PEDAL ASSEMBLY BRAKE", "expected_qty": 5, "scanned_qty": 0, "status": "pending" },
          { "part_code": "DM101139", "part_name": "GASKET (GEN. COVER)", "expected_qty": 70, "scanned_qty": 0, "status": "pending" },
          { "part_code": "36JF0005", "part_name": "KIT CHAIN GUIDE", "expected_qty": 20, "scanned_qty": 0, "status": "pending" },
          { "part_code": "36DH4405", "part_name": "KIT SET LOCK + PT CAP", "expected_qty": 6, "scanned_qty": 0, "status": "pending" }
        ]
      }
    ]
  }
}
```

---

#### POST /api/receiving/scan-box — Scan Box Barcode (with auto-complete)

This is the **core endpoint** for the optimised flow. For single-item boxes, it auto-completes the entire box in one call.

**Request:**
```json
{
  "session_id": 456,
  "box_number": "0043996767-C0001",
  "auto_complete_single": true,
  "default_route": "INCOMING-01"
}
```

**Response (single-item box — auto-completed):**
```json
{
  "ok": true,
  "data": {
    "box_number": "0043996767-C0001",
    "box_type": "carton",
    "box_index": 1,
    "total_boxes": 60,
    "auto_completed": true,
    "item_summary": [
      {
        "part_code": "YDH31005",
        "part_name": "FORK INNER PIPE",
        "expected_qty": 10,
        "scanned_qty": 10,
        "status": "full_match",
        "route_location": "INCOMING-01"
      }
    ],
    "box_status": "verified",
    "delivery_progress": {
      "boxes_received": 1,
      "boxes_total": 60,
      "progress_pct": 2
    },
    "next_action": "scan_next_box",
    "message": "✅ C0001: FORK INNER PIPE × 10 → INCOMING-01"
  }
}
```

**Response (multi-item box — needs manual scan):**
```json
{
  "ok": true,
  "data": {
    "box_number": "0043996767-E0055",
    "box_type": "envelope",
    "box_index": 55,
    "total_boxes": 60,
    "auto_completed": false,
    "item_count": 4,
    "items": [
      { "part_code": "JF161015", "part_name": "PEDAL ASSEMBLY BRAKE", "expected_qty": 5, "scanned_qty": 0, "status": "pending" },
      { "part_code": "DM101139", "part_name": "GASKET (GEN. COVER)", "expected_qty": 70, "scanned_qty": 0, "status": "pending" },
      { "part_code": "36JF0005", "part_name": "KIT CHAIN GUIDE", "expected_qty": 20, "scanned_qty": 0, "status": "pending" },
      { "part_code": "36DH4405", "part_name": "KIT SET LOCK + PT CAP", "expected_qty": 6, "scanned_qty": 0, "status": "pending" }
    ],
    "next_action": "scan_items",
    "message": "📦 E0055: 4 items to verify — scan item QR codes"
  }
}
```

**Logic:**
1. Look up box in `grn_cartons` by `carton_no` + `grn_session_id`
2. If not found → return 404 "Box not in packing list"
3. Count items for this box via `grn_lines`
4. **If single-item box AND `auto_complete_single` is true:**
   a. Set `grn_lines.scanned_qty = expected_qty`, status = `full_match`
   b. Set `grn_lines.route_location = default_route`, `routed_at = now()`
   c. Set `grn_cartons.status = 'verified'`, `scanned_at = now()`, `scanned_by = user`
   d. Update `grn_sessions.boxes_received++`
   e. Log `BOX_SCANNED` + `ITEM_AUTO_MATCHED` + `BOX_VERIFIED` events
   f. Return `auto_completed: true`
5. **If multi-item box:**
   a. Set `grn_cartons.status = 'received'`, `scanned_at = now()`, `scanned_by = user`
   b. Log `BOX_SCANNED` event
   c. Return items list with `auto_completed: false`

---

#### POST /api/receiving/scan-item — Scan Item QR Code (for multi-item boxes)

Only used when a box has multiple items and requires individual item scanning.

**Request:**
```json
{
  "session_id": 456,
  "box_number": "0043996767-E0055",
  "qr_raw": "JF161015-5-350.00",
  "qty_override": null
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "parsed": {
      "item_code": "JF161015",
      "qty": 5,
      "price": 350.00
    },
    "match": {
      "expected": 5,
      "scanned": 5,
      "status": "full_match",
      "message": "✓ JF161015 — 5 of 5 received"
    },
    "box_progress": {
      "items_scanned": 1,
      "items_total": 4,
      "progress_pct": 25
    },
    "next_action": "scan_next_item"
  }
}
```

**Response (excess):**
```json
{
  "ok": true,
  "data": {
    "parsed": { "item_code": "DM101139", "qty": 75, "price": 50.00 },
    "match": {
      "expected": 70,
      "scanned": 75,
      "status": "excess",
      "message": "⚠ DM101139 — 75 scanned, only 70 expected (5 excess)"
    },
    "box_progress": { "items_scanned": 2, "items_total": 4, "progress_pct": 50 },
    "next_action": "confirm_excess_or_scan_next"
  }
}
```

**Logic:**
1. Parse QR code: `ParseItemQR(qr_raw)` → item_code, qty, price
2. Find matching item in `grn_lines` for this box's `grn_carton_id`
3. If no match → try fuzzy match (case-insensitive, trim spaces)
4. If still no match → try full raw string as item_code (handles plain barcodes)
5. If still no match → create exception, return `status: "unknown"`
6. Update `scanned_qty += qty`, set `scanned_at`, `scanned_by`
7. If `unit_price` not set on line, store price from QR
8. Compare against `expected_qty`:
   - scanned == expected → `full_match`
   - scanned < expected → `shortage`
   - scanned > expected → `excess`
9. Return box progress

---

#### POST /api/receiving/complete-box — Mark Multi-Item Box as Complete

**Request:**
```json
{
  "session_id": 456,
  "box_number": "0043996767-E0055",
  "default_route": "INCOMING-01"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "box_number": "0043996767-E0055",
    "status": "verified",
    "items_summary": [
      { "part_code": "JF161015", "expected": 5, "scanned": 5, "status": "full_match", "route": "INCOMING-01" },
      { "part_code": "DM101139", "expected": 70, "scanned": 70, "status": "full_match", "route": "INCOMING-01" },
      { "part_code": "36JF0005", "expected": 20, "scanned": 18, "status": "shortage", "route": "INCOMING-01" },
      { "part_code": "36DH4405", "expected": 6, "scanned": 6, "status": "full_match", "route": "INCOMING-01" }
    ],
    "has_exceptions": true,
    "exception_count": 1,
    "delivery_progress": {
      "boxes_received": 60,
      "boxes_total": 60,
      "progress_pct": 100
    }
  }
}
```

**Logic:**
1. Mark `grn_cartons.status = 'verified'`
2. For each item in box:
   - If no route set, apply `default_route`
   - If scanned < expected → create `shortage` exception
   - If scanned > expected → create `excess` exception
   - If scanned == expected → status = `full_match`
3. Route exception items: shortages stay at INCOMING-01, excess → ask user
4. Update `grn_sessions.boxes_received`
5. **Auto-complete delivery** if all boxes verified

---

#### POST /api/receiving/route-exception — Route Exception Items Only

Only needed for items with shortage/excess/unknown status. Normal items auto-route to `default_route`.

**Request:**
```json
{
  "session_id": 456,
  "routes": [
    { "grn_line_id": 789, "location": "QUALITY_INSPECTION-01" },
    { "grn_line_id": 790, "location": "REJECT-01" }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "routed_count": 2,
    "locations_used": ["QUALITY_INSPECTION-01", "REJECT-01"]
  }
}
```

---

#### GET /api/receiving/stats — Live Dashboard Stats

**Request:**
```
GET /api/receiving/stats?session_id=456
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "session_id": 456,
    "delivery_no": "0043996767",
    "total_boxes": 60,
    "boxes_received": 15,
    "boxes_verified": 10,
    "single_item_boxes": 59,
    "multi_item_boxes": 1,
    "overall_progress_pct": 25,
    "total_items": 22,
    "items_full_match": 18,
    "items_shortage": 2,
    "items_excess": 1,
    "items_unknown": 1,
    "total_qty_expected": 2268,
    "total_qty_scanned": 1890,
    "exceptions_open": 3,
    "elapsed_time_sec": 720,
    "est_remaining_sec": 2160
  }
}
```

---

## 6. Frontend: ReceivingWizard.tsx

### 6.1 Architecture (Optimised — 3 Core Screens)

A new page at `/receiving` with **3 primary screens** (down from 6), plus 1 optional screen.

```
/receiving → ReceivingWizard.tsx
    ├── Screen 1: ImportPackingList     (upload + driver info)
    ├── Screen 2: ProgressiveScan      (THE CORE SCREEN — scan boxes continuously)
    │       └── [inline] ItemScanPanel (opens inside Screen 2 for multi-item boxes)
    ├── Screen 3: Complete             (summary + next actions)
    └── [optional] Screen 1b: SelectInvoiceDN (only if multiple invoices/DNs)
```

### 6.2 Screen States

```typescript
type ReceivingStep = 
  | 'import'          // Upload Excel, enter driver info
  | 'select'          // Filter by invoice + DN (AUTO-SKIPPED if single)
  | 'scan'            // Progressive box scan (core screen)
  | 'complete';       // Session complete

interface ReceivingState {
  step: ReceivingStep;
  sessionId: number | null;
  // Import
  importSummary: ImportSummary | null;
  driverName: string;
  driverPhone: string;
  transporter: string;
  defaultRoute: string;  // default: 'INCOMING-01'
  // Select (may be auto-filled)
  selectedInvoice: string;
  selectedDN: string;
  autoSkipped: boolean;
  // Scan
  boxes: BoxInfo[];
  currentMultiItemBox: BoxInfo | null;  // null = in box scan mode
  scanHistory: ScanResult[];            // last N scans for feed
  // Stats
  boxesReceived: number;
  boxesTotal: number;
  exceptionsOpen: number;
}

interface ScanResult {
  box_number: string;
  auto_completed: boolean;
  message: string;
  timestamp: Date;
  status: 'success' | 'warning' | 'error';
}
```

### 6.3 Screen 1: Import Packing List

**Layout (Desktop):**
```
┌─────────────────────────────────────────────────┐
│  📦 Receiving Wizard                    [step 1] │
│─────────────────────────────────────────────────│
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  📄 Upload Packing List                   │  │
│  │                                           │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │                                     │  │  │
│  │  │     📁 Drag & drop or click         │  │  │
│  │  │        to upload .xlsx file         │  │  │
│  │  │                                     │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │                                           │  │
│  │  Driver Information                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │ Name     │ │ Phone    │ │ Transport│  │  │
│  │  │ ________ │ │ ________ │ │ ________ │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘  │  │
│  │                                           │  │
│  │  Default Route: [INCOMING-01          ▾]  │  │
│  │                                           │  │
│  │  [📤 Import & Start Receiving]             │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  Recent Imports                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ 0541626874 · 0043996767 · 60 boxes · Jul 5│  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Layout (Mobile):**
```
┌──────────────────────┐
│ 📦 Receiving    [1]  │
│──────────────────────│
│                      │
│ 📄 Upload            │
│ ┌──────────────────┐ │
│ │ 📁 Tap to upload │ │
│ └──────────────────┘ │
│                      │
│ Driver               │
│ Name: ____________   │
│ Phone: ___________   │
│ Transport: ________  │
│                      │
│ Route: [INCOMING-01] │
│                      │
│ [📤 Import & Start]  │
│                      │
│ Recent:              │
│ 0541626874 · 60 boxes│
└──────────────────────┘
```

**On submit:** If `auto_skip === true` in response → skip directly to Screen 2 (Scan). Otherwise show Screen 1b.

### 6.4 Screen 1b: Select Invoice & Delivery Note (auto-skipped when single)

Only shown when the packing list contains multiple invoices or delivery notes.

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  📦 Receiving Wizard                  [step 1b] │
│─────────────────────────────────────────────────│
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Invoice Number                           │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │ 0541626874 (1 invoice, 60 boxes) ▾ │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │                                           │  │
│  │  Delivery Note                            │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │ 0043996767 · Waluj · Jul 5    ▾    │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │                                           │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │  │
│  │  │ 60  │ │ 22  │ │2268 │ │  0  │        │  │
│  │  │Boxes│ │Items│ │ Pcs │ │Recv │        │  │
│  │  └─────┘ └─────┘ └─────┘ └─────┘        │  │
│  │                                           │  │
│  │  Driver: Ramesh Kumar · SAFEXPRESS        │  │
│  │                                           │  │
│  │  [▶ Start Receiving →]                    │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 6.5 Screen 2: Progressive Scan (THE CORE SCREEN)

This is the **primary screen**. The operator stays here for the entire receiving session. It handles both box scanning AND item scanning (for multi-item boxes) in a single unified view.

**Layout (Desktop — Box Scan Mode):**
```
┌─────────────────────────────────────────────────┐
│  📦 Delivery 0043996767              15/60 boxes │
│  Dealer: NIRVANA AUTO · Plant: Waluj · INCOMING │
│─────────────────────────────────────────────────│
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░  15/60  25%      │
│─────────────────────────────────────────────────│
│                                                 │
│  🔊 Scan any box barcode...                     │
│  ┌───────────────────────────────────────────┐  │
│  │ ________________________________________[📷]│ │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌─ Recent Activity ────────────────────────┐  │
│  │  ✅ C0015 · RADIATOR ASSEMBLY × 1   now  │  │
│  │  ✅ C0014 · RADIATOR ASSEMBLY × 1   1s   │  │
│  │  ✅ C0013 · BRAKE PAD SET × 100     5s   │  │
│  │  ✅ C0012 · BRAKE PAD SET × 100     8s   │  │
│  │  ✅ C0011 · Valve Kit × 100         12s  │  │
│  │  ✅ C0010 · Valve Kit × 100         15s  │  │
│  │  ✅ C0009 · Valve Kit × 100         18s  │  │
│  │  ✅ C0008 · H/L ASSEMBLY × 4        22s  │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ⚠ Exceptions: 0   ⏱ 3 min elapsed             │
│                                                 │
│  [📋 View All Boxes]  [⏸ Pause]  [✓ Done]      │
└─────────────────────────────────────────────────┘
```

**Layout (Desktop — Multi-Item Box Mode):**

When a multi-item box is scanned (e.g., E0055 with 4 items), the screen expands inline:

```
┌─────────────────────────────────────────────────┐
│  📦 Delivery 0043996767              59/60 boxes │
│  Dealer: NIRVANA AUTO · Plant: Waluj · INCOMING │
│─────────────────────────────────────────────────│
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░  59/60  98%    │
│─────────────────────────────────────────────────│
│                                                 │
│  📦 Box E0055 — 4 items to verify              │
│  ┌───────────────────────────────────────────┐  │
│  │  📷 Scan item QR code...                  │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │ ________________________________[📷]│  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │                                           │  │
│  │  ✓ JF161015  PEDAL ASSEMBLY BRAKE         │  │
│  │    5 / 5  ✓ full_match                    │  │
│  │───────────────────────────────────────────│  │
│  │  ✓ DM101139  GASKET (GEN. COVER)          │  │
│  │    70 / 70  ✓ full_match                  │  │
│  │───────────────────────────────────────────│  │
│  │  ⏳ 36JF0005  KIT CHAIN GUIDE             │  │
│  │    0 / 20  pending                        │  │
│  │───────────────────────────────────────────│  │
│  │  ⏳ 36DH4405  KIT SET LOCK + PT CAP       │  │
│  │    0 / 6  pending                         │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  [✓ Complete Box & Continue]  [✕ Close Box]     │
└─────────────────────────────────────────────────┘
```

**Layout (Mobile — Box Scan Mode):**
```
┌──────────────────────┐
│ 📦 15/60  25%        │
│ ▓▓▓▓░░░░░░░░░  25%  │
│──────────────────────│
│                      │
│ 🔊 Scan box...      │
│ ┌──────────────────┐ │
│ │ ____________ [📷]│ │
│ └──────────────────┘ │
│                      │
│ ✅ C0015 RAD.ASSY ×1│
│ ✅ C0014 RAD.ASSY ×1│
│ ✅ C0013 BRAKE ×100 │
│ ✅ C0012 BRAKE ×100 │
│ ✅ C0011 Valve ×100 │
│                      │
│ ⚠0  ⏱3min           │
│ [📋 All] [✓ Done]   │
└──────────────────────┘
```

**Key UX behaviors:**
1. **Auto-focus** — scan input is always focused, ready for next scan
2. **Beep on success** — `new Audio('/beep.mp3').play()` on `full_match` / auto-complete
3. **Buzz on error** — vibration API on mobile for `excess`/`unknown`
4. **Auto-clear** — scan input clears after 1s on success
5. **Scan feed** — last 10 scans shown as a rolling feed with timestamps
6. **Progress bar** — animated, shows exact percentage
7. **Inline multi-item mode** — when a multi-item box is scanned, the item scan panel appears inline (no page navigation)
8. **Auto-complete box** — when all items in multi-item box match, auto-complete and return to box scan mode
9. **Camera button** — opens device camera for QR scanning
10. **Single-item auto-complete flash** — green flash with item details for 2s, then ready for next scan

### 6.6 Screen 3: Complete

```
┌─────────────────────────────────────────────────┐
│  ✅ Delivery Complete!                          │
│─────────────────────────────────────────────────│
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  🎉 0043996767 — All 60 boxes received   │  │
│  │                                           │  │
│  │  ✓ 21/22 items full match                 │  │
│  │  ⚠ 1 shortage                             │  │
│  │  📦 2268 pcs scanned                      │  │
│  │  📦 59 auto-completed (single-item)       │  │
│  │  📦 1 manually verified (multi-item)      │  │
│  │  👤 Driver: Ramesh Kumar · SAFEXPRESS     │  │
│  │  📍 Route: INCOMING-01 (default)          │  │
│  │  ⏱ Duration: 15 min                       │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  Exceptions (1):                                │
│  ┌───────────────────────────────────────────┐  │
│  │  ⚠ 36JF0005 KIT CHAIN GUIDE              │  │
│  │    Expected: 20 · Scanned: 18 · Short: 2 │  │
│  │    Route: [INCOMING-01 ▾]                 │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  [→ Resolve Exceptions]  [→ Start Putaway]      │
│  [→ View Report]  [→ Home]                      │
└─────────────────────────────────────────────────┘
```

---

## 7. Component File Structure

```
web/src/
├── pages/
│   └── ReceivingWizard.tsx          # Main page component (~400 lines)
├── components/receiving/
│   ├── ImportStep.tsx               # Screen 1: Upload + driver info
│   ├── SelectStep.tsx               # Screen 1b: Invoice + DN selection (optional)
│   ├── ProgressiveScanStep.tsx      # Screen 2: THE CORE — box scan + inline item scan
│   ├── ItemScanPanel.tsx            # Inline panel for multi-item box scanning
│   ├── ScanFeed.tsx                 # Rolling feed of recent scan results
│   ├── CompleteStep.tsx             # Screen 3: Session complete + exception routing
│   └── QRScanner.tsx                # Camera-based QR code scanner
├── styles/
│   └── receiving-wizard.css         # Responsive styles
└── services/
    └── api.ts                       # Add receiving API methods

api/modules/packinglist/
├── handler.go                       # Existing — add receiving routes
├── xlsx_import.go                   # Existing — FIX column mappings
├── receiving.go                     # NEW — wizard-specific import + filtering

api/modules/grn/
├── handler.go                       # Existing — add RF scan routes
├── rf_scan.go                       # NEW — scan-box, scan-item, auto-complete logic
├── workflow.go                      # Existing
├── verify.go                        # Existing
└── ...

migrations/
└── 036_receiving_wizard.sql         # Extend existing tables (no new tables)
```

---

## 8. Responsive Design Requirements

### 8.1 Breakpoints

| Token | Width | Target |
|-------|-------|--------|
| `sm` | < 480px | Phone (portrait) |
| `md` | 480–768px | Phone (landscape) / Small tablet |
| `lg` | 768–1024px | Tablet |
| `xl` | > 1024px | Desktop |

### 8.2 Key Responsive Behaviors

| Element | Desktop | Tablet | Mobile |
|---------|---------|--------|--------|
| Step indicator | Horizontal pills | Horizontal scroll | Numbers only |
| Import dropzone | 300px wide | Full width | Full width |
| Driver fields | 3 columns | 2 columns | 1 column |
| Scan input | Large input + camera btn | Large input | Full-width + camera |
| Scan feed | 10 items visible | 6 items | 5 items |
| Progress bar | 20px height | 16px | 12px |
| Action buttons | Row | Row | Stacked |
| Multi-item panel | Side panel (right) | Full width overlay | Full screen |

### 8.3 Touch Targets

- All buttons: min 44×44px
- Scan input: min 48px height
- Dropdown selects: min 44px height
- Camera/scan button: 56×56px

### 8.4 Performance

- Scan feedback < 100ms (local state update before API)
- Optimistic UI: show scan result immediately, reconcile with API
- Debounce camera frames: 500ms cooldown between scans
- Scan feed: only keep last 50 items in memory, scroll virtual list
- Skeleton loading for box list (not spinner)

---

## 9. QR Code Scanning Integration

### 9.1 Camera Scanner (Mobile)

Use `html5-qrcode` library for camera-based QR scanning.

```typescript
// QRScanner.tsx — wraps html5-qrcode
interface QRScannerProps {
  onScan: (decoded: string) => void;
  onError?: (err: string) => void;
  active: boolean;
}

// Usage in ProgressiveScanStep:
<QRScanner
  active={step === 'scan'}
  onScan={(qr) => {
    handleBoxOrItemScan(qr);  // parse + determine if box or item
  }}
/>
```

### 9.2 Smart Scan Detection

The scan input should auto-detect whether the scanned code is a **box barcode** or an **item QR code**:

```typescript
function detectScanType(raw: string): 'box' | 'item' {
  // Box barcodes match: {10-digit delivery_no}-{C|E}{4-digit suffix}
  const boxPattern = /^\d{10}-[CE]\d{4}$/;
  if (boxPattern.test(raw.trim())) return 'box';
  return 'item';
}
```

This means the operator doesn't need to switch modes — just keep scanning. Box barcodes trigger box actions, item QR codes trigger item actions.

### 9.3 Manual Input (Desktop)

For desktop/keyboard users, the scan input field accepts:
- Direct typing (item code or box number)
- Paste from external scanner
- QR code content from USB scanner

### 9.4 Parsing Logic

```typescript
function parseItemQR(raw: string): { itemCode: string; qty: number; price: number } {
  const cleaned = raw.trim();
  const parts = cleaned.split('-');
  
  if (parts.length >= 3) {
    const price = parseFloat(parts[parts.length - 1]) || 0;
    const qty = parseInt(parts[parts.length - 2]) || 1;
    const itemCode = parts.slice(0, parts.length - 2).join('-');
    return { itemCode, qty, price };
  }
  
  if (parts.length === 2) {
    const qty = parseInt(parts[1]) || 1;
    return { itemCode: parts[0], qty, price: 0 };
  }
  
  return { itemCode: cleaned, qty: 1, price: 0 };
}
```

---

## 10. Error Handling

### 10.1 Scan Errors

| Error | Response | UX |
|-------|----------|-----|
| Unknown box | `status: "not_found"` | Red flash + "Box not in packing list" toast |
| Unknown item code | `status: "unknown"` | Red flash + "Item not in this box" toast |
| Duplicate box scan | `status: "already_received"` | Yellow flash + "Box already received" toast |
| Excess qty | `status: "excess"` | Orange flash + "Excess: X over expected" |
| QR parse failure | `error: "invalid_qr"` | Red flash + "Cannot read QR code" |

### 10.2 Import Errors

| Error | Response | UX |
|-------|----------|-----|
| Invalid file format | 400 | "Please upload .xlsx file" |
| No data rows | 400 | "File appears empty" |
| Missing columns | 400 | "Missing required columns: Part Code, Qty, Box Number" |
| Duplicate import | 200 with warning | "This packing list was already imported" |

### 10.3 Network Errors

| Scenario | Behavior |
|----------|----------|
| Offline during scan | Queue scan locally, sync when online |
| API timeout | Show "Retrying..." with exponential backoff |
| Session expired | Redirect to login with return URL |

---

## 11. Driver Tracking Flow

### 11.1 At Import Time

When importing the packing list, the operator enters:
- **Driver Name** — who delivered the truck (stored in `grn_sessions.driver_name`)
- **Driver Phone** — optional (stored in `grn_sessions.driver_phone`)
- **Transporter** — company name (stored in `grn_sessions.transporter`)
- **Truck No** — optional (stored in `grn_sessions.truck_no`)

No separate `driver_deliveries` table — all info stays on `grn_sessions`.

### 11.2 At Box Level

Each box scanned records:
- `scanned_by` (user_id of the receiver) on `grn_cartons`
- `scanned_at` (timestamp) on `grn_cartons`

The driver is linked at session level, not per-box.

### 11.3 Driver History (Future Enhancement)

To auto-fill driver info, query recent `grn_sessions` with `driver_name IS NOT NULL`:
```sql
SELECT DISTINCT driver_name, driver_phone, transporter, truck_no, MAX(created_at) as last_seen
FROM grn_sessions
WHERE driver_name IS NOT NULL AND created_at > NOW() - INTERVAL '30 days'
GROUP BY driver_name, driver_phone, transporter, truck_no
ORDER BY last_seen DESC
LIMIT 20
```

---

## 12. Integration Points

### 12.1 With GRN Module

The receiving wizard writes directly to existing GRN tables:
- `grn_sessions` — one session per import
- `grn_cartons` — one carton per box
- `grn_lines` — one line per item per box
- `grn_events` — PACKING_LIST_IMPORTED, BOX_SCANNED, ITEM_SCANNED, ITEM_AUTO_MATCHED, BOX_VERIFIED

This means the existing GRN supervisor view, exceptions, and putaway flow continue to work unchanged.

### 12.2 With Putaway Module

After all boxes are received, items are available for putaway based on `route_location`:
- Items routed to `INCOMING-01` appear in putaway suggestions
- Items routed to `QUALITY_INSPECTION-01` go to QI queue
- Items routed to `REJECT-01` go to hold area

### 12.3 With Exceptions Module

Shortages, excesses, and unknown items create exceptions in `grn_exceptions`:
- `shortage` — scanned < expected
- `excess` — scanned > expected
- `unknown_item` — item not in packing list
- `wrong_box` — item belongs to different box

---

## 13. Implementation Phases

### Phase 1: Fix Existing + Backend (Days 1–2)

| Task | File | Est. |
|------|------|------|
| **Fix column mappings** in xlsx_import.go | `api/modules/packinglist/xlsx_import.go` | 1h |
| Migration 036 (extend existing tables) | `migrations/036_receiving_wizard.sql` | 1h |
| Receiving import handler (with auto-skip) | `api/modules/packinglist/receiving.go` | 4h |
| RF scan handler (scan-box with auto-complete) | `api/modules/grn/rf_scan.go` | 4h |
| Filtering endpoints (invoices, DNs, boxes) | `api/modules/packinglist/receiving.go` | 2h |
| Route registration | `api/modules/grn/handler.go` | 1h |
| Unit tests | `*_test.go` | 3h |

### Phase 2: Frontend Core (Days 3–4)

| Task | File | Est. |
|------|------|------|
| API service methods | `web/src/services/api.ts` | 1h |
| ReceivingWizard page | `web/src/pages/ReceivingWizard.tsx` | 3h |
| ImportStep component | `web/src/components/receiving/ImportStep.tsx` | 2h |
| SelectStep component (optional) | `web/src/components/receiving/SelectStep.tsx` | 1h |
| ProgressiveScanStep (core) | `web/src/components/receiving/ProgressiveScanStep.tsx` | 5h |
| ItemScanPanel (inline) | `web/src/components/receiving/ItemScanPanel.tsx` | 2h |
| ScanFeed | `web/src/components/receiving/ScanFeed.tsx` | 1h |
| CompleteStep | `web/src/components/receiving/CompleteStep.tsx` | 1h |
| QRScanner + smart detection | `web/src/components/receiving/QRScanner.tsx` | 2h |

### Phase 3: Styling + Polish (Day 5)

| Task | File | Est. |
|------|------|------|
| CSS responsive styles | `web/src/styles/receiving-wizard.css` | 2h |
| Animations + transitions | CSS + component updates | 1h |
| Sound effects | Audio files + integration | 1h |
| Skeleton loading | Component updates | 1h |
| Error states | Component updates | 1h |
| End-to-end flow test | — | 2h |

---

## 14. Acceptance Criteria

### 14.1 Must Have

- [ ] Import .xlsx packing list → parses all rows correctly with **correct column mappings**
- [ ] Auto-skip invoice/DN selection when only 1 invoice + 1 DN
- [ ] Scan box barcode → **auto-completes single-item boxes** with default route
- [ ] Scan box barcode → opens inline item scan for multi-item boxes
- [ ] Scan item QR (item-qty-price format) → matches against expected
- [ ] Progress bar updates in real-time
- [ ] Auto-complete box when all items match
- [ ] Default route (INCOMING-01) applied to all matched items
- [ ] Exception routing: only ask for location on shortage/excess items
- [ ] Driver info captured at import (on grn_sessions)
- [ ] All screens responsive (desktop, tablet, mobile)
- [ ] Scan input auto-focused, auto-clears on success
- [ ] Audio feedback on scan (beep for success, buzz for error)
- [ ] No new database tables — extends existing grn_cartons + grn_lines

### 14.2 Should Have

- [ ] Smart scan detection (auto-detect box vs item barcode)
- [ ] Camera-based QR scanning (mobile)
- [ ] Driver history autocomplete
- [ ] Skeleton loading states
- [ ] Optimistic UI (instant feedback before API)
- [ ] Offline scan queue
- [ ] Keyboard shortcuts (Enter to scan, Escape to go back)

### 14.3 Nice to Have

- [ ] Print box labels with QR codes
- [ ] Batch scan mode (scan multiple items rapidly)
- [ ] Voice command integration
- [ ] Thermal printer support for labels

---

## 15. Out of Scope

- Modifying the existing GRN.tsx page (it remains for supervisor use)
- Real-time WebSocket updates (future enhancement)
- Multi-warehouse receiving (single warehouse for now)
- Automated putaway routing (manual location selection for exceptions only)
- Integration with external EDI systems
- Creating new `packing_list_staging` or `driver_deliveries` tables (use existing tables)

---

## 16. Performance Comparison (v1 → v2)

| Metric | v1 (Original Spec) | v2 (Optimised) |
|--------|--------------------|--------------------|
| Taps per single-item box | ~4 (open, scan, complete, route) | **1** (scan box) |
| Total taps for 60-box delivery | ~240+ | **~65** |
| Screens navigated | 6 | **3** (import, scan loop, summary) |
| Estimated time for 60 boxes | 45–60 min | **15–20 min** |
| New database tables | 2 | **0** (extend existing) |
| Code duplication risk | High (parallel pipeline) | **None** |
| Column mapping accuracy | Broken (Part No ≠ Part Code) | **Fixed** |

---

*Spec v2 revised based on analysis of actual Spares PackingLIST.xlsx data and existing goWMS codebase. Ready for implementation.*
