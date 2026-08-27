# Receiving Pages Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the Receiving Management and RF Scanner pages with consistent naming, full packing list columns, simplified RF Scanner, dynamic location tracking, per-field search, and sellable WMS aesthetics.

**Architecture:** Database migration adds 5 new columns to `grn_cartons`. Backend updates persist and return these columns. Frontend rewrites `ReceivingManagement.tsx` (15-column manual entry, full detail modal with status + locations + per-field search) and `ReceivingWizard.tsx` (remove Driver/Transport, limit 5 POs, toast flashes).

**Tech Stack:** Go 1.23, Fiber v2, pgx v5, PostgreSQL 16, React 18, Vite 5, TypeScript

## Global Constraints

- Go 1.23, Fiber v2, pgx v5
- React 18, Vite 5, TypeScript 5.6
- PostgreSQL 16
- 8px grid spacing, 12px border radius
- Accent: #2563eb
- No new dependencies unless absolutely necessary
- Migrations in `migrations/` directory, idempotent SQL

---

## File Structure

| File | Responsibility |
|------|---------------|
| `migrations/037_grn_cartons_extended_columns.sql` | Add 5 columns to `grn_cartons` |
| `api/modules/packinglist/management.go` | Persist + return new columns |
| `api/modules/packinglist/xlsx_import.go` | Add `Box No.To` to column map |
| `web/src/components/Layout.tsx` | Sidebar label change |
| `web/src/pages/ReceivingManagement.tsx` | Full rewrite: 15-col form, detail modal, search |
| `web/src/pages/ReceivingWizard.tsx` | Remove Driver/Transport, limit 5 POs, toasts |
| `web/src/styles/receiving-wizard.css` | Aesthetic overhaul, toast styles |
| `web/src/services/api.ts` | Update types for packingListGet |

---

### Task 1: Database Migration — Add 5 Columns to grn_cartons

**Files:**
- Create: `migrations/037_grn_cartons_extended_columns.sql`

**Interfaces:**
- Produces: `branch`, `invoice_date`, `delivery_date`, `box_no_from`, `box_no_to` columns on `grn_cartons`

- [ ] **Step 1: Create migration file**

```sql
-- migrations/037_grn_cartons_extended_columns.sql
-- Idempotent migration to add extended packing list columns to grn_cartons

ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS branch varchar(255);
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS invoice_date timestamptz;
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS delivery_date timestamptz;
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS box_no_from varchar(50);
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS box_no_to varchar(50);
```

- [ ] **Step 2: Run migration locally**

```bash
psql -U gowms -d gowms -f migrations/037_grn_cartons_extended_columns.sql
```

Expected: Commands succeed (ALTER TABLE)

- [ ] **Step 3: Verify columns exist**

```bash
psql -U gowms -d gowms -c "\d grn_cartons" | grep -E "branch|invoice_date|delivery_date|box_no_from|box_no_to"
```

Expected: All 5 columns listed

- [ ] **Step 4: Commit**

```bash
git add migrations/037_grn_cartons_extended_columns.sql
git commit -m "feat: add 5 extended packing list columns to grn_cartons"
```

---

### Task 2: Backend — Update xlsx_import.go Column Map

**Files:**
- Modify: `api/modules/packinglist/xlsx_import.go`

**Interfaces:**
- Consumes: Excel headers from uploaded file
- Produces: Updated `colMap` with `Box No.To`

- [ ] **Step 1: Find and update colMap in xlsx_import.go**

Find the `colMap` variable. Add `"box_no_to": "Box No.To"` to the map.

