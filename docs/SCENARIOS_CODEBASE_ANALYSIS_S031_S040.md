# S-031 to S-040: Codebase Implementation Verification Report

## Summary

| Scenario | Expected Feature | Implemented? | Evidence |
|----------|-----------------|-------------|----------|
| S-031 | Internal damage (outer OK, contents broken) | ✅ **IMPLEMENTED** | `INTERNAL_DAMAGE` event + report button |
| S-032 | Unknown box (not in system) | ✅ **IMPLEMENTED** | `UNKNOWN_BOX` event + auto-detect on scan |
| S-033 | Relabeled box | ✅ **IMPLEMENTED** | `BOX_RELABELED` event + report button |
| S-034 | No box identification | ✅ **IMPLEMENTED** | `NO_BOX_ID` event + temp ID auto-generated |
| S-035 | Damaged barcode (unreadable) | ✅ **IMPLEMENTED** | `DAMAGED_BARCODE` event + report button |
| S-036 | Nested boxes | ✅ **IMPLEMENTED** | `NESTED_BOX` event + parent_carton_no field |
| S-037 | Documentation: No packing list | ✅ **IMPLEMENTED** | `NO_PACKING_LIST` event + mode switch |
| S-038 | Documentation: Invoice to follow | ✅ **IMPLEMENTED** | `INVOICE_TO_FOLLOW` event + checkbox |
| S-039 | Documentation: Missing delivery note | ✅ **IMPLEMENTED** | `MISSING_DELIVERY_NOTE` event + report button |
| S-040 | Documentation: Unclear/handwritten docs | ✅ **IMPLEMENTED** | `HANDWRITTEN_DOCS` event + report button |

---

## Detailed Analysis by Scenario

### S-031: Damaged Box — Internal

**Expected Behavior:**
1. Box looks fine outside but items inside are broken/damaged
2. Internal damage exception created

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Internal damage detection | ✅ IMPLEMENTED | `discrepancy.go` lines 127-131: `case "internal_damage":` — "INTERNAL DAMAGE — outer carton looked OK, contents are broken/damaged." |
| Exception created | ✅ IMPLEMENTED | `discrepancy.go` line 130: `writeException(db, c, sessionID, "internal_damage", ...)` |
| Also creates damage exception | ✅ IMPLEMENTED | `discrepancy.go` line 131: Also writes `writeException(db, c, sessionID, "damage", ...)` — dual exception |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` line 703: `internal_damage: '⚠ INTERNAL DAMAGE'` in exception type map |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` line 2593: "Report internal damage" button in discrepancy section |
| Context note | ✅ IMPLEMENTED | `GRN.tsx` line 2568: "Outer damage is reported at scan. Use these when the carton looks fine but contents are broken..." |

---

### S-032: Box ID Not in System

**Expected Behavior:**
1. Box has barcode but not on packing list or any PO
2. Unknown box exception created

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Unknown box auto-detection | ✅ IMPLEMENTED | `handler.go` lines 539-542: Auto-detects unknown box on scan — `writeException("unknown_box")` + `writeEvent("UNKNOWN_BOX")` |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` lines 914-920: Shows "⚠ UNKNOWN BOX — barcode is not on the packing list or any PO. Recorded as an unknown/excess box exception." |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` line 2594: "Unknown box not in system" button |
| Backend classify | ✅ IMPLEMENTED | `box_classify.go` line 27: Unknown boxes are excess only when a packing list exists |
| Scan confirm warning | ✅ IMPLEMENTED | `GRN.tsx`: Scan confirm shows "On packing list: No — excess" for unknown boxes |

---

### S-033: Box Relabeled

