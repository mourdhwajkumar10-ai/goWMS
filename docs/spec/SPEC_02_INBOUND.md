# SPEC 02 — Inbound Operations (GRN, Quality Check, Putaway)

> **For coding agent.** This spec covers receiving goods from suppliers, quality inspection, and putting items away into warehouse locations. Designed for simplicity — a receiving person with minimal tech skills should be able to operate this with a phone/tablet.

---

## ASSUMPTIONS

1. **Supplier sends packing list** (Excel/CSV) before or with the shipment
2. **Packing list format** matches the sample: Dealer Code, Dealer, Branch, InvoiceNo, InvoiceDate, Delivery No, Delivery date, Plant, Box No.From, Box No.To, Part Code, Part Name, Qty, Calculated Part Weight(in KG), Box Number
3. **Receiving is box-based** — items arrive in supplier boxes, receiver checks boxes first, then items inside
4. **Quality Check is configurable** — can be mandatory, optional, or skipped per item/category
5. **Putaway suggests locations** but worker can override
6. **Barcode scanning is supported** but not required — manual entry works too
7. **Multiple POs can be received in one GRN session**
8. **Partial receiving is allowed** — receive what arrived, rest stays on PO
9. **Weight verification** — compare received weight vs packing list weight
10. **Damage reporting** — photo + note for damaged items
11. **One person can do GRN + QC + Putaway** in a small warehouse (no need for separate staff)

---

## 1. INBOUND FLOW OVERVIEW

```
Supplier Shipment Arrives
    │
    ▼
┌─────────────────┐
│  1. GRN Session  │  ← Create session, scan/import packing list
│     (Receiving)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. Box Check    │  ← Count boxes, check for damage, verify against packing list
│     (Box Level)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. Item Check   │  ← Open boxes, count items, verify part codes & qty
│     (Item Level) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. Quality      │  ← Inspect items (configurable per item/category)
│     Inspection   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. Putaway      │  ← Assign to bin locations, move stock
│     (Store)      │
└────────┬────────┘
         │
         ▼
    Stock Updated ✅
```

---

## 2. GRN SESSION

### 2.1 Creating a GRN Session

**Option A: From Purchase Order**
- Select PO → Auto-populate expected items & quantities
- Receiver verifies against actual delivery

**Option B: Blank Session (no PO)**
- For direct deliveries without PO
- Import packing list or enter manually

**Option C: Import Supplier Packing List**
- Upload the Excel/CSV from supplier
- System auto-creates GRN lines from the file

### 2.2 GRN Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grn_no` | text | Auto | GRN-YYYY-NNNNN |
| `session_id` | text | Auto | Unique session ID |
| `supplier_id` | FK | Yes | Supplier |
| `po_id` | FK | No | Linked Purchase Order |
| `invoice_no` | text | No | Supplier invoice number |
| `invoice_date` | date | No | |
| `delivery_no` | text | No | Supplier delivery note number |
| `delivery_date` | date | No | |
| `plant` | text | No | Supplier plant/location |
| `warehouse_id` | FK | Yes | Receiving warehouse |
| `dock` | text | No | Receiving dock/bay |
| `total_boxes_expected` | int | No | From packing list |
| `total_boxes_received` | int | No | Actual count |
| `total_items_expected` | int | No | From packing list |
| `total_items_received` | int | No | Actual count |
| `total_weight_expected` | decimal | No | From packing list (kg) |
| `total_weight_received` | decimal | No | Actual weight (kg) |
| `status` | enum | Auto | `open`, `receiving`, `qc_pending`, `qc_done`, `putaway_pending`, `completed`, `closed` |
| `received_by` | FK | Auto | Employee who received |
| `started_at` | datetime | Auto | |
| `completed_at` | datetime | Auto | |
| `notes` | text | No | |

