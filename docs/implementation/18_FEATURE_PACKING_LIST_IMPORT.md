# Feature 18 — Packing List Import (Configurable Templates)

**Spec References:** SPEC_02_INBOUND.md §2.1 Option C, spares_packing_list.xlsx
**Status:** PARTIAL (import + templates exist; supplier-scoped template UI polish TODO)
**Priority:** HIGH — core receiving workflow

---

## Packing List Format Analysis

### Actual File: spares_packing_list.xlsx

| Col | Header | Maps To (WMS) | Notes |
|-----|--------|----------------|-------|
| 0 | Dealer Code | customer code | Header-level, same for all rows |
| 1 | Dealer | customer name | Header-level |
| 2 | Branch | branch info | Header-level |
| 3 | InvoiceNo | grn.invoice_no | Header-level |
| 4 | InvoiceDate | grn.invoice_date | Header-level, datetime |
| 5 | Delivery No | grn.delivery_no | Header-level |
| 6 | Delivery date | grn.delivery_date | Header-level, datetime |
| 7 | Plant | grn.plant | Header-level (supplier plant) |
| 8 | Box No.From | — | Range start, not needed (use col 14) |
| 9 | Box No.To | — | Range end, not needed |
| 10 | Part Code | grn_line.item_code | Line-level |
| 11 | Part Name | grn_line.part_name | Line-level |
| 12 | Qty | grn_line.expected_qty | Line-level |
| 13 | Calculated Part Weight(in KG) | weight tracking | Line-level, decimal |
| 14 | Box Number | grn_carton.carton_no | Line-level — the actual box ID |
| 15 | [empty] | — | Ignore |

### Key Patterns
- **64 rows**, 60 unique boxes, 22 unique items
- **One row = one part in one box** (not one row per order)
- **One box can contain multiple parts** (E0055 has 4 items)
- **Same part across multiple boxes** (DH101864 in 16 different boxes)
- **Last row is summary** (qty total: 2268, weight total: 458.7) — must be skipped
- **Box No.From/To are ranges** but Box Number (col 14) is the actual box — use only Box Number
- **Header fields repeat on every row** — extract once from first data row

### Why Configurable Templates?
Different suppliers (Bajaj, TVS, Hero, etc.) will have different column names:
- Bajaj: "Part Code", "Calculated Part Weight(in KG)"
- TVS: "SKU", "Weight (kg)"
- Hero: "Material Code", "Net Weight"

User must map their supplier's column names to WMS fields.

---

## Design

### Template Structure (JSONB)

```json
{
  "header_row": 1,
  "data_start_row": 2,
  "skip_tail_rows": 1,
  "columns": {
    "dealer_code": "Dealer Code",
    "dealer_name": "Dealer",
    "branch": "Branch",
    "invoice_no": "InvoiceNo",
    "invoice_date": "InvoiceDate",
    "delivery_no": "Delivery No",
    "delivery_date": "Delivery date",
    "plant": "Plant",
    "part_code": "Part Code",
    "part_name": "Part Name",
    "qty": "Qty",
    "weight_kg": "Calculated Part Weight(in KG)",
    "box_number": "Box Number"
  },
  "skip_columns": ["Box No.From", "Box No.To"],
  "box_number_column": "Box Number"
}
```

### Import Flow

```
User opens GRN session
    │
    ▼
Clicks "Import Packing List"
    │
    ▼
Selects supplier (auto-loads default template)
    │
    ▼
Uploads CSV/Excel file
    │
    ▼
System parses with template column mapping:
  1. Read header row, match to template columns
  2. Skip tail rows (summary)
  3. Extract header-level fields from first data row
  4. Group data rows by Box Number → create grn_cartons
  5. Create grn_lines for each row
  6. Validate: item_code must exist in item master
    │
    ▼
Show import preview:
  - Session: Invoice #0541626874, Supplier: Bajaj, 60 boxes, 64 lines
  - Items found: 20/22 (2 unknown → will trigger complete master)
  - Warnings: ...
    │
    ▼
User confirms → GRN lines created, ready for box check
```

---

## DB Schema

```sql
CREATE TABLE IF NOT EXISTS supplier_pack_list_templates (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER REFERENCES suppliers(id),
    template_name TEXT NOT NULL,
    column_mapping JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link default template to supplier
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS default_pack_list_template_id INTEGER REFERENCES supplier_pack_list_templates(id);
```

---

## API Endpoints

```
# Template Management (actual)
GET    /api/packing-list/templates
POST   /api/packing-list/templates

# Packing List Import (actual primary paths)
POST   /api/packing-list/import              -- JSON rows + grn_session_id
POST   /api/packing-list/import-xlsx         -- multipart file + grn_session_id

# Docs/QA aliases under GRN (also registered)
POST   /api/grn/:id/import-packing-list      -- multipart xlsx OR JSON rows (session from :id)
POST   /api/grn/:id/import-xlsx              -- multipart xlsx (session from :id)
```

### Doc corrections (was wrong)

| Old doc claim | Actual |
|---------------|--------|
| Status NOT DONE / no handler | Built: `api/modules/packinglist/` |
| Only `POST /api/grn/:id/import-packing-list` | Primary paths are under `/packing-list/...`; GRN aliases added |
| Templates under `/api/suppliers/:id/packing-templates` | Templates at `/api/packing-list/templates` |

---

## Frontend

### Template Manager (in Suppliers.tsx detail view)

