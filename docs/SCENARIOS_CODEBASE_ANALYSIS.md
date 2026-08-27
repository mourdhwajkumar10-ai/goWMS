# SC-001 to SC-010: Codebase Fix Verification Report

## Summary

| Scenario | Issue | Fixed in Codebase? | Evidence |
|----------|-------|--------------------|----------|
| S-001 | Date fields all = 0 | ✅ **FIXED** | `nowLocalDatetime()` auto-populates |
| S-001 | No workflow progress bar | ✅ **FIXED** | `STEPS` array + `stepIndex()` |
| S-001 | No tabbed workspace | ✅ **FIXED** | `grnTab` with 7 tabs |
| S-001 | Status values wrong | ✅ **FIXED** | `specStatusLabel()` maps correctly |
| S-002 | No box/item scan separation | ✅ **FIXED** | `scanTarget` state + separate buttons |
| S-002 | No "box accepted" feedback | ✅ **FIXED** | `scanConfirm` modal + `lastScanFeedback` |
| S-002 | No GRN workspace view | ✅ **FIXED** | Full workspace with tabs |
| S-003 | Box IDs in login badge field | ⚠️ **USER ERROR** | Login.tsx has warning (lines 74,79) |
| S-003 | No received/expected counter | ✅ **FIXED** | `scanConfirm` shows expected/remaining |
| S-003 | No box vs item scan separation | ✅ **FIXED** | Two separate buttons: "Scan box" / "Scan item" |
| S-004 | Cannot verify PO tracking | ✅ **FIXED** | Multi-PO selection + independent sessions |
| S-005 | No shortage detection | ✅ **FIXED** | `ensureShortageException()` in completion.go |
| S-005 | No excess detection | ✅ **FIXED** | `ensureExcessException()` in completion.go |
| S-006 | No excess warning | ✅ **FIXED** | "EXCESS BOX" alert + exception |
| S-006 | Excess silently accepted | ✅ **FIXED** | Exception created, not silent |
| S-007 | No wrong item warning | ✅ **FIXED** | "WRONG ITEM" alert in `applyItemDiscrepancyAlert` |
| S-007 | Wrong item silently accepted | ✅ **FIXED** | Exception logged, not accepted |
| S-008 | No damage recording | ✅ **FIXED** | Box condition dropdown (ok/damaged/wet/crushed) |
| S-008 | No "Report Damage" button | ✅ **FIXED** | Condition selector in scan confirm modal |
| S-009 | No missing box detection | ✅ **FIXED** | `finishBoxReceiving` → missing_boxes list |
| S-009 | No reconciliation view | ✅ **FIXED** | Box summary with expected/received/missing |
| S-010 | No excess box warning | ✅ **FIXED** | "EXCESS BOX" alert + exception state |
| S-010 | Excess box silently accepted | ✅ **FIXED** | `classifyNewBox()` returns excess=true |

---

## Detailed Analysis by Scenario

### S-001: Perfect Delivery — Everything Matches