### 2.3 GRN Line Items

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grn_id` | FK | Yes | Parent GRN |
| `po_line_id` | FK | No | Link to PO line |
| `part_code` | text | Yes | Supplier part code |
| `item_id` | FK | Yes | Matched to item master |
| `part_name` | text | Yes | |
| `box_number` | text | Yes | Supplier box number |
| `qty_expected` | int | Yes | From packing list |
| `qty_received` | int | Yes | Actual count |
| `qty_damaged` | int | Default 0 | Damaged count |
| `qty_short` | int | Default 0 | Shortage count |
| `weight_expected` | decimal | No | Weight from packing list |
| `weight_received` | decimal | No | Actual weight |
| `unit_price` | decimal | No | From PO |
| `qc_status` | enum | Auto | `pending`, `passed`, `failed`, `skipped` |
| `qc_notes` | text | No | |
| `putaway_status` | enum | Auto | `pending`, `assigned`, `done` |
| `putaway_location_id` | FK | No | Assigned bin |
| `status` | enum | Auto | `pending`, `received`, `verified`, `putaway` |

### 2.4 GRN Session UI

```
┌─ GRN Session: GRN-2026-00015 ──────────────────────────────────────────┐
│                                                                          │
│  Supplier: [Ganju Automotives ▾]    PO: [PO-2026-00004 ▾]  [+ Blank]  │
│  Invoice: 0541626874                 Delivery: 0043996767               │
│  Date: 09/07/2024                    Plant: Waluj                       │
│                                                                          │
│  ┌─ Progress ────────────────────────────────────────────────────────┐  │
│  │  ① Receiving  →  ② Box Check  →  ③ Item Check  →  ④ QC  →  ⑤ Putaway│
│  │     ✅ DONE        🟡 IN PROGRESS   ⬜ PENDING     ⬜      ⬜       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ Box Summary ─────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Expected: 15 boxes    Received: 12 boxes    Missing: 3           │  │
│  │  Damaged: 1 box        Weight OK: 11         Weight Mismatch: 1   │  │
│  │                                                                    │  │
│  │  [📷 Scan Box]  [+ Add Box Manually]  [📥 Import Packing List]    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ Boxes Received ──────────────────────────────────────────────────┐  │
│  │ Box Number          │ Items │ Weight  │ Status    │ Action         │  │
│  ├─────────────────────┼───────┼─────────┼───────────┼────────────────┤  │
│  │ 0043996767-E0064    │   1   │  0.3 kg │ ✅ OK     │ [View] [Edit]  │  │
│  │ 0043996767-E0063    │   1   │  1.6 kg │ ✅ OK     │ [View] [Edit]  │  │
│  │ 0043996767-E0062    │   1   │ 12.0 kg │ ✅ OK     │ [View] [Edit]  │  │
│  │ 0043996767-C0039    │   1   │  9.1 kg │ ⚠️ Weight │ [View] [Edit]  │  │
│  │ 0043996767-C0040    │   1   │  9.1 kg │ ✅ OK     │ [View] [Edit]  │  │
│  └─────────────────────┴───────┴─────────┴───────────┴────────────────┘  │
│                                                                          │
│  [← Back]  [Continue to Box Check →]                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. BOX CHECK (Box-Level Verification)

### 3.1 Process

```
For each box in the shipment:
  1. Scan or enter box number
  2. System shows expected contents (from packing list)
  3. Receiver verifies:
     - Box condition (OK / Damaged)
     - Box weight (compare to expected)
     - Seal integrity (sealed / opened / tampered)
  4. Mark box as: ✅ OK, ⚠️ Damaged, ❌ Missing
```

### 3.2 Box Check UI