Current map (around line 86-101):
```go
colMap = map[string]string{
    "part_code":     "Part Code",
    "part_name":     "Part Name",
    "qty":           "Qty",
    "box_number":    "Box Number",
    "invoice_no":    "InvoiceNo",
    "delivery_no":   "Delivery No",
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

Updated:
```go
colMap = map[string]string{
    "part_code":     "Part Code",
    "part_name":     "Part Name",
    "qty":           "Qty",
    "box_number":    "Box Number",
    "invoice_no":    "InvoiceNo",
    "delivery_no":   "Delivery No",
    "dealer_code":   "Dealer Code",
    "dealer_name":   "Dealer",
    "plant":         "Plant",
    "invoice_date":  "InvoiceDate",
    "delivery_date": "Delivery date",
    "unit_weight":   "Calculated Part Weight(in KG)",
    "branch":        "Branch",
    "box_no_from":   "Box No.From",
    "box_no_to":     "Box No.To",
}
```

- [ ] **Step 2: Build to verify no compile errors**

```bash
go build ./cmd/server
```

Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add api/modules/packinglist/xlsx_import.go
git commit -m "feat: add Box No.To to xlsx_import column map"
```

---

### Task 3: Backend — Update management.go to Persist and Return All Columns

**Files:**
- Modify: `api/modules/packinglist/management.go`

**Interfaces:**
- Consumes: 5 new DB columns from `grn_cartons`
- Produces: Full JSON response with all carton + line fields

- [ ] **Step 1: Update importPackingListFile to persist new columns**

In the `importPackingListFile` function, after parsing existing fields, also parse the 5 new columns:

Find the row parsing loop (around line 351-404). After `partName` and `invoiceNo` are parsed, add:

```go
branch := getCell(row, "branch")
invoiceDate := getCell(row, "invoice_date")
deliveryDate := getCell(row, "delivery_date")
boxNoFrom := getCell(row, "box_no_from")
boxNoTo := getCell(row, "box_no_to")
```

Update the carton INSERT to include new columns:

```go
err = tx.QueryRow(c.Context(), `
    INSERT INTO grn_cartons (
        grn_session_id, carton_no, status, is_expected,
        dealer_code, dealer_name, delivery_no, plant, branch,
        invoice_date, delivery_date, box_no_from, box_no_to
    ) VALUES (
        $1, $2, 'expected', true,
        NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''),
        NULLIF($8, '')::timestamptz, NULLIF($9, '')::timestamptz, NULLIF($10, ''), NULLIF($11, '')
    ) RETURNING id`,
    sessionID, boxNo,
    getCell(row, "dealer_code"), getCell(row, "dealer_name"),
    getCell(row, "delivery_no"), getCell(row, "plant"), branch,
    invoiceDate, deliveryDate, boxNoFrom, boxNoTo,
).Scan(&cartonID)
```

- [ ] **Step 2: Update getPackingList to return all columns**

Update the items query to join on `grn_cartons` and return all fields:

```go
rows, err := db.Query(c.Context(), `
    SELECT 
        gl.id,
        COALESCE(gc.carton_no, '') as box_number,
        gl.item_code as part_code,
        COALESCE(gl.part_name, '') as part_name,
        gl.expected_qty,
        COALESCE(gl.scanned_qty, 0) as scanned_qty,
        COALESCE(gl.batch_no, '') as batch_no,
        COALESCE(gl.invoice_no, '') as invoice_no,
        COALESCE(gc.dealer_code, '') as dealer_code,
        COALESCE(gc.dealer_name, '') as dealer_name,
        COALESCE(gc.delivery_no, '') as delivery_no,
        COALESCE(gc.plant, '') as plant,
        COALESCE(gc.branch, '') as branch,
        gc.invoice_date,
        gc.delivery_date,
        COALESCE(gc.box_no_from, '') as box_no_from,
        COALESCE(gc.box_no_to, '') as box_no_to,
        COALESCE(gl.unit_weight_kg, 0) as unit_weight_kg,
        COALESCE(gl.status, 'pending') as status,
        COALESCE(gl.route_location, '') as route_location
    FROM grn_lines gl
    LEFT JOIN grn_cartons gc ON gl.grn_carton_id = gc.id
    WHERE gl.grn_session_id = $1
    ORDER BY gc.carton_no, gl.item_code`, id)
```

Update the `itemInfo` struct and Scan to match:

```go
type itemInfo struct {
    ID           int        `json:"id"`
    BoxNumber    string     `json:"box_number"`
    PartCode     string     `json:"part_code"`
    PartName     string     `json:"part_name"`
    ExpectedQty  float64    `json:"expected_qty"`
    ScannedQty   float64    `json:"scanned_qty"`
    BatchNo      string     `json:"batch_no"`
    InvoiceNo    string     `json:"invoice_no"`
    DealerCode   string     `json:"dealer_code"`
    DealerName   string     `json:"dealer_name"`
    DeliveryNo   string     `json:"delivery_no"`
    Plant        string     `json:"plant"`
    Branch       string     `json:"branch"`
    InvoiceDate  *time.Time `json:"invoice_date"`
    DeliveryDate *time.Time `json:"delivery_date"`
    BoxNoFrom    string     `json:"box_no_from"`
    BoxNoTo      string     `json:"box_no_to"`
    UnitWeight   float64    `json:"unit_weight_kg"`
    Status       string     `json:"status"`
    RouteLocation string    `json:"route_location"`
}
```

Update the Scan call to match all 20 columns.

- [ ] **Step 3: Build to verify**

```bash
go build ./cmd/server
```

Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add api/modules/packinglist/management.go
git commit -m "feat: persist and return all 15 packing list columns"
```

---

### Task 4: Frontend — Update Sidebar Naming

**Files:**
- Modify: `web/src/components/Layout.tsx:18`

**Interfaces:**
- Produces: Updated sidebar label

- [ ] **Step 1: Change sidebar label**

Find line 18:
```tsx
{ to: "/receiving-management", label: "Receiving Management", icon: "📋" },
```

Change to:
```tsx
{ to: "/receiving-management", label: "Receiving", icon: "📋" },
```

- [ ] **Step 2: Build to verify**

```bash
cd web && npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Layout.tsx
git commit -m "feat: rename sidebar label to Receiving"
```

---

### Task 5: Frontend — Update API Types for Full Column Support

**Files:**
- Modify: `web/src/services/api.ts`

**Interfaces:**
- Produces: Updated `PackingListItem` type with all 20 fields

- [ ] **Step 1: Update PackingListItem interface**

Find the `PackingListItem` interface (around line 39-47 in ReceivingManagement.tsx, but types may also need updating in api.ts). The types are currently defined in `ReceivingManagement.tsx`. We'll update them there in Task 6.

No changes needed in `api.ts` itself — the API response is already typed as `any`. The type definitions live in the page component.

- [ ] **Step 2: Commit (no-op, skip if no changes)**

If no changes were needed, skip this commit.

---

### Task 6: Frontend — Rewrite ReceivingManagement.tsx

**Files:**
- Modify: `web/src/pages/ReceivingManagement.tsx`
- Modify: `web/src/styles/receiving-wizard.css`

**Interfaces:**
- Consumes: Full packing list data from API (all 20 fields)
- Produces: Updated page with 15-column manual entry, full detail modal with status + locations + per-field search

This is the largest task. Break it into sub-steps:

- [ ] **Step 1: Update ParsedRow interface to include all 15 fields**

```tsx
interface ParsedRow {
  _index: number;
  _selected: boolean;
  _duplicate: boolean;
  _empty: boolean;
  dealer_code: string;
  dealer_name: string;
  branch: string;
  invoice_no: string;
  invoice_date: string;
  delivery_no: string;
  delivery_date: string;
  plant: string;
  box_no_from: string;
  box_no_to: string;
  part_code: string;
  part_name: string;
  qty: number;
  unit_weight: number;
  box_number: string;
  raw: Record<string, any>;
}
```

- [ ] **Step 2: Update PackingListItem interface**

```tsx
interface PackingListItem {
  id: number;
  box_number: string;
  part_code: string;
  part_name: string;
  expected_qty: number;
  scanned_qty: number;
  batch_no: string;
  invoice_no: string;
  dealer_code: string;
  dealer_name: string;
  delivery_no: string;
  plant: string;
  branch: string;
  invoice_date: string;
  delivery_date: string;
  box_no_from: string;
  box_no_to: string;
  unit_weight_kg: number;
  status: string;
  route_location: string;
}
```

- [ ] **Step 3: Update parseAndPreview to parse all 15 columns**

Update the `get()` function calls to include all column names:

```tsx
return {
  _index: i,
  _selected: true,
  _duplicate: false,
  _empty: false,
  dealer_code: get(["Dealer Code", "dealer_code"]),
  dealer_name: get(["Dealer", "dealer_name"]),
  branch: get(["Branch", "branch"]),
  invoice_no: get(["InvoiceNo", "Invoice No", "invoice_no"]),
  invoice_date: get(["InvoiceDate", "Invoice Date", "invoice_date"]),
  delivery_no: get(["Delivery No", "delivery_no"]),
  delivery_date: get(["Delivery date", "Delivery Date", "delivery_date"]),
  plant: get(["Plant", "plant"]),
  box_no_from: get(["Box No.From", "box_no_from"]),
  box_no_to: get(["Box No.To", "box_no_to"]),
  part_code: get(["Part Code", "PartCode", "part_code", "Part No", "PartNo", "Item Code"]),
  part_name: get(["Part Name", "PartName", "part_name"]),
  qty: getNum(["Qty", "qty", "Quantity", "Expected Qty"]),
  unit_weight: getNum(["Calculated Part Weight(in KG)", "unit_weight", "Weight", "Weight(KG)"]),
  box_number: get(["Box Number", "BoxNumber", "box_number", "Box No"]),
  raw: row,
};
```

- [ ] **Step 4: Update manualRows state to include all 15 fields**

```tsx
const [manualRows, setManualRows] = useState<{
  dealer_code: string; dealer_name: string; branch: string;
  invoice_no: string; invoice_date: string; delivery_no: string;
  delivery_date: string; plant: string; box_no_from: string;
  box_no_to: string; part_code: string; part_name: string;
  qty: string; unit_weight: string; box_number: string;
}[]>([
  { dealer_code: "", dealer_name: "", branch: "", invoice_no: "", invoice_date: "", delivery_no: "", delivery_date: "", plant: "", box_no_from: "", box_no_to: "", part_code: "", part_name: "", qty: "", unit_weight: "", box_number: "" },
]);
```

- [ ] **Step 5: Update manual entry table to show all 15 columns**

Replace the current 4-column table with a 15-column scrollable table. Use a horizontal scroll container. Each column gets an input field.

- [ ] **Step 6: Update handleManualImport to include all fields in export**

```tsx
const data = valid.map((r) => ({
  "Dealer Code": r.dealer_code.trim(),
  "Dealer": r.dealer_name.trim(),
  "Branch": r.branch.trim(),
  "InvoiceNo": r.invoice_no.trim(),
  "InvoiceDate": r.invoice_date.trim(),
  "Delivery No": r.delivery_no.trim(),
  "Delivery date": r.delivery_date.trim(),
  "Plant": r.plant.trim(),
  "Box No.From": r.box_no_from.trim(),
  "Box No.To": r.box_no_to.trim(),
  "Part Code": r.part_code.trim(),
  "Part Name": r.part_name.trim(),
  "Qty": parseFloat(r.qty) || 0,
  "Calculated Part Weight(in KG)": parseFloat(r.unit_weight) || 0,
  "Box Number": r.box_number.trim(),
}));
```

- [ ] **Step 7: Update sample template download to include all 15 columns**

```tsx
const sampleRows = [
  { "Dealer Code": "D001", "Dealer": "Rigan Enterprises", "Branch": "Main", "InvoiceNo": "INV-0001", "InvoiceDate": "2026-08-18", "Delivery No": "DEL-001", "Delivery date": "2026-08-18", "Plant": "P01", "Box No.From": "1", "Box No.To": "5", "Part Code": "SP-0001", "Part Name": "Sample Spare Part", "Qty": 10, "Calculated Part Weight(in KG)": 2.5, "Box Number": "C0001" },
];
```

- [ ] **Step 8: Update the preview table to show all 15 columns**

In the preview modal, update the table headers and row rendering to show all columns.

- [ ] **Step 9: Rewrite the detail modal with status + locations + per-field search**

The detail modal should show:
- Summary stats: Total Boxes, Received, Pending, Locations Used
- Items table with columns: Box Number, Part Code, Part Name, Qty (expected/scanned), Status, Current Location, Location 1–5
- Per-column search/filter inputs above the table

Add state for column filters:
```tsx
const [colFilters, setColFilters] = useState<Record<string, string>>({});
const [statusFilterDetail, setStatusFilterDetail] = useState("all");
```

Add filtered items computation:
```tsx
const filteredDetailItems = useMemo(() => {
  let items = selectedList?.items || [];
  // Apply text filters
  for (const [key, val] of Object.entries(colFilters)) {
    if (!val) continue;
    items = items.filter((it: any) =>
      String(it[key] || "").toLowerCase().includes(val.toLowerCase())
    );
  }
  // Apply status filter
  if (statusFilterDetail !== "all") {
    items = items.filter((it: any) => it.status === statusFilterDetail);
  }
  return items;
}, [selectedList, colFilters, statusFilterDetail]);
```

- [ ] **Step 10: Update page title from "📦 Packing List Management" to "📋 Receiving"**

Find line 434:
```tsx
<div className="rw-page-title">📦 Packing List Management</div>
```

Change to:
```tsx
<div className="rw-page-title">📋 Receiving</div>
```

- [ ] **Step 11: Build to verify**

```bash
cd web && npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 12: Commit**