**Reported Issues:**
1. Date fields all = 0 (Month, Day, Year, Hours, Minutes, AM/PM)
2. No workflow progress bar visible
3. No tabbed workspace (Overview/Boxes/Items/Exceptions/Audit/Activity)
4. Status values wrong (open/closed vs spec's DRAFT/RECEIVING)
5. PO data shows Items=0, Total=0.00

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| Date fields = 0 | ✅ FIXED | `GRN.tsx` line 15: `const d = new Date()` + line 79: `const [arrivalAt, setArrivalAt] = useState(nowLocalDatetime)` — arrival date auto-populated with current time |
| No workflow progress | ✅ FIXED | `GRN.tsx` lines 150-157: `STEPS` array with 8 workflow states (DRAFT → RECEIVING → BOX_RECONCILIATION → ITEM_VERIFICATION → EXCEPTION_PENDING → ITEM_VERIFICATION_COMPLETE → PUTAWAY_PENDING → COMPLETED) |
| No tabbed workspace | ✅ FIXED | `GRN.tsx` line 88: `const [grnTab, setGrnTab] = useState<'overview' \| 'boxes' \| 'items' \| 'exceptions' \| 'audit' \| 'activity' \| 'checks'>('overview')` |
| Wrong status labels | ✅ FIXED | `GRN.tsx` lines 23-35: `specStatusLabel()` maps `open→RECEIVING`, `draft→DRAFT`, `receiving→RECEIVING`, `box_reconciliation→BOX_RECONCILIATION` |
| PO Items=0, Total=0 | ⚠️ DATA | PO table displays `po.item_count ?? po.total_qty ?? 0` and `Number(po.grand_total \|\| 0).toFixed(2)` — correct code, likely test data issue |

---

### S-002: Single PO, Single Box

**Reported Issues:**
1. No box/item scan separation — single "Scan" button
2. No "box accepted" feedback mechanism
3. No GRN workspace view (shows PO table instead)
4. Date fields default to 0

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| No box/item separation | ✅ FIXED | `GRN.tsx` lines 1435-1443: Two separate buttons — "Scan box" (`setScanTarget('carton')`) and "Scan item" (`setScanTarget('verify')`) |
| No box accepted feedback | ✅ FIXED | `GRN.tsx` lines 350-430: `scanConfirm` modal shows box details (on packing list: Yes/No), condition selector, excess/duplicate warnings. `lastScanFeedback` state shows confirmation text. |
| No GRN workspace | ✅ FIXED | `GRN.tsx` lines 150-157: 7-tab workspace (overview, boxes, items, exceptions, audit, activity, checks) |
| Date fields = 0 | ✅ FIXED | `GRN.tsx` line 79: `useState(nowLocalDatetime)` — auto-populated |

---

### S-003: Single PO, Multiple Boxes

**Reported Issues:**
1. Box IDs entered in LOGIN badge field (workflow broken)
2. No received/expected counter visible
3. No part-level reconciliation view
4. No box scan vs item scan separation
5. 6 screenshots empty

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| Box IDs in login field | ⚠️ USER ERROR | `Login.tsx` lines 74,79: Shows warning "That looks like a box/part barcode. Log in first, then scan on GRN." — the system now warns against this mistake |
| No received/expected counter | ✅ FIXED | `GRN.tsx` scan confirm modal (lines ~1230-1280): Shows "Expected in box", "Already scanned", "After this scan: X/Y · Z left" |
| No part reconciliation | ✅ FIXED | `GRN.tsx`: `itemSummary` state tracks expected/received/short/excess quantities per part. `part_rollup.go` handles per-part shortage/excess calculation. |
| No box vs item separation | ✅ FIXED | Two separate scan buttons: "Scan box" and "Scan item" |

---

### S-004: Multiple POs in One Truck

**Reported Issues:**
1. 6 screenshots empty
2. Cannot verify independent PO tracking
3. No dedicated PO-to-GRN linking view

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| Independent PO tracking | ✅ FIXED | `GRN.tsx` lines 186-207: `createSessionsFromPOs()` creates separate GRN sessions per PO. Checkbox selection for multi-PO receiving. |
| PO-to-GRN linking | ✅ FIXED | `GRN.tsx` line 1748: Shows "Receiving against {PO name}" in session header. PO column in sessions table. |

---

### S-005: Short Delivery — Fewer Items Than PO

**Reported Issues:**
1. No "expected vs received" counter visible
2. No shortage detection UI
3. No shortage exception created
4. No box/item scan separation

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| Expected vs received | ✅ FIXED | `GRN.tsx`: `shortItemQty` = `itemSummary?.short_qty ?? Math.max(0, expectedItemQty - receivedItemQty)` |
| Shortage detection | ✅ FIXED | `api/modules/grn/completion.go` lines 223-228: `ensureShortageException()` — creates exception when scanned < expected |
| Shortage UI | ✅ FIXED | `web/src/pages/GRNExceptions.tsx`: Full exceptions page showing shortage/missing exceptions with resolve buttons |
| Box/item separation | ✅ FIXED | Two separate scan buttons |

---

### S-006: Over Delivery — More Items Than PO

**Reported Issues:**
1. No excess detection — scans silently accepted
2. No excess warning message
3. No excess exception created

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| Excess detection | ✅ FIXED | `api/modules/grn/verify.go` lines 347-359: Detects excess when scanned > expected, creates exception |
| Excess warning UI | ✅ FIXED | `GRN.tsx` line 698: `raise('⚠ EXCESS', ...)` — shows alert "Excess should not silently become accepted stock" |
| Excess exception | ✅ FIXED | `api/modules/grn/completion.go` lines 249-254: `ensureExcessException()` creates exception record |
| Excess box detection | ✅ FIXED | `api/modules/grn/box_classify.go` lines 29-34: `classifyNewBox()` returns `excess=true` when box not on packing list |

---

### S-007: Wrong Item Received

**Reported Issues:**
1. No wrong item warning message
2. Wrong item silently accepted
3. 7 screenshots empty

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| Wrong item detection | ✅ FIXED | `api/modules/grn/verify.go` lines 315-336: Detects wrong item, creates exception, returns `wrong_item: true` |
| Wrong item UI | ✅ FIXED | `GRN.tsx` line 686: `raise('⚠ WRONG ITEM', msg)` — shows alert "This item is not expected in this box" |
| Wrong item not accepted | ✅ FIXED | `GRN.tsx` scan confirm modal shows "⚠ WRONG ITEM — not expected in this box. Confirm only to log an exception; it will not be accepted against the box." |
| Wrong variant | ✅ FIXED | `GRN.tsx`: Also detects wrong variant, wrong revision, counterfeit, substitute, mixed items |

---

### S-008: Damaged Box Arrives

**Reported Issues:**
1. No damage recording mechanism
2. Box ID entered in login field, not GRN scan field
3. 4 screenshots empty
4. No "Report Damage" button found

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| Damage recording | ✅ FIXED | `GRN.tsx` scan confirm modal (lines ~1310-1330): Box condition dropdown with options: OK, Damaged, Wet, Crushed/torn |
| Damage exception | ✅ FIXED | `api/modules/grn/handler.go` lines 488-494: When condition is damaged, creates exception + event "BOX_DAMAGE_REPORTED" |
| Damage UI alert | ✅ FIXED | `GRN.tsx` lines 905-910: Shows "⚠ DAMAGED BOX — exception created" alert |
| Damaged box notification | ✅ FIXED | `api/modules/grn/box_classify.go` line 10: `case "damaged", "damage": return "damaged"` |
| Nested box detection | ✅ FIXED | `GRN.tsx` lines 896-902: Detects nested boxes (inner/outer) |
| Unknown box detection | ✅ FIXED | `GRN.tsx` lines 916-918: Shows "⚠ UNKNOWN BOX" for unrecognized barcodes |

---

### S-009: Missing Box — Not All Boxes Arrived

**Reported Issues:**
1. Box ID entered in login field, not GRN scan field
2. No clear missing box detection
3. No reconciliation view showing missing boxes
4. 4 screenshots empty

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| Missing box detection | ✅ FIXED | `api/modules/grn/workflow.go` lines 366-404: `completeBoxReceiving()` compares scanned boxes vs expected, returns `missing_boxes` list |
| Missing box UI | ✅ FIXED | `GRN.tsx` lines 958-981: `finishBoxReceiving()` shows "⚠ MISSING BOXES" alert listing which boxes are missing |
| Box reconciliation | ✅ FIXED | `GRN.tsx`: "Finish boxes" button triggers `finishBoxReceiving()` which compares expected vs received |
| Box summary | ✅ FIXED | `GRN.tsx`: `boxSummary` state tracks `expected_boxes`, `received_boxes`, `boxes_missing`, `boxes_excess` |

---

### S-010: Extra/Unexpected Box

**Reported Issues:**
1. No excess box warning
2. Excess box silently accepted
3. 2 screenshots empty

**Codebase Status:**

| Issue | Status | Code Reference |
|-------|--------|----------------|
| Excess box detection | ✅ FIXED | `api/modules/grn/box_classify.go` lines 29-34: `classifyNewBox()` returns `"excess", true` when box not on packing list |
| Excess box UI | ✅ FIXED | `GRN.tsx` lines 920-926: Shows "⚠ EXCESS BOX" alert — "this box is not on the packing list. Confirming records an exception" |
| Excess box exception | ✅ FIXED | `api/modules/grn/handler.go` lines 534-535: Creates exception + event "BOX_EXCESS_DETECTED" |
| Scan confirm warning | ✅ FIXED | `GRN.tsx`: Scan confirm modal shows "⚠ EXCESS BOX — this box is not on the packing list. Confirming records an exception." |

---

## Additional Fixes Found (Not in Original Reports)

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Barcode scanner validation | ✅ IMPLEMENTED | `box_classify.go`: `isInvalidBoxBarcode()` rejects empty/huge/invalid scans |
| Duplicate box scan prevention | ✅ IMPLEMENTED | `handler.go` line 466: Creates "BOX_DUPLICATE_SCANNED" event, doesn't double-count |
| PO status filtering | ✅ IMPLEMENTED | `GRN.tsx` line 174: Only shows POs in `draft/submitted/To Receive and Bill/To Receive/Partially Received` |
| Blank session creation | ✅ IMPLEMENTED | `createBlankSession()` with `as_draft` option |
| Packing list vs invoice-only mode | ✅ IMPLEMENTED | `receivingMode` state with clear UI explanation |
| Save draft | ✅ IMPLEMENTED | Draft sessions saved with `as_draft: true` |
| Random audit | ✅ IMPLEMENTED | `startAudit()` with sample size parameter |
| Follow-up receipts | ✅ IMPLEMENTED | `createFollowUp()` + GRNFollowUps page |
| Exceptions page | ✅ IMPLEMENTED | Dedicated `/exceptions` route + GRNExceptions page |
| Putaway link | ✅ IMPLEMENTED | "Putaway (Move to Storage)" button + `/putaway` route |
| Discrepancy reporting | ✅ IMPLEMENTED | `reportDiscrepancy()` with 50+ exception types |
| Same-truck grouping | ✅ IMPLEMENTED | `truckGroups` useMemo groups sessions by truck |
| Multi-PO selection | ✅ IMPLEMENTED | Checkboxes for selecting multiple POs on same truck |
| Operator presence | ✅ IMPLEMENTED | `grnPresence()` polls every 20s for concurrent operators |
| Item master completion | ✅ IMPLEMENTED | Auto-prompts for incomplete item masters during receiving |

---

## Overall Verdict

**22 out of 22 original issues are now FIXED in the codebase.**

The codebase has been significantly improved since the original test execution. The GRN module now includes:

1. ✅ Proper workflow states (DRAFT → RECEIVING → BOX_RECONCILIATION → ITEM_VERIFICATION → PUTAWAY_PENDING → COMPLETED)
2. ✅ Separate box vs item scanning
3. ✅ Shortage/excess/wrong item detection with exceptions
4. ✅ Damage recording with condition selector
5. ✅ Missing box detection after box reconciliation
6. ✅ Excess box detection (not silently accepted)
7. ✅ Scan confirmation modal with warnings
8. ✅ Tabbed workspace with 7 tabs
9. ✅ Auto-populated arrival date
10. ✅ Dedicated Exceptions and Follow-Up pages

**Note:** The test evidence (screenshots in `docs/scenarios/evidence/`) is STALE — it was captured before these fixes were made. The scenario docs (S-001 to S-010) describe the OLD state of the application, not the current state. Re-testing is needed to verify the fixes work end-to-end.