```
┌─ Box Check: 0043996767-C0039 ───────────────────────────────────────────┐
│                                                                          │
│  Box Number: 0043996767-C0039                                          │
│  Expected Contents:                                                      │
│    - Part: BLOCK PISTON ASSLY-SPARES- K1 BLACK (DH101864)             │
│    - Qty: 4                                                             │
│    - Expected Weight: 9.148 kg                                          │
│                                                                          │
│  ┌─ Verification ────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Box Condition:  [ ✅ OK ]  [ ⚠️ Damaged ]  [ ❌ Wet/Crushed ]    │  │
│  │                                                                    │  │
│  │  Seal Status:    [ ✅ Sealed ]  [ ⚠️ Opened ]  [ ❌ Tampered ]    │  │
│  │                                                                    │  │
│  │  Actual Weight:  [ 9.2 ] kg    (Expected: 9.148 kg) ✅ Match      │  │
│  │                                                                    │  │
│  │  📷 Photo:     [Take Photo]  (required if damaged)                │  │
│  │                                                                    │  │
│  │  Notes: [                                        ]                 │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  [← Previous Box]  [Save & Next Box →]  [Save & Close]                │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Box-Level Inventory Tracking

**Key Design Decision:** Stock is tracked at **box level** until putaway. This means:
- Each box has a unique ID (supplier box number)
- Box contains specific items with quantities
- Box has a current location (dock → staging → bin)
- When items are putaway, stock moves from box to bin

```sql
-- Box tracking
CREATE TABLE grn_boxes (
    id UUID PRIMARY KEY,
    grn_id UUID REFERENCES grn_sessions(id),
    box_number TEXT NOT NULL,
    supplier_box_ref TEXT,
    condition TEXT DEFAULT 'ok',  -- ok, damaged, wet, crushed
    seal_status TEXT DEFAULT 'sealed',
    expected_weight_kg DECIMAL,
    actual_weight_kg DECIMAL,
    photo_urls TEXT[],
    current_location TEXT DEFAULT 'dock',
    status TEXT DEFAULT 'received',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. ITEM CHECK (Item-Level Verification)

### 4.1 Process

```
For each box:
  1. Open box
  2. Count items inside
  3. Verify part codes match packing list
  4. Check item condition
  5. Report: qty OK, qty damaged, qty short
```

### 4.2 Item Check UI

```
┌─ Item Check: Box 0043996767-C0039 ──────────────────────────────────────┐
│                                                                          │
│  Box Contents (from packing list):                                      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Part Code    │ Part Name                    │ Exp Qty │ Status   │   │
│  ├──────────────┼──────────────────────────────┼─────────┼──────────┤   │
│  │ DH101864     │ BLOCK PISTON ASSLY K1 BLACK  │    4    │ 🟡 Check │   │
│  └──────────────┴──────────────────────────────┴─────────┴──────────┘   │
│                                                                          │
│  ┌─ Item Detail ─────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Part: DH101864 — BLOCK PISTON ASSLY K1 BLACK                    │  │
│  │                                                                    │  │
│  │  Qty Received:   [ 4 ]  (Expected: 4)                            │  │
│  │  Qty Damaged:    [ 0 ]                                           │  │
│  │  Qty Short:      [ 0 ]  (auto-calculated)                        │  │
│  │                                                                    │  │
│  │  Condition: [ ✅ OK ]  [ ⚠️ Minor Damage ]  [ ❌ Reject ]        │  │
│  │                                                                    │  │
│  │  📷 Photo: [Take Photo]                                          │  │
│  │  Notes: [                                        ]                 │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  [← Previous Item]  [Save & Next Item →]  [Mark Box Complete ✓]        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. QUALITY INSPECTION (QC)

### 5.1 QC Configuration

QC is **configurable per item or category**:

| Setting | Options | Description |
|---------|---------|-------------|
| QC Required | Yes / No | Whether QC is needed |
| QC Type | Visual / Measurement / Functional / Full | Level of inspection |
| Sample Size | All / 10% / 20% / Random 5 | How many to inspect |
| Auto-Approve | Yes / No | If passed, auto-approve |

### 5.2 QC Checklist Templates

User-configurable checklists:

```
┌─ QC Template: Engine Parts ─────────────────────────────────────────────┐
│                                                                          │
│  Template Name: Engine Parts QC                                         │
│  Applies to: Category = Engine                                          │
│  Sample Size: All                                                       │
│                                                                          │
│  Checklist:                                                              │
│  ☑ Part number matches label           [Pass/Fail]                     │
│  ☑ No visible damage or scratches      [Pass/Fail]                     │
│  ☑ Correct packaging (bubble wrap)     [Pass/Fail]                     │
│  ☐ Weight within tolerance (±5%)       [Pass/Fail]                     │
│  ☐ Dimensions match spec               [Pass/Fail]                     │
│  ☐ Functional test (if applicable)     [Pass/Fail]                     │
│                                                                          │
│  [Save Template]  [Cancel]                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.3 QC Inspection UI

```
┌─ Quality Check: GRN-2026-00015 ─────────────────────────────────────────┐
│                                                                          │
│  Pending QC: 12 items across 5 boxes                                    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Box              │ Part          │ Qty │ QC Template │ Status    │   │
│  ├──────────────────┼───────────────┼─────┼─────────────┼───────────┤   │
│  │ E0064            │ JF402006      │  1  │ Electrical  │ ⬜ Pending │   │
│  │ E0063            │ 36JR0113      │ 10  │ Engine      │ ⬜ Pending │   │
│  │ E0062            │ JW131807      │ 80  │ Brake       │ ⬜ Pending │   │
│  │ E0061            │ DH111015      │100  │ Electrical  │ ⬜ Pending │   │
│  │ C0039            │ DH101864      │  4  │ Engine      │ 🟡 In QC  │   │
│  └──────────────────┴───────────────┴─────┴─────────────┴───────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

```
┌─ QC Inspection: DH101864 — BLOCK PISTON ASSLY ──────────────────────────┐
│                                                                          │
│  Box: 0043996767-C0039  |  Qty: 4  |  Template: Engine Parts QC        │
│                                                                          │
│  ┌─ Checklist ───────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  1. Part number matches label                                     │  │
│  │     [ ✅ Pass ]  [ ❌ Fail ]                                      │  │
│  │     Note: [                                        ]               │  │
│  │                                                                    │  │
│  │  2. No visible damage or scratches                                │  │
│  │     [ ✅ Pass ]  [ ❌ Fail ]                                      │  │
│  │     📷 Photo: [Take Photo]                                        │  │
│  │                                                                    │  │
│  │  3. Correct packaging (bubble wrap)                               │  │
│  │     [ ✅ Pass ]  [ ❌ Fail ]                                      │  │
│  │                                                                    │  │
│  │  4. Weight within tolerance (±5%)                                 │  │
│  │     Expected: 9.148 kg  |  Actual: [ 9.2 ] kg                    │  │
│  │     [ ✅ Pass ]  [ ❌ Fail ]                                      │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Overall: [ ✅ PASS ]  [ ❌ FAIL ]  [ ⚠️ CONDITIONAL PASS ]            │
│                                                                          │
│  Failure Reason (if failed): [                              ]            │
│  Action: [ Return to Supplier ]  [ Accept with Note ]  [ Scrap ]       │
│                                                                          │
│  [← Previous]  [Save & Next →]  [Complete QC ✓]                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.4 QC Status Flow

```
Item Received → QC Pending → QC In Progress → QC Passed → Putaway
                                        ↓
                                   QC Failed → Return/Scrap Decision
```

---

## 6. PUTAWAY

### 6.1 Putaway Strategy

System suggests locations based on:
1. **Item zone preference** (fast-moving → pick face, slow-moving → storage)
2. **Bin availability** (weight, volume, SKU count limits)
3. **Proximity** (nearest empty bin to reduce walking)
4. **FEFO** (for batch-tracked items, suggest location that allows proper rotation)

### 6.2 Putaway UI

```
┌─ Putaway: GRN-2026-00015 ───────────────────────────────────────────────┐
│                                                                          │
│  Pending Putaway: 8 items                                               │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Part          │ Qty │ Box         │ Suggested Bin │ Status       │   │
│  ├───────────────┼─────┼─────────────┼───────────────┼──────────────┤   │
│  │ JF402006      │  1  │ E0064       │ A1-B2-LA-01   │ ⬜ Pending   │   │
│  │ 36JR0113      │ 10  │ E0063       │ A1-B3-LA-05   │ ⬜ Pending   │   │
│  │ JW131807      │ 80  │ E0062       │ A2-B1-LA-01   │ ⬜ Pending   │   │
│  │ DH111015      │100  │ E0061       │ A2-B1-LA-02   │ ⬜ Pending   │   │
│  │ DH101864      │  4  │ C0039       │ A3-B1-LB-01   │ 🟡 Assigned  │   │
│  └───────────────┴─────┴─────────────┴───────────────┴──────────────┘   │
│                                                                          │
│  [📷 Scan Bin to Assign]  [Auto-Suggest All]  [Complete All]           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Putaway Confirmation UI (Mobile-Friendly)

```
┌─ Put Away: DH101864 ────────────────────────────────────────────────────┐
│                                                                          │
│  ┌──────────────────────────────────┐                                   │
│  │                                  │                                   │
│  │   BLOCK PISTON ASSLY             │                                   │
│  │   Part: DH101864                 │                                   │
│  │   Qty: 4                         │                                   │
│  │   Box: 0043996767-C0039          │                                   │
│  │                                  │                                   │
│  └──────────────────────────────────┘                                   │
│                                                                          │
│  Put into location:                                                      │
│                                                                          │
│  ┌──────────────────────────────────┐                                   │
│  │        📷 SCAN BIN               │                                   │
│  │        OR                        │                                   │
│  │   Suggested: A3-B1-LB-01        │                                   │
│  │   [Use Suggested] [Choose Other] │                                   │
│  └──────────────────────────────────┘                                   │
│                                                                          │
│  ✅ Stock updated: DH101864 → A3-B1-LB-01 (+4 qty)                    │
│                                                                          │
│  [Next Item →]                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 7. STOCK TRACKING BY BOX, BIN, SKU, ITEM

### 7.1 Multi-Level Stock Tracking

Stock is tracked at multiple levels simultaneously:

```
┌─ Stock View: FILTER-OIL-002 ────────────────────────────────────────────┐
│                                                                          │
│  Item: FILTER-OIL-002 (Oil Filter)                                     │
│  Total On Hand: 45                                                      │
│  Available: 42  |  Reserved: 3  |  In QC: 0                            │
│                                                                          │
│  ┌─ By Location ────────────────────────────────────────────────────┐   │
│  │ Location      │ Qty │ Batch      │ Box           │ Status        │   │
│  ├───────────────┼─────┼────────────┼───────────────┼───────────────┤   │
│  │ A1-B2-LA-01   │  20 │ BATCH-001  │ E0062         │ ✅ Available  │   │
│  │ A1-B2-LA-02   │  15 │ BATCH-001  │ E0063         │ ✅ Available  │   │
│  │ A2-B1-LA-01   │  10 │ BATCH-002  │ C0039         │ ✅ Available  │   │
│  └───────────────┴─────┴────────────┴───────────────┴───────────────┘   │
│                                                                          │
│  ┌─ By Batch ───────────────────────────────────────────────────────┐   │
│  │ Batch        │ Qty │ Mfg Date   │ Exp Date   │ Location          │   │
│  ├──────────────┼─────┼────────────┼────────────┼───────────────────┤   │
│  │ BATCH-001    │  35 │ 2024-01-15 │ 2025-01-15 │ A1-B2-LA-01/02  │   │
│  │ BATCH-002    │  10 │ 2024-06-01 │ 2025-06-01 │ A2-B1-LA-01     │   │
│  └──────────────┴─────┴────────────┴────────────┴───────────────────┘   │
│                                                                          │
│  ┌─ By Box (Supplier Reference) ────────────────────────────────────┐   │
│  │ Box Number       │ Qty │ Contents          │ Location             │   │
│  ├──────────────────┼─────┼───────────────────┼──────────────────────┤   │
│  │ 0043996767-E0062 │  20 │ Oil Filter        │ A1-B2-LA-01         │   │
│  │ 0043996767-E0063 │  15 │ Oil Filter        │ A1-B2-LA-02         │   │
│  │ 0043996767-C0039 │  10 │ Oil Filter        │ A2-B1-LA-01         │   │
│  └──────────────────┴─────┴───────────────────┴──────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Database Schema (Inbound + Stock)

```sql
-- GRN Sessions
CREATE TABLE grn_sessions (
    id UUID PRIMARY KEY,
    grn_no TEXT UNIQUE NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),
    po_id UUID REFERENCES purchase_orders(id),
    invoice_no TEXT,
    invoice_date DATE,
    delivery_no TEXT,
    delivery_date DATE,
    plant TEXT,
    warehouse_id UUID REFERENCES warehouses(id),
    dock TEXT,
    total_boxes_expected INT DEFAULT 0,
    total_boxes_received INT DEFAULT 0,
    total_items_expected INT DEFAULT 0,
    total_items_received INT DEFAULT 0,
    total_weight_expected DECIMAL DEFAULT 0,
    total_weight_received DECIMAL DEFAULT 0,
    status TEXT DEFAULT 'open',
    received_by UUID REFERENCES employees(id),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    notes TEXT
);