```bash
git add web/src/pages/ReceivingManagement.tsx
git commit -m "feat: rewrite ReceivingManagement with 15-col form, full detail modal, per-field search"
```

---

### Task 7: Frontend — Rewrite ReceivingWizard.tsx

**Files:**
- Modify: `web/src/pages/ReceivingWizard.tsx`

**Interfaces:**
- Consumes: PO list from API (limited to 5)
- Produces: Simplified wizard without Driver/Transport, toast flashes

- [ ] **Step 1: Remove Driver/Transport state and UI**

Remove these state variables:
```tsx
const [driverName, setDriverName] = useState("");
const [driverPhone, setDriverPhone] = useState("");
const [transporter, setTransporter] = useState("");
const [defaultRoute, setDefaultRoute] = useState("INCOMING-01");
```

Remove the truckSuggestions, showTruckDropdown, showDriverDropdown, truckDropdownRef, driverDropdownRef state and refs.

Remove the entire "Driver & Transport" section (lines 534-613).

- [ ] **Step 2: Limit PO list to top 5 in FIFO order**

Update the `pendingPOs` state to only show 5 items:

In the `useEffect` that loads POs:
```tsx
api.receivingPendingPOs().then((r) => {
  if (r.ok) setPendingPOs((r.data || []).slice(0, 5));
});
```