```
┌─ Packing List Templates ──────────────────────────────────────────┐
│                                                                     │
│  Supplier: Bajaj Auto (Waluj Plant)                                │
│  Default Template: [Bajaj Standard ▾]                              │
│                                                                     │
│  [+ New Template]                                                   │
│                                                                     │
│  ┌─ Bajaj Standard ──────────────────────────────────────────────┐ │
│  │ Columns:                                                       │ │
│  │   Invoice No    → [ InvoiceNo ▾ ]                             │ │
│  │   Delivery No   → [ Delivery No ▾ ]                           │ │
│  │   Part Code     → [ Part Code ▾ ]                             │ │
│  │   Qty           → [ Qty ▾ ]                                   │ │
│  │   Weight        → [ Calculated Part Weight(in KG) ▾ ]         │ │
│  │   Box Number    → [ Box Number ▾ ]                            │ │
│  │                                                                │ │
│  │ Header Row: [1]  |  Skip Tail Rows: [1]                       │ │
│  │                                                                │ │
│  │ [Test with Sample File]  [Save]  [Set as Default]             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### GRN Import UI (in GRN.tsx session view)

```
┌─ Import Packing List ──────────────────────────────────────────────┐
│                                                                     │
│  Supplier: [Bajaj Auto ▾]  (auto-loads template)                   │
│  Template: [Bajaj Standard ▾]                                      │
│                                                                     │
│  📄 Drop CSV/Excel here or [Browse Files]                           │
│                                                                     │
│  ┌─ Preview ─────────────────────────────────────────────────────┐ │
│  │ Invoice: 0541626874  |  Delivery: 0043996767                  │ │
│  │ Boxes: 60  |  Items: 64 lines  |  22 unique parts            │ │
│  │                                                                │ │
│  │ ✅ 20 items matched to item master                             │ │
│  │ ⚠️  2 items unknown (will prompt for master completion):       │ │
│  │    - 36DJ4032 (KIT MIN CAL END)                               │ │
│  │    - 36DS1502 (SpeedoGear Kit)                                │ │
│  │                                                                │ │
│  │ First 5 lines:                                                │ │
│  │ Box           │ Part Code │ Name              │ Qty │ Weight  │ │
│  │ E0064         │ JF402006  │ UNIT REGULATOR    │   1 │ 0.31 kg│ │
│  │ E0063         │ 36JR0113  │ KIT CLUTCH PLATE  │  10 │ 1.62 kg│ │
│  │ ...                                                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  [Cancel]  [Import 60 Boxes, 64 Lines →]                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Go Import Logic

```go
// Pseudocode for POST /grn/:id/import-packing-list
func importPackingList(c *fiber.Ctx) error {
    // 1. Parse uploaded file (CSV or Excel)
    file := c.FormFile("file")
    rows := parseFile(file)  // CSV or xlsx

    // 2. Load template (from template_id or supplier default)
    template := loadTemplate(templateID, supplierID)

    // 3. Map columns using template.column_mapping
    //    e.g., template says "Part Code" column → WMS "part_code" field

    // 4. Skip tail rows (summary)
    dataRows := rows[template.dataStartRow : len(rows)-template.skipTailRows]

    // 5. Extract header-level fields from first data row
    header := extractHeader(dataRows[0], template)
    // → invoice_no, delivery_no, delivery_date, plant, supplier_name

    // 6. Group by Box Number → create grn_cartons
    boxMap := groupByBoxNumber(dataRows, template)
    for boxNo, lines := range boxMap {
        carton := createCarton(grnID, boxNo)
        // Also store expected weight per box
    }

    // 7. Create grn_lines for each row
    for _, row := range dataRows {
        itemCode := row[template.columns.part_code]
        // Check item master exists + complete
        // Create grn_line with expected_qty, weight, batch
    }

    // 8. Return summary
    return c.JSON(importResult{...})
}
```

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 02 Item Master | Unknown items need master completion | Import creates lines, GRN flow handles unknowns |
| 04 GRN | Import feeds into GRN session | Import is called ON a GRN session |
| 17 Supplier | Template linked to supplier | FK to suppliers table |
| Box tracking | Box Number → grn_carton | Use Box Number (col 14), ignore Box No.From/To |

---

## Acceptance Criteria

- [ ] Create packing list template with column mapping
- [ ] Set default template per supplier
- [ ] Import packing list into GRN session
- [ ] Auto-create cartons from Box Number column
- [ ] Auto-create grn_lines with expected qty
- [ ] Extract header-level fields (invoice, delivery, plant)
- [ ] Skip summary rows (configurable)
- [ ] Show import preview before confirming
- [ ] Handle unknown items (prompt for master completion)
- [ ] Weight tracking per line

---

## Implementation Plan

### Phase 1 — Template System (2 days)
1. Migration: create supplier_pack_list_templates table
2. Template CRUD handler
3. Template manager UI in Suppliers.tsx

### Phase 2 — Import Engine (2-3 days)
1. File parser (CSV + Excel, using existing CSVTools or Go libraries)
2. Column mapping logic using template JSONB
3. GRN import endpoint (POST /grn/:id/import-packing-list)
4. Import preview + confirm UI in GRN.tsx

### Phase 3 — Auto-Detection (1 day, optional)
1. If no template provided, try to auto-detect column mapping from headers
2. Match known header patterns: "Part Code"/"SKU"/"Material Code" → part_code
3. Save detected mapping as new template
