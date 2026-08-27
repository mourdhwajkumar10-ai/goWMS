# S-041 to S-050: Codebase Implementation Verification + Suggestions

## Summary

| Scenario | Category | Expected Feature | Implemented? | Suggestion |
|----------|----------|-----------------|-------------|------------|
| S-041 | Documentation | Packing list ≠ PO | ✅ IMPLEMENTED | Add auto-validation on PL upload |
| S-042 | Documentation | Packing list ≠ physical count | ✅ IMPLEMENTED | Add physical count input during box receiving |
| S-043 | Documentation | Invoice ≠ PO | ✅ IMPLEMENTED | Add PO line item comparison UI |
| S-044 | Documentation | Invoice ≠ packing list | ✅ IMPLEMENTED | Add side-by-side comparison |
| S-045 | Documentation | Multiple invoices | ✅ IMPLEMENTED | Allow multiple invoice number entry |
| S-046 | Documentation | Driver has no documents | ✅ IMPLEMENTED | Add "documents to follow" workflow |
| S-047 | Quality | Quality inspection required | ✅ IMPLEMENTED | Auto-trigger QI from GRN finalize |
| S-048 | Quality | Items fail quality check | ✅ IMPLEMENTED | Add QI checklist during receiving |
| S-049 | Quality | Expired items | ✅ IMPLEMENTED | Add expiry date validation on scan |
| S-050 | Quality | Wrong batch/lot number | ✅ IMPLEMENTED | Add batch validation against PO |

---

## Detailed Analysis

### S-041: Packing List ≠ PO

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `discrepancy.go`: `case "packing_list_po_mismatch"` — `PACKING_LIST_PO_MISMATCH` |
| UI alert | `GRN.tsx` line 711: `packing_list_po_mismatch: '⚠ PACKING LIST ≠ PO'` |
| Report button | `GRN.tsx` line 2616: "Validate packing list vs PO" button |
| Backend event | `writeEvent(db, c, sessionID, "PACKING_LIST_PO_MISMATCH", ...)` |

**💡 Suggestion:** Add **automatic validation** when a packing list is uploaded/imported. Currently the operator must manually click "Validate packing list vs PO". The system could auto-compare PL items/qty against PO lines on import and flag mismatches immediately.

---

### S-042: Packing List ≠ Physical Count

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Label mismatch handling | `discrepancy.go`: `case "label_mismatch"` — compares label qty vs physical qty |
| Shortage/excess recording | Auto-creates shortage or excess exception based on direction |
| UI inputs | `GRN.tsx`: `discLabelQty` and `discPhysicalQty` fields |
| Report button | `GRN.tsx` line 2926: "Report label mismatch" button |

**💡 Suggestion:** Add a **"Physical count" input directly on the box scan confirm modal**. Currently the operator has to go to the discrepancy section to report a label mismatch. During box receiving, if the operator counts fewer/more items than the label says, they should be able to enter the physical count right there.

---

### S-043: Invoice ≠ PO

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go`: `invoice_po_mismatch` — `INVOICE_PO_MISMATCH` |
| UI alert | `GRN.tsx` line 713: `invoice_po_mismatch: '⚠ INVOICE ≠ PO'` |
| Report button | `GRN.tsx` lines 2215, 2618: "Invoice does not match PO" button |

**💡 Suggestion:** Add a **side-by-side comparison view** when this exception is reported — show PO invoice amounts vs received invoice amounts in a table so the supervisor can see exactly what differs (quantities, prices, items).

---

### S-044: Invoice ≠ Packing List

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go`: `invoice_packing_list_mismatch` — `INVOICE_PACKING_LIST_MISMATCH` |
| UI alert | `GRN.tsx` line 714: `invoice_packing_list_mismatch: '⚠ INVOICE ≠ PACKING LIST'` |

**💡 Suggestion:** Similar to S-043 — add a **comparison UI** showing invoice line items vs packing list line items side-by-side.

---

### S-045: Multiple Invoices

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go`: `multiple_invoices` — `MULTIPLE_INVOICES` |
| UI alert | `GRN.tsx` line 718: `multiple_invoices: '⚠ MULTIPLE INVOICES'` |
| Report button | `GRN.tsx` lines 2220, 2623: "Multiple invoices for one shipment" button |
| Invoice field | `GRN.tsx`: `invoiceNos` state accepts comma-separated invoice numbers |

**💡 Suggestion:** The invoice field already supports comma-separated numbers (`INV-001, INV-002`). Add a **"Add another invoice" button** that dynamically adds a new input row, making it more intuitive than requiring comma-separated entry.

---

### S-046: Driver Has No Documents

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go`: `driver_no_docs` — `DRIVER_NO_DOCS` |
| UI alert | `GRN.tsx` line 732: `driver_no_docs: '⚠ DRIVER HAS NO DOCUMENTS'` |
| Context | "papers said to follow by email. Cannot fully verify the truck." |

**💡 Suggestion:** Add a **"Documents to follow" checkbox** in the truck arrival form (similar to "Invoice to follow"). This would auto-set the exception and add a note to the GRN session.

---