- [ ] **Step 3: Convert flash messages to toast-style**

Replace the current flash banner with a toast notification. Add a toast container at the top of the component:

```tsx
const [toasts, setToasts] = useState<{ id: number; text: string; type: string }[]>([]);

const showFlash = (text: string, type: "success" | "warning" | "error" = "success") => {
  const id = Date.now();
  setToasts((prev) => [...prev, { id, text, type }]);
  if (type === "success") playBeep(800, 0.15);
  else if (type === "error") { playBeep(250, 0.4); triggerVibrate([100, 50, 100]); }
  else { playBeep(400, 0.25); triggerVibrate(150); }
  setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
};
```

Add toast rendering:
```tsx
{/* Toast notifications */}
<div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8 }}>
  {toasts.map((t) => (
    <div key={t.id} className={`rw-toast rw-toast-${t.type}`}>
      {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "⚠"} {t.text}
    </div>
  ))}
</div>
```

Remove the old flash banner rendering.

- [ ] **Step 4: Update handleSelectPO to remove Driver/Transport params**

```tsx
const res = await api.receivingImport(
  new File([""], "placeholder.xlsx", { type: "application/octet-stream" }),
  "", "", "", defaultRoute, existingSessionId, po.name, po.supplier_name
);
```

Since we removed the Driver/Transport state, pass empty strings.

- [ ] **Step 5: Use professional symbols instead of emojis**