**Expected Behavior:**
1. Original label removed/covered with new label
2. Suspicious — hold for supervisor

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Relabeled detection | ✅ IMPLEMENTED | `discrepancy.go` lines 137-140: `case "relabeled":` — "RELABELED BOX — original label removed/covered. Suspicious; hold for supervisor." |
| Exception created | ✅ IMPLEMENTED | `discrepancy.go` line 140: `writeException(db, c, sessionID, "relabeled", ...)` |
| Event logged | ✅ IMPLEMENTED | `discrepancy.go` line 138: `writeEvent(db, c, sessionID, "BOX_RELABELED", ...)` |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` line 705: `relabeled: '⚠ RELABELED BOX'` in exception type map |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` line 2595: "Report relabeled box" button |

---

### S-034: No Box Identification

**Expected Behavior:**
1. Box has no barcode, QR, or any readable ID
2. Plain brown box — needs temp ID

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| No box ID handling | ✅ IMPLEMENTED | `discrepancy.go` lines 141-147: `case "no_box_id":` — assigns temp ID `TEMP-BOX-{sessionID}-{n}` |
| Temp ID auto-generated | ✅ IMPLEMENTED | `discrepancy.go` lines 143-145: `if boxNo == "" { boxNo = "TEMP-BOX-" + strconv.Itoa(sessionID) + "-" + ... }` |
| Exception created | ✅ IMPLEMENTED | `discrepancy.go` line 147: `writeException(db, c, sessionID, "no_box_id", ...)` |
| Event logged | ✅ IMPLEMENTED | `discrepancy.go` line 142: `writeEvent(db, c, sessionID, "NO_BOX_ID", ...)` |
| Message | ✅ IMPLEMENTED | `discrepancy.go` line 146: "NO BOX ID — temporary ID assigned: {id}. Receive against this ID." |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` line 706: `no_box_id: '⚠ NO BOX ID'` |
| Auto-fill carton | ✅ IMPLEMENTED | `GRN.tsx` line 759: `if (kind === 'no_box_id' && data?.box_no) setCartonNo(String(data.box_no))` — fills temp ID |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` line 2599: `reportDiscrepancy('no_box_id', { box_no: temp })` |

---

### S-035: Damaged Barcode

**Expected Behavior:**
1. Box barcode is smudged, torn, or unreadable
2. Need to enter ID manually

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Damaged barcode handling | ✅ IMPLEMENTED | `discrepancy.go` lines 148-151: `case "damaged_barcode":` — "DAMAGED BARCODE — scanner cannot read it. Enter the box ID manually." |
| Exception created | ✅ IMPLEMENTED | `discrepancy.go` line 151: `writeException(db, c, sessionID, "damaged_barcode", ...)` |
| Event logged | ✅ IMPLEMENTED | `discrepancy.go` line 149: `writeEvent(db, c, sessionID, "DAMAGED_BARCODE", ...)` |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` line 707: `damaged_barcode: '⚠ DAMAGED BARCODE'` |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` line 2601: "Barcode unreadable — enter ID manually" button |

---

### S-036: Nested Boxes

**Expected Behavior:**
1. Big box contains smaller boxes, each with own ID
2. Scan each level separately

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Nested box detection | ✅ IMPLEMENTED | `discrepancy.go` lines 152-159: `case "nested_box":` — "NESTED BOXES — inner box {no} inside outer {parent}. Scan each level." |
| Exception created | ✅ IMPLEMENTED | `discrepancy.go` line 159: `writeException(db, c, sessionID, "nested_box", ...)` |
| Event logged | ✅ IMPLEMENTED | `discrepancy.go` line 153: `writeEvent(db, c, sessionID, "NESTED_BOX", ...)` |
| Parent carton field | ✅ IMPLEMENTED | `handler.go` line 394: `ParentCartonNo string` in scan request body |
| Backend handler | ✅ IMPLEMENTED | `handler.go` line 424: `doScanCarton(c, db, sessionID, cartonNo, condition, parentCartonNo)` |
| Nested box attach | ✅ IMPLEMENTED | `handler.go` line 496: `attachNestedBox(c, db, sessionID, cartonNo, parentCartonNo, out)` |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` lines 900-904: Shows "⚠ NESTED BOXES — Inner box {no} inside outer {parent}. Scan each level separately." |
| Parent carton input | ✅ IMPLEMENTED | `GRN.tsx` line 142: `const [parentCartonNo, setParentCartonNo] = useState('')` |
| Parent carton UI | ✅ IMPLEMENTED | `GRN.tsx` lines 2574-2575: Input field for parent carton number |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` line 2602: "Scan nested inner box" button |