### S-047: Quality Inspection Required

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| QI page | `Qi.tsx`: Full quality inspection page with create, template, accept/reject |
| QI templates | `qi/templates.go`: Template-based inspections with checklist specs |
| QI from GRN | `GRN.tsx` line 2986: "Requires QI" checkbox on item scan |
| Auto QI on finalize | `GRN.tsx` line 844: `qiCreated: r.data.posted?.qi_created` — QI tickets auto-created |
| GRN lines flag | `handler.go`: `requires_qi` field on GRN lines |
| Side effects | `remaining.go` line 85-91: Quality-related exceptions auto-set `requires_qi=true` |
| QI link in GRN | `GRN.tsx` line 2256: "Open Quality Inspection" link |

**💡 Suggestion:** Add **auto-triggering of QI based on item master settings**. Currently the operator must manually check "Requires QI" during scanning. If an item has `requires_qi=true` in its master data, the system should auto-flag it during receiving without operator intervention.

---

### S-048: Items Fail Quality Check

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Quality fail exception | `remaining.go`: `quality_fail` — `QUALITY_FAIL` |
| QI accept/reject | `Qi.tsx`: Accept button (→ putaway) / Reject button (→ damaged location) |
| Auto-hold | `remaining.go` line 85-91: Sets `requires_qi=true` on GRN lines |
| Rejection moves stock | `Qi.tsx`: Reject moves to damaged location |

**💡 Suggestion:** Add **QI checklist readings during the inspection**. Currently the Qi.tsx page only has Accept/Reject buttons. Add input fields for each checklist specification (dimensions, weight, visual check, etc.) so inspectors can record actual values vs expected values.

---

### S-049: Expired Items

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Expired exception | `remaining.go`: `expired` — `EXPIRED_ITEM` |
| UI alert | `GRN.tsx` line 720: `expired: '⚠ EXPIRED'` |
| Report button | `GRN.tsx` line 2250: "Expired items" button |
| Auto-hold | `remaining.go` line 85-91: Sets `requires_qi=true` |
| Batch expiry tracking | `Batches.tsx`: Expiry date display with red badge |
| Inventory health | `InventoryHealth.tsx`: Expired items flagged as critical |

**💡 Suggestion:** Add **expiry date validation during item scan**. When an item with an expiry date is scanned, the system should compare against a configurable shelf-life threshold (e.g., items expiring within 30 days). If below threshold, auto-show a warning. Currently the operator must manually report "Expired items".

---

### S-050: Wrong Batch/Lot Number

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Wrong batch exception | `remaining.go`: `wrong_batch` — `WRONG_BATCH` |
| UI alert | `GRN.tsx` line 721: `wrong_batch: '⚠ WRONG BATCH'` |
| Report button | `GRN.tsx` line 2251: "Wrong batch / lot number" button |
| Batch input | `GRN.tsx`: `expectedBatch` state for expected batch comparison |

**💡 Suggestion:** Add **batch validation against PO**. If a PO specifies expected batch numbers, the system should compare the scanned batch against the PO batch and auto-flag mismatches.

---

## Top 10 Improvement Suggestions (All Scenarios)

### 1. Auto-validation on Packing List Import
**Impact:** HIGH — Catches PL ≠ PO mismatches immediately
**Effort:** MEDIUM
**Details:** When a packing list XLSX is imported, auto-compare each line against PO items/qty. Flag mismatches as warnings before the operator starts receiving.

### 2. Physical Count Input on Box Scan Confirm
**Impact:** HIGH — Catches label mismatches during receiving
**Effort:** LOW
**Details:** Add a "Physical count" field in the box scan confirm modal. If it differs from the label/expected count, auto-create a label_mismatch exception.

### 3. Auto-trigger QI from Item Master
**Impact:** MEDIUM — Reduces operator steps
**Effort:** LOW
**Details:** If `item.requires_qi = true` in item master, auto-check the "Requires QI" checkbox during item scanning. No operator action needed.

### 4. Expiry Date Validation on Scan
**Impact:** MEDIUM — Prevents expired stock from being received
**Effort:** LOW
**Details:** When scanning an item with expiry_date, compare against configurable shelf-life threshold. Auto-warn if below threshold.

### 5. Batch Validation Against PO
**Impact:** MEDIUM — Catches wrong batches early
**Effort:** MEDIUM
**Details:** If PO specifies expected batch numbers, validate scanned batch against PO batch. Auto-flag mismatches.

### 6. Side-by-Side Comparison for Document Mismatches
**Impact:** MEDIUM — Helps supervisors resolve faster
**Effort:** MEDIUM
**Details:** When reporting invoice ≠ PO or PL ≠ PO, show a comparison table with both sides.

### 7. "Documents to Follow" Checkbox
**Impact:** LOW — Cleaner UX for missing documents
**Effort:** LOW
**Details:** Add a checkbox in truck arrival form for "Driver has no documents — papers to follow". Auto-sets exception.

### 8. QI Checklist Readings
**Impact:** HIGH — Better quality data
**Effort:** HIGH
**Details:** Add input fields for each QI specification (dimensions, weight, visual check) so inspectors record actual values vs expected.

### 9. Dynamic Invoice Input Rows
**Impact:** LOW — Better UX for multiple invoices
**Effort:** LOW
**Details:** Instead of comma-separated input, add "Add invoice" button for dynamic rows.

### 10. Auto-detect Delivery Timing Issues
**Impact:** LOW — Proactive alerts
**Effort:** MEDIUM
**Details:** Compare arrival_at against PO scheduled delivery date. Auto-report early/late delivery exceptions.