Replace emoji usage in functional areas:
- `📦` → keep (it's appropriate for boxes)
- `🎯` → keep (suggested boxes)
- `📷` → keep (camera)
- `📍` → keep (route)
- Remove or replace any raw emojis in buttons/labels with clean Unicode

- [ ] **Step 6: Build to verify**

```bash
cd web && npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/ReceivingWizard.tsx
git commit -m "feat: simplify RF Scanner — remove Driver/Transport, limit 5 POs, toast flashes"
```

---

### Task 8: Frontend — CSS Aesthetic Overhaul

**Files:**
- Modify: `web/src/styles/receiving-wizard.css`

**Interfaces:**
- Produces: Professional WMS-quality styles

- [ ] **Step 1: Add toast notification styles**

```css
/* ─── Toast Notifications ─── */
.rw-toast {
  padding: 12px 20px;
  border-radius: var(--rw-radius-sm);
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: var(--rw-shadow-md);
  animation: rw-toast-in 200ms ease-out;
  min-width: 280px;
  max-width: 400px;
}
.rw-toast-success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}
.rw-toast-warning {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}
.rw-toast-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}
@keyframes rw-toast-in {
  from { opacity: 0; transform: translateX(24px); }
  to { opacity: 1; transform: translateX(0); }
}
```

- [ ] **Step 2: Add table styles for the detail modal**

```css
/* ─── Detail Modal Table ─── */
.rw-detail-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}
.rw-detail-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--rw-bg-2);
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--rw-text-dim);
  border-bottom: 2px solid var(--rw-border);
  text-align: left;
  white-space: nowrap;
}
.rw-detail-table tbody tr {
  transition: background 100ms ease;
}
.rw-detail-table tbody tr:nth-child(even) {
  background: var(--rw-bg-2);
}
.rw-detail-table tbody tr:hover {
  background: var(--rw-accent-light);
}
.rw-detail-table td {
  padding: 10px 12px;
  font-size: 13px;
  border-bottom: 1px solid var(--rw-bg-3);
  vertical-align: middle;
}
```

- [ ] **Step 3: Add column filter styles**

```css
/* ─── Column Filters ─── */
.rw-col-filter {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--rw-border);
  border-radius: var(--rw-radius-xs);
  font-size: 12px;
  background: var(--rw-bg);
  min-height: 32px;
  box-sizing: border-box;
}
.rw-col-filter:focus {
  outline: none;
  border-color: var(--rw-accent);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}
.rw-col-filter-select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--rw-border);
  border-radius: var(--rw-radius-xs);
  font-size: 12px;
  background: var(--rw-bg);
  min-height: 32px;
  box-sizing: border-box;
}
```

- [ ] **Step 4: Improve card and section styles for consistency**

Ensure all cards use consistent padding, borders, and shadows. Add subtle hover effects on interactive elements.

- [ ] **Step 5: Add alternating row colors and status badge colors**

```css
/* ─── Status Badge Colors ─── */
.rw-status-pending { background: #fef3c7; color: #92400e; }
.rw-status-in-progress { background: #dbeafe; color: #1e40af; }
.rw-status-completed { background: #dcfce7; color: #166534; }
.rw-status-exception { background: #fef2f2; color: #991b1b; }
```

- [ ] **Step 6: Build to verify**

```bash
cd web && npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add web/src/styles/receiving-wizard.css
git commit -m "feat: CSS overhaul — toast notifications, detail table, column filters, status badges"
```

---

### Task 9: Full Build Verification

**Files:**
- All modified files

**Interfaces:**
- Consumes: All previous tasks
- Produces: Verified working build

- [ ] **Step 1: Run Go build**

```bash
go build ./cmd/server
```

Expected: Clean build

- [ ] **Step 2: Run TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Run Go tests**

```bash
go test ./...
```

Expected: Tests pass (or only pre-existing failures)

- [ ] **Step 4: Run frontend tests**

```bash
cd web && npm test
```

Expected: Tests pass (or only pre-existing failures)

- [ ] **Step 5: Manual smoke test**

Start the dev server and verify:
1. Sidebar shows "Receiving" with 📋
2. Page title shows "📋 Receiving"
3. Upload modal opens with all fields
4. Manual entry has 15 columns
5. Detail modal shows all columns with status and locations
6. RF Scanner shows top 5 POs only
7. RF Scanner has no Driver/Transport fields
8. Toast notifications appear on actions

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address build/test issues from receiving overhaul"
```