---

### S-037: Documentation Issue — No Packing List

**Expected Behavior:**
1. Supplier didn't send a packing list
2. Switch to invoice-only mode

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| No packing list handling | ✅ IMPLEMENTED | `discrepancy.go` lines 160-166: `case "no_packing_list":` — "NO PACKING LIST — switched to invoice-only. Verify items against invoice totals." |
| Mode switch | ✅ IMPLEMENTED | `discrepancy.go` lines 164-165: `UPDATE grn_sessions SET receiving_mode='invoice_only', packing_list_available=false` |
| Exception created | ✅ IMPLEMENTED | `discrepancy.go` line 166: `writeException(db, c, sessionID, "no_packing_list", ...)` |
| Event logged | ✅ IMPLEMENTED | `discrepancy.go` line 161: `writeEvent(db, c, sessionID, "NO_PACKING_LIST", ...)` |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` line 709: `no_packing_list: '⚠ NO PACKING LIST'` |
| Auto-reload session | ✅ IMPLEMENTED | `GRN.tsx` line 760: `if (kind === 'no_packing_list') reloadSession(session?.id \|\| 0)` |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` line 2614: "No packing list provided" button |
| UI mode selector | ✅ IMPLEMENTED | `GRN.tsx` line 1463: "No packing list provided" button in truck arrival form |

---

### S-038: Documentation Issue — Invoice to Follow

**Expected Behavior:**
1. Goods arrived but invoice is missing
2. Can receive goods but don't close GRN

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Invoice to follow handling | ✅ IMPLEMENTED | `discrepancy.go` lines 167-170: `case "no_invoice":` — "INVOICE TO FOLLOW — goods may be received; invoice is missing. Do not silently close the GRN." |
| Event logged | ✅ IMPLEMENTED | `discrepancy.go` line 168: `writeEvent(db, c, sessionID, "INVOICE_TO_FOLLOW", ...)` |
| Exception created | ✅ IMPLEMENTED | `discrepancy.go` line 170: `writeException(db, c, sessionID, "no_invoice", ...)` |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` line 710: `no_invoice: '⚠ INVOICE TO FOLLOW'` |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` line 2615: "Invoice to follow" button |
| Invoice to follow checkbox | ✅ IMPLEMENTED | `GRN.tsx` lines 1456-1458: Checkbox "Invoice to follow" in truck arrival form |
| Auto-set invoice | ✅ IMPLEMENTED | `GRN.tsx`: Sets `invoiceNos` to `'INVOICE-TO-FOLLOW'` when checkbox checked |

---

### S-039: Documentation Issue — Missing Delivery Note

**Expected Behavior:**
1. No transport document / challan
2. Who shipped this?

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Missing delivery note | ✅ IMPLEMENTED | `remaining.go` line 20: `"missing_delivery_note": {"MISSING_DELIVERY_NOTE", "MISSING DELIVERY NOTE / CHALLAN — no transport document. Who shipped this?"}` |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` line 716: `missing_delivery_note: '⚠ MISSING DELIVERY NOTE'` |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` lines 2218, 2621: "Missing delivery note / challan" button |

---

### S-040: Documentation Issue — Unclear/Handwritten Docs

**Expected Behavior:**
1. Handwritten, smudged, or foreign-language paperwork
2. Hold for review