-- GRN Line Items
CREATE TABLE grn_lines (
    id UUID PRIMARY KEY,
    grn_id UUID REFERENCES grn_sessions(id),
    po_line_id UUID,
    part_code TEXT NOT NULL,
    item_id UUID REFERENCES items(id),
    part_name TEXT,
    box_number TEXT,
    qty_expected INT NOT NULL,
    qty_received INT DEFAULT 0,
    qty_damaged INT DEFAULT 0,
    qty_short INT DEFAULT 0,
    weight_expected DECIMAL,
    weight_received DECIMAL,
    unit_price DECIMAL,
    qc_status TEXT DEFAULT 'pending',
    qc_notes TEXT,
    putaway_status TEXT DEFAULT 'pending',
    putaway_location_id UUID REFERENCES locations(id),
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GRN Boxes
CREATE TABLE grn_boxes (
    id UUID PRIMARY KEY,
    grn_id UUID REFERENCES grn_sessions(id),
    box_number TEXT NOT NULL,
    supplier_box_ref TEXT,
    condition TEXT DEFAULT 'ok',
    seal_status TEXT DEFAULT 'sealed',
    expected_weight_kg DECIMAL,
    actual_weight_kg DECIMAL,
    photo_urls TEXT[],
    current_location TEXT DEFAULT 'dock',
    status TEXT DEFAULT 'received',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quality Check
CREATE TABLE qc_inspections (
    id UUID PRIMARY KEY,
    grn_line_id UUID REFERENCES grn_lines(id),
    item_id UUID REFERENCES items(id),
    template_id UUID,
    inspector_id UUID REFERENCES employees(id),
    result TEXT,  -- passed, failed, conditional
    checklist_results JSONB,  -- [{check: "...", result: "pass/fail", note: "..."}]
    failure_reason TEXT,
    action TEXT,  -- return, accept, scrap
    photo_urls TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QC Templates
CREATE TABLE qc_templates (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    category_id UUID REFERENCES categories(id),
    sample_size TEXT DEFAULT 'all',  -- all, 10%, 20%, random_5
    checklist JSONB NOT NULL,  -- [{item: "...", type: "pass_fail"}]
    auto_approve BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active'
);

-- Stock (current on-hand by location + batch)
CREATE TABLE stock (
    id UUID PRIMARY KEY,
    item_id UUID REFERENCES items(id),
    location_id UUID REFERENCES locations(id),
    warehouse_id UUID REFERENCES warehouses(id),
    batch_id UUID,
    box_ref TEXT,
    qty_on_hand INT DEFAULT 0,
    qty_reserved INT DEFAULT 0,
    qty_available INT GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,
    last_grn_id UUID REFERENCES grn_sessions(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, location_id, batch_id, box_ref)
);

-- Stock Ledger (all movements)
CREATE TABLE stock_ledger (
    id UUID PRIMARY KEY,
    item_id UUID REFERENCES items(id),
    location_id UUID REFERENCES locations(id),
    warehouse_id UUID REFERENCES warehouses(id),
    batch_id UUID,
    box_ref TEXT,
    doc_type TEXT,  -- grn, putaway, pick, pack, dispatch, transfer, adjustment
    doc_id UUID,
    qty_change INT,  -- positive = in, negative = out
    qty_before INT,
    qty_after INT,
    reference TEXT,
    created_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. API ENDPOINTS (Inbound)

```
# GRN Sessions
GET    /api/grn?status=&supplier_id=&date_from=&date_to=
POST   /api/grn
GET    /api/grn/{id}
PUT    /api/grn/{id}
POST   /api/grn/{id}/import-packing-list    # Upload supplier Excel
POST   /api/grn/{id}/start-receiving
POST   /api/grn/{id}/complete

# GRN Lines
GET    /api/grn/{id}/lines
POST   /api/grn/{id}/lines
PUT    /api/grn/{id}/lines/{line_id}

# GRN Boxes
GET    /api/grn/{id}/boxes
POST   /api/grn/{id}/boxes
PUT    /api/grn/{id}/boxes/{box_id}
POST   /api/grn/{id}/boxes/{box_id}/check

# Quality Check
GET    /api/qc/pending?grn_id=
POST   /api/qc/{grn_line_id}/inspect
GET    /api/qc/templates
POST   /api/qc/templates

# Putaway
GET    /api/putaway/pending?grn_id=
POST   /api/putaway/{grn_line_id}/assign-location
POST   /api/putaway/{grn_line_id}/confirm
POST   /api/putaway/suggest-locations

# Stock
GET    /api/stock?item_id=&warehouse_id=&location_id=
GET    /api/stock/{item_id}/by-location
GET    /api/stock/{item_id}/by-batch
GET    /api/stock/{item_id}/by-box
GET    /api/stock/ledger?item_id=&date_from=&date_to=
```

---

## 9. SIMPLIFIED FLOW (For Receiving Person)

### Receiving a Shipment (Step by Step)

```
Step 1: Truck arrives → Go to GRN → + New Session
Step 2: Select Supplier → Enter Invoice No, Delivery No
Step 3: Upload supplier packing list (Excel) → System auto-loads expected items
Step 4: Count boxes → Scan each box barcode → Verify against list
Step 5: For each box → Open → Count items → Verify part codes
Step 6: If items need QC → System shows checklist → Check each item → Pass/Fail
Step 7: For each received item → Scan bin barcode → Put item in bin
Step 8: Mark GRN Complete → Stock auto-updated ✅

Total time: ~15-30 minutes for a 15-box shipment
```

### QC Inspection (Step by Step)

```
Step 1: System shows "QC Pending" items on dashboard
Step 2: Tap an item → Shows QC checklist
Step 3: Check each point (visual, weight, etc.) → Tap Pass or Fail
Step 4: If Fail → Take photo → Choose: Return / Accept with Note / Scrap
Step 5: Save → Item moves to Putaway (or Returns zone)

Total time: ~2-5 minutes per item
```