**Codebase Status:**

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Handwritten docs handling | ✅ IMPLEMENTED | `remaining.go` line 21: `"handwritten_docs": {"HANDWRITTEN_DOCS", "UNCLEAR DOCUMENTS — handwritten, smudged, or foreign-language paperwork. Hold for review."}` |
| UI alert | ✅ IMPLEMENTED | `GRN.tsx` line 717: `handwritten_docs: '⚠ UNCLEAR DOCUMENTS'` |
| Report button | ✅ IMPLEMENTED | `GRN.tsx` lines 2219, 2622: "Handwritten / unclear documents" button |

---

## Full Documentation Exception Types

The codebase supports all documentation-related exception types:

| Exception Type | Event | UI Alert | Report Button |
|---------------|-------|----------|---------------|
| No packing list | `NO_PACKING_LIST` | ⚠ NO PACKING LIST | ✅ |
| Invoice to follow | `INVOICE_TO_FOLLOW` | ⚠ INVOICE TO FOLLOW | ✅ |
| Missing delivery note | `MISSING_DELIVERY_NOTE` | ⚠ MISSING DELIVERY NOTE | ✅ |
| Handwritten docs | `HANDWRITTEN_DOCS` | ⚠ UNCLEAR DOCUMENTS | ✅ |
| Packing list ≠ PO | `PACKING_LIST_PO_MISMATCH` | ⚠ PACKING LIST ≠ PO | ✅ |
| Packing list ≠ physical | `PACKING_LIST_PHYSICAL_MISMATCH` | ⚠ PACKING LIST ≠ PHYSICAL | ✅ |
| Invoice ≠ PO | `INVOICE_PO_MISMATCH` | ⚠ INVOICE ≠ PO | ✅ |
| Invoice ≠ packing list | `INVOICE_PACKING_LIST_MISMATCH` | ⚠ INVOICE ≠ PACKING LIST | ✅ |
| Multiple invoices | `MULTIPLE_INVOICES` | ⚠ MULTIPLE INVOICES | ✅ |

---

## All Box/Packaging Exception Types

| Exception Type | Event | UI Alert | Report Button |
|---------------|-------|----------|---------------|
| Internal damage | `INTERNAL_DAMAGE` | ⚠ INTERNAL DAMAGE | ✅ |
| Unknown box | `UNKNOWN_BOX` | ⚠ UNKNOWN BOX | ✅ (auto-detect) |
| Relabeled box | `BOX_RELABELED` | ⚠ RELABELED BOX | ✅ |
| No box ID | `NO_BOX_ID` | ⚠ NO BOX ID | ✅ (temp ID) |
| Damaged barcode | `DAMAGED_BARCODE` | ⚠ DAMAGED BARCODE | ✅ |
| Nested boxes | `NESTED_BOX` | ⚠ NESTED BOXES | ✅ |

---

## Overall Verdict

**10 out of 10 scenarios are FULLY IMPLEMENTED in the codebase.**

### Key Implementation Details

| Feature | Backend | Frontend | Auto-detect |
|---------|---------|----------|-------------|
| Internal damage | `discrepancy.go` | "Report internal damage" button | No (manual) |
| Unknown box | `handler.go` | "⚠ UNKNOWN BOX" alert | **Yes** (on scan) |
| Relabeled box | `discrepancy.go` | "Report relabeled box" button | No (manual) |
| No box ID | `discrepancy.go` | Temp ID auto-generated | No (manual) |
| Damaged barcode | `discrepancy.go` | "Barcode unreadable" button | No (manual) |
| Nested boxes | `handler.go` | Parent carton input | **Yes** (on scan) |
| No packing list | `discrepancy.go` | Mode auto-switch | **Yes** (on report) |
| Invoice to follow | `discrepancy.go` | Checkbox + report | No (manual) |
| Missing delivery note | `remaining.go` | Report button | No (manual) |
| Unclear documents | `remaining.go` | Report button | No (manual) |

### ⚠️ Note

All 10 scenarios are marked "NOT TESTED" — no browser test evidence was captured. The features ARE implemented in code. Live browser testing needed to confirm end-to-end.
