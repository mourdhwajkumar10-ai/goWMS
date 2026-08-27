# goWMS GRN Module — 35 Feature Enhancements

## Executive Summary

This document catalogs **35 enhancement suggestions** identified during the codebase analysis of 81 GRN test scenarios. All 81 scenarios are fully implemented in the codebase. These 35 enhancements would elevate the product from functional to **Tier-1 global WMS standards** (Manhattan Associates benchmark).

| Priority | Count | Description |
|----------|-------|-------------|
| **P0 — Critical** | 5 | Must-have for production use |
| **P1 — High** | 6 | Significant UX improvement |
| **P2 — Medium** | 11 | Nice-to-have, improves efficiency |
| **P3 — Low** | 13 | Polish, future roadmap |
| **TOTAL** | **35** | |

---

## P0 — Critical (5 Enhancements)

These are the highest-impact changes that directly affect operator efficiency and compliance.

---

### E-001: Auto-Validate Packing List on Import

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-041 |
| **Impact** | HIGH |
| **Effort** | MEDIUM |
| **Current State** | Operator must manually click "Validate packing list vs PO" |
| **Target State** | System auto-compares PL items/qty against PO lines on import |

**Problem:**
When a packing list XLSX is imported, the system accepts it without validation. Mismatches between the PL and PO (wrong items, wrong quantities) are only discovered during receiving — too late.

**Solution:**
Add automatic validation when a packing list is uploaded/imported:

```
┌─────────────────────────────────────────────────┐
│ PACKING LIST IMPORT                             │
├─────────────────────────────────────────────────┤
│ File: packing_list_2026.xlsx                    │
│                                                 │
│ ✅ Validating against PO-2026-0042...           │
│                                                 │
│ ┌─────────────┬──────┬──────┬──────────────┐   │
│ │ Part        │ PL Qty│ PO Qty│ Status       │   │
│ ├─────────────┼──────┼──────┼──────────────┤   │
│ │ PART-A-001  │  50  │  50  │ ✅ Match     │   │
│ │ PART-B-002  │  30  │  30  │ ✅ Match     │   │
│ │ PART-C-003  │  25  │  20  │ ⚠ EXCESS +5  │   │
│ │ PART-D-004  │  —   │  15  │ ⚠ MISSING    │   │
│ │ PART-E-005  │  10  │  —   │ ⚠ NOT ON PO  │   │
│ └─────────────┴──────┴──────┴──────────────┘   │
│                                                 │
│ 3 warnings found. Fix before starting receiving?│
│                                                 │
│ [Cancel] [Fix Manually] [Proceed Anyway]        │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Add `validatePackingList()` in `handler.go` after PL import
- Frontend: Show validation results in a table before GRN session starts
- Config: Add `auto_validate_pl: true/false` per warehouse

**Files to modify:**
- `api/modules/grn/handler.go` — Add validation after PL import
- `web/src/pages/GRN.tsx` — Add validation results UI

---

### E-002: Physical Count Input on Box Scan Confirm

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-042 |
| **Impact** | HIGH |
| **Effort** | LOW |
| **Current State** | Operator must go to discrepancy section to report label mismatch |
| **Target State** | Physical count input directly in the box scan confirm modal |

**Problem:**
When a box is scanned, the scan confirm modal shows expected qty vs label qty. But if the operator counts fewer/more items than the label says, they must navigate to the discrepancy section — disrupting the scanning flow.

**Solution:**
Add a "Physical count" field in the box scan confirm modal:

```
┌─────────────────────────────────────────────────┐
│ BOX SCANNED: BOX-001                            │
├─────────────────────────────────────────────────┤
│ On packing list: Yes                             │
│ Expected in box: 50 units                        │
│ Already scanned: 0                               │
│                                                 │
│ ┌─────────────────────────────────────────┐     │
│ │ Physical count: [____50____] units      │     │
│ │                                        │     │
│ │ Label says: 50 | You counted: 50       │     │
│ │ ✅ Match                               │     │
│ │                                        │     │
│ │ If different, a label_mismatch          │     │
│ │ exception is auto-created.              │     │
│ └─────────────────────────────────────────┘     │
│                                                 │
│ Condition: [OK ▼]                               │
│                                                 │
│ After this scan: 50/200 · 150 left              │
│                                                 │
│ [Cancel] [Confirm]                              │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Frontend: Add `physicalQty` input in scan confirm modal
- Backend: Auto-create `label_mismatch` exception when physical ≠ label
- Logic: If physical < label → shortage; if physical > label → excess

**Files to modify:**
- `web/src/pages/GRN.tsx` — Add physical count input in scan confirm modal
- `api/modules/grn/verify.go` — Handle physical count in verify request

---

### E-003: GRN Completion PDF Export

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-077 |
| **Impact** | HIGH |
| **Effort** | MEDIUM |
| **Current State** | Completion summary shown in modal only |
| **Target State** | PDF export with QR code for record-keeping |

**Problem:**
When a GRN is completed, the summary is shown in a modal but cannot be exported. Warehouse managers need printable records for compliance audits and vendor sign-offs.

**Solution:**
Generate a PDF summary of the completed GRN:

```
┌─────────────────────────────────────────────────┐
│              GO WMS — GOODS RECEIPT NOTE         │
│              GRN-2026-0042-001                   │
├─────────────────────────────────────────────────┤
│                                                  │
│ PO: PO-2026-0042    Supplier: Acme Parts Ltd    │
│ Truck: MH-12-AB-1234  Arrived: 2026-08-13 09:30 │
│ Completed: 2026-08-13 10:45                      │
│ Operator: admin                                  │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ BOXES RECEIVED                              │ │
│ │ BOX-001: 50 units  ✅ OK                    │ │
│ │ BOX-002: 30 units  ✅ OK                    │ │
│ │ BOX-003: 20 units  ⚠ DAMAGED (2 units)     │ │
│ │ BOX-004: MISSING — shortage exception       │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ EXCEPTIONS                                  │ │
│ │ 1. Shortage: BOX-004 missing (50 units)     │ │
│ │ 2. Damage: BOX-003 internal damage (2)      │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ STOCK POSTED                                │ │
│ │ Incoming: 98 units (2 bins)                 │ │
│ │ Hold (QI): 0 units                          │ │
│ │ Damaged: 2 units (quarantine)               │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ┌─────────┐                                     │
│ │ QR CODE │  Scan to view GRN online            │
│ │  ████   │                                     │
│ │  ████   │                                     │
│ └─────────┘                                     │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Add `/grn/:id/pdf` endpoint that generates PDF
- Library: Use `gofpdf` or `pdfcpu` for Go PDF generation
- Frontend: Add "Download PDF" button in completion modal
- QR code: Encode GRN URL for quick lookup

**Files to modify:**
- `api/modules/grn/handler.go` — Add PDF generation endpoint
- `web/src/pages/GRN.tsx` — Add download button in completion modal

---

### E-004: Exception Escalation Workflow

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-079 |
| **Impact** | HIGH |
| **Effort** | MEDIUM |
| **Current State** | Exceptions stay open until manually resolved |
| **Target State** | Auto-escalation after 24/48/72 hours |

**Problem:**
Open exceptions can sit unresolved for days, blocking GRN completion and PO closing. There's no mechanism to escalate stale exceptions.

**Solution:**
Auto-escalate unresolved exceptions:

```
Timeline:
  0h:  Exception created → Notify assigned operator
  24h: Unresolved → Notify supervisor
  48h: Still open → Notify warehouse manager
  72h: Still open → Notify procurement head
  7d:  Still open → Block related PO receiving
```

**Implementation:**
- Backend: Add `exception_escalation` table tracking escalation level
- Cron job: Run every hour, check exceptions > 24h old
- Notifications: Email/Slack/in-app alerts at each escalation level
- Config: Configurable thresholds per exception type

**Files to modify:**
- `api/modules/grn/` — Add `escalation.go` with cron logic
- `web/src/pages/GRNExceptions.tsx` — Show escalation level badge
- `migrations/` — Add `exception_escalation` table

---

### E-005: Hazmat Safety Checklist

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-068 |
| **Impact** | HIGH |
| **Effort** | LOW |
| **Current State** | Hazmat flagged but no safety verification |
| **Target State** | Mandatory PPE checklist before receiving |

**Problem:**
When hazmat items are received, the system flags them but doesn't enforce safety compliance. Operators could receive hazardous materials without proper PPE.

**Solution:**
Show a mandatory safety checklist when hazmat receiving type is selected:

```
┌─────────────────────────────────────────────────┐
│ ⚠ HAZMAT RECEIVING                              │
├─────────────────────────────────────────────────┤
│                                                  │
│ Hazardous material detected. Confirm safety     │
│ measures before proceeding.                      │
│                                                  │
│ ☐ Gloves worn                                    │
│ ☐ Safety goggles on                              │
│ ☐ Respirator fitted (if required)               │
│ ☐ MSDS sheet available                           │
│ ☐ Designated hazmat dock confirmed               │
│ ☐ Spill kit nearby                               │
│                                                  │
│ Hazard class: [Class 3 ▼] (flammable liquid)    │
│                                                  │
│ [All checked — Proceed]                          │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Frontend: Add checklist modal when hazmat is selected
- Backend: Store PPE confirmation in GRN session notes
- Config: Configurable checklist items per hazmat class

**Files to modify:**
- `web/src/pages/GRN.tsx` — Add hazmat checklist modal
- `api/modules/grn/remaining.go` — Store PPE confirmation

---

## P1 — High Priority (6 Enhancements)

Significant UX improvements that reduce operator steps and improve data quality.

---

### E-006: Auto-Trigger QI from Item Master

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-047 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | Operator manually checks "Requires QI" during scanning |
| **Target State** | System auto-flags items with `requires_qi=true` in master |

**Problem:**
If an item requires quality inspection, the operator must remember to check the "Requires QI" checkbox during scanning. This is error-prone — operators may forget, allowing non-QI items into stock.

**Solution:**
Auto-check "Requires QI" when item master has `requires_qi=true`:

```
┌─────────────────────────────────────────────────┐
│ ITEM SCANNED: PART-A-001                        │
├─────────────────────────────────────────────────┤
│ Expected: 50 units                               │
│ Scanned: 50 units ✅                             │
│                                                 │
│ ⚠ QUALITY INSPECTION REQUIRED                   │
│ This item requires QI per item master settings. │
│ Stock will be held in quarantine until QI passes.│
│                                                 │
│ [Confirm with QI hold] [Override — skip QI]     │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Check `item.requires_qi` during item scan
- Frontend: Auto-set QI flag + show warning
- Config: Add `requires_qi` field to item master form

**Files to modify:**
- `api/modules/grn/verify.go` — Check item master QI flag
- `web/src/pages/GRN.tsx` — Auto-set QI checkbox + warning

---

### E-007: Expiry Date Validation on Scan

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-049 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | Operator manually reports "Expired items" |
| **Target State** | Auto-validate expiry against configurable shelf-life threshold |

**Problem:**
Expired items can be received into stock without detection. The operator must manually check expiry dates and report "Expired items" — which rarely happens in practice.

**Solution:**
Auto-validate expiry date during item scan:

```
┌─────────────────────────────────────────────────┐
│ ITEM SCANNED: PART-B-002                        │
├─────────────────────────────────────────────────┤
│ Batch: BATCH-2026-001                           │
│ Expiry: 2026-09-15 (32 days from now)           │
│                                                 │
│ ⚠ EXPIRY WARNING                                │
│ This item expires within 30 days.               │
│ Shelf-life threshold: 30 days                   │
│                                                 │
│ [Accept — note expiry] [Reject — quarantine]    │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Compare `expiry_date` against `shelf_life_threshold` config
- Frontend: Show warning modal when below threshold
- Config: Add `shelf_life_warning_days` per warehouse (default: 30)

**Files to modify:**
- `api/modules/grn/verify.go` — Add expiry validation
- `web/src/pages/GRN.tsx` — Add expiry warning modal

---

### E-008: Batch Validation Against PO

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-050 |
| **Impact** | MEDIUM |
| **Effort** | MEDIUM |
| **Current State** | Operator manually reports "Wrong batch" |
| **Target State** | Auto-validate scanned batch against PO expected batch |

**Problem:**
Wrong batch numbers can be received without detection. If a PO specifies expected batch numbers, the system should validate against them.

**Solution:**
Auto-validate batch during item scan:

```
┌─────────────────────────────────────────────────┐
│ ITEM SCANNED: PART-C-003                        │
├─────────────────────────────────────────────────┤
│ Scanned batch: BATCH-2026-WRONG                 │
│ Expected batch: BATCH-2026-003                  │
│                                                 │
│ ⚠ WRONG BATCH                                   │
│ Scanned batch does not match PO expected batch. │
│                                                 │
│ [Accept wrong batch] [Reject — quarantine]      │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Add `expected_batch` field to PO lines
- Backend: Compare scanned batch against PO batch during verify
- Frontend: Show batch mismatch warning

**Files to modify:**
- `api/modules/grn/verify.go` — Add batch validation
- `api/modules/masterdata/` — Add expected_batch to PO lines
- `web/src/pages/GRN.tsx` — Add batch mismatch warning

---

### E-009: Receiving Type Auto-Routing

| Attribute | Value |
|-----------|-------|
| **Scenarios** | S-062 to S-070 |
| **Impact** | HIGH |
| **Effort** | MEDIUM |
| **Current State** | All items go to default staging area |
| **Target State** | Auto-route to appropriate zones based on receiving type |

**Problem:**
When special receiving types are selected (hazmat, oversized, sample, consignment), the items still go to the default staging area. Operators must manually move them to the correct zone.

**Solution:**
Auto-route stock to appropriate locations:

| Receiving Type | Auto-Route To |
|----------------|---------------|
| Hazmat | Hazmat zone (ground level) |
| Oversized | Oversized staging area |
| Sample | Sample storage area |
| Consignment | Consignment zone |
| Cross-dock | Outbound staging |
| High value | Secure/cage area |
| Loan | Loan tracking area |
| VMI | VMI replenishment area |
| Serialized | Serialized item staging |

**Implementation:**
- Backend: Add `auto_route_rules` config per warehouse
- Backend: Apply routing rules on GRN finalize
- Frontend: Show auto-routed location in putaway queue

**Files to modify:**
- `api/modules/grn/completion.go` — Apply auto-routing on finalize
- `api/modules/grn/putaway_policy.go` — Add receiving type routing
- `web/src/pages/GRN.tsx` — Show auto-routed location

---

### E-010: Serial Scan Enforcement

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-070 |
| **Impact** | HIGH |
| **Effort** | MEDIUM |
| **Current State** | Serial number is optional |
| **Target State** | Block receiving until all serials captured for serialized items |

**Problem:**
For serialized items, serial numbers can be skipped during receiving. This creates gaps in the serial history — items appear in stock without serial numbers, making tracking impossible.

**Solution:**
Enforce serial scan for serialized items:

```
┌─────────────────────────────────────────────────┐
│ ITEM SCANNED: PART-D-004 (SERIALIZED)           │
├─────────────────────────────────────────────────┤
│ Expected: 10 units                               │
│ Serials captured: 7/10                           │
│                                                 │
│ ⚠ SERIAL SCAN REQUIRED                           │
│ 3 serial numbers still needed.                  │
│                                                 │
│ Captured:                                       │
│ ✅ SN-001, SN-002, SN-003, SN-004, SN-005,     │
│    SN-006, SN-007                               │
│                                                 │
│ Remaining: 3                                    │
│                                                 │
│ [Scan next serial: _______________]              │
│                                                 │
│ [Skip — record exception] [Complete]            │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Add `serial_enforcement` flag per item
- Backend: Block GRN completion if serials incomplete
- Frontend: Show serial capture progress

**Files to modify:**
- `api/modules/grn/verify.go` — Enforce serial capture
- `web/src/pages/GRN.tsx` — Add serial capture progress UI

---

### E-011: Putaway Confidence Score

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-078 |
| **Impact** | MEDIUM |
| **Effort** | HIGH |
| **Current State** | Single suggested location shown |
| **Target State** | Top 3 suggestions with confidence score and reasoning |

**Problem:**
The putaway system shows one suggested location, but operators don't know why it was suggested or what alternatives exist. This reduces trust in the system.

**Solution:**
Show top 3 suggested locations with confidence scores:

```
┌─────────────────────────────────────────────────┐
│ PUTAWAY: PART-A-001 (50 units)                  │
├─────────────────────────────────────────────────┤
│ Suggested locations:                             │
│                                                 │
│ 1. A-01-01-01  Confidence: 92%                 │
│    ✅ Same item already there (30 units)         │
│    ✅ 60% capacity remaining                     │
│    ✅ Fast-mover zone                            │
│                                                 │
│ 2. A-01-02-01  Confidence: 78%                 │
│    ✅ Same item already there (10 units)         │
│    ⚠ 40% capacity remaining                     │
│    ✅ Fast-mover zone                            │
│                                                 │
│ 3. B-01-01-01  Confidence: 65%                 │
│    ⚠ No same item (fresh location)              │
│    ✅ 90% capacity remaining                     │
│    ⚠ Slow-mover zone                            │
│                                                 │
│ [Scan bin: _______________] [Custom location]   │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Enhance putaway scoring algorithm
- Factors: Same-item match, capacity, velocity, zone consistency
- Frontend: Show top 3 with reasoning

**Files to modify:**
- `api/modules/grn/putaway_policy.go` — Enhance scoring
- `web/src/pages/Putaway.tsx` — Show top 3 suggestions

---

## P2 — Medium Priority (11 Enhancements)

Nice-to-have improvements that enhance efficiency and compliance.

---

### E-012: COA File Upload During Receiving

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-051 |
| **Impact** | HIGH |
| **Effort** | MEDIUM |
| **Current State** | No way to attach COA documents |
| **Target State** | File upload field for COA attachment |

**Problem:**
When "Missing COA" is reported, there's no way to attach the COA document once it arrives later. The exception stays open with no resolution path.

**Solution:**
Add file upload field in exception resolution:

```
┌─────────────────────────────────────────────────┐
│ RESOLVE: Missing COA — PART-A-001               │
├─────────────────────────────────────────────────┤
│ Exception: Missing Certificate of Analysis      │
│ Created: 2026-08-13 10:30                       │
│                                                 │
│ Upload COA document:                             │
│ ┌─────────────────────────────────────────┐     │
│ │ 📎 Choose file or drag & drop           │     │
│ │    PDF, JPG, PNG (max 10MB)            │     │
│ └─────────────────────────────────────────┘     │
│                                                 │
│ COA uploaded: COA_PART-A-001.pdf ✅             │
│                                                 │
│ [Resolve — COA received] [Keep open]            │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Add file upload endpoint for exceptions
- Storage: Store files in `/uploads/exceptions/` or cloud storage
- Frontend: Add drag-and-drop upload in exception resolution

**Files to modify:**
- `api/modules/grn/handler.go` — Add file upload endpoint
- `web/src/pages/GRNExceptions.tsx` — Add upload UI

---

### E-013: Photo Capture for Damage/Contamination Evidence

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-052 |
| **Impact** | HIGH |
| **Effort** | MEDIUM |
| **Current State** | No visual evidence attached to exceptions |
| **Target State** | Camera button for capturing evidence photos |

**Problem:**
When damage or contamination is reported, there's no way to attach visual evidence. This weakens vendor disputes and insurance claims.

**Solution:**
Add camera button on damage/contamination reports:

```
┌─────────────────────────────────────────────────┐
│ REPORT: Damaged Box — BOX-003                   │
├─────────────────────────────────────────────────┤
│ Box condition: Damaged                           │
│                                                 │
│ Evidence photos:                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│ │ 📷 Photo │ │ 📷 Photo │ │ + Add    │        │
│ │   1 ✅   │ │   2 ✅   │ │  More    │        │
│ └──────────┘ └──────────┘ └──────────┘        │
│                                                 │
│ Description: Items crushed inside outer carton  │
│                                                 │
│ [Submit with photos] [Cancel]                   │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Frontend: Add camera capture using `navigator.mediaDevices.getUserMedia()`
- Backend: Store images in `/uploads/evidence/` or cloud storage
- Mobile: Support device camera for handheld scanners

**Files to modify:**
- `web/src/pages/GRN.tsx` — Add camera capture component
- `api/modules/grn/handler.go` — Add image upload endpoint

---

### E-014: Automatic Delivery Timing Detection

| Attribute | Value |
|-----------|-------|
| **Scenarios** | S-056, S-057 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | Operator manually reports early/late delivery |
| **Target State** | Auto-compare arrival vs PO scheduled delivery date |

**Problem:**
Early and late deliveries are only detected if the operator manually reports them. This data is critical for supplier scorecarding.

**Solution:**
Auto-detect delivery timing issues:

```
On GRN creation:
  IF arrival_at < expectedDeliveryAt - 24h:
    → Auto-report EARLY_DELIVERY exception
    → Show: "Truck arrived 2 days early"
  
  IF arrival_at > expectedDeliveryAt + 24h:
    → Auto-report LATE_DELIVERY exception
    → Show: "Truck arrived 3 days late"
```

**Implementation:**
- Backend: Compare `arrival_at` vs PO `expected_delivery_date`
- Backend: Auto-create exception if timing mismatch > 24h
- Frontend: Show timing badge on GRN session

**Files to modify:**
- `api/modules/grn/handler.go` — Add timing validation on GRN create
- `web/src/pages/GRN.tsx` — Show timing badge

---

### E-015: Supplier Barcode Validation

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-054 |
| **Impact** | MEDIUM |
| **Effort** | MEDIUM |
| **Current State** | Operator manually reports "Wrong supplier" |
| **Target State** | Auto-validate supplier barcode against PO supplier |

**Problem:**
Wrong supplier deliveries can be received without detection. If supplier delivery documents have barcodes/QR codes, the system could auto-validate.

**Solution:**
Auto-validate supplier barcode:

```
On truck arrival:
  1. Scan supplier barcode from delivery document
  2. System looks up supplier in master data
  3. Compare against PO supplier
  4. If mismatch → Auto-report WRONG_SUPPLIER exception
```

**Implementation:**
- Backend: Add `supplier_barcode` field to supplier master
- Backend: Validate scanned barcode against PO supplier on GRN create
- Frontend: Show supplier validation result

**Files to modify:**
- `api/modules/grn/handler.go` — Add supplier validation
- `api/modules/masterdata/` — Add `supplier_barcode` field

---

### E-016: Receiving Hours Configuration

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-059 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | No receiving hours enforcement |
| **Target State** | Configurable receiving hours per warehouse |

**Problem:**
Trucks arriving outside operating hours are only flagged if the operator manually reports them. There's no automatic detection.

**Solution:**
Add receiving hours config:

```
Warehouse Settings:
  Receiving hours:
    Monday-Friday: 6:00 AM — 6:00 PM
    Saturday: 8:00 AM — 2:00 PM
    Sunday: Closed
  
  On truck arrival:
    IF current time outside receiving hours:
      → Auto-report OUTSIDE_HOURS exception
      → Show: "Truck arrived outside receiving hours"
```

**Implementation:**
- Backend: Add `receiving_hours` config per warehouse
- Backend: Validate arrival time against config on GRN create
- Frontend: Show receiving hours config in warehouse settings

**Files to modify:**
- `web/src/pages/Warehouses.tsx` — Add receiving hours config
- `api/modules/grn/handler.go` — Add hours validation

---

### E-017: High Value Secure Putaway

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-071 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | High value items go to regular putaway locations |
| **Target State** | Filter putaway to only show secure/cage bins |

**Problem:**
High value items can be put away in regular bins, increasing theft risk. The system should restrict putaway to secure locations.

**Solution:**
Filter putaway locations for high value items:

```
Putaway suggestions:
  Only show bins with: is_secure = true
  Examples: CAGE-A-01, LOCKED-B-02, VAULT-C-01
  
  Require: Dual-confirmation (2 operators) for putaway
```

**Implementation:**
- Backend: Add `is_secure` flag to bin locations
- Backend: Filter putaway suggestions for high value items
- Frontend: Show secure badge on suggested locations

**Files to modify:**
- `api/modules/grn/putaway_policy.go` — Add secure location filter
- `web/src/pages/Putaway.tsx` — Show secure badge

---

### E-018: Cross-Dock Outbound Order Link

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-072 |
| **Impact** | MEDIUM |
| **Effort** | MEDIUM |
| **Current State** | Cross-dock items staged without outbound link |
| **Target State** | Show which outbound order stock is destined for |

**Problem:**
Cross-dock items are staged for outbound, but there's no visibility into which outbound order they're for. This causes confusion during loading.

**Solution:**
Link cross-dock to outbound order:

```
┌─────────────────────────────────────────────────┐
│ CROSS-DOCK: PART-E-005                          │
├─────────────────────────────────────────────────┤
│ This stock is destined for:                      │
│                                                 │
│ Outbound Order: OUT-2026-0089                   │
│ Customer: ABC Manufacturing                     │
│ Ship by: 2026-08-14 12:00 PM                    │
│                                                 │
│ Stage at: OUTBOUND-STAGING-A                    │
│                                                 │
│ [Confirm staging] [View outbound order]         │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Add `outbound_order_id` to GRN session for cross-dock
- Backend: Link GRN to outbound order on finalize
- Frontend: Show outbound order details in GRN workspace

**Files to modify:**
- `api/modules/grn/completion.go` — Link to outbound order
- `web/src/pages/GRN.tsx` — Show outbound order link

---

### E-019: Session History Timeline

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-080 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | Status changes shown as text |
| **Target State** | Visual timeline with timestamps and operators |

**Problem:**
Status changes are shown as text in the activity tab. A visual timeline would be easier to understand at a glance.

**Solution:**
Show visual timeline:

```
┌─────────────────────────────────────────────────┐
│ GRN SESSION TIMELINE                             │
├─────────────────────────────────────────────────┤
│                                                  │
│ ● DRAFT ──────── RECEIVING ──────── COMPLETED   │
│ │ 09:30           09:45              10:45      │
│ │ admin           admin               admin      │
│ │                 │                    │         │
│ │                 ├── BOXES (15 min)   │         │
│ │                 ├── ITEMS (20 min)   │         │
│ │                 ├── AUDIT (10 min)   │         │
│ │                 └── PUTAWAY (30 min) │         │
│                                                  │
│ Total duration: 1h 15m                           │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Query `grn_events` table for status changes
- Frontend: Render timeline component using events data

**Files to modify:**
- `web/src/pages/GRN.tsx` — Add timeline component in activity tab

---

### E-020: Quarantine Release Workflow

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-073 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | Quarantine items require QI pass |
| **Target State** | Add explicit "Release from quarantine" button with supervisor approval |

**Problem:**
Quarantine items can only be released through the QI workflow. There's no direct "release" button for supervisor overrides.

**Solution:**
Add release button:

```
┌─────────────────────────────────────────────────┐
│ QUARANTINE: PART-F-006                          │
├─────────────────────────────────────────────────┤
│ Reason: Quality hold                             │
│ Duration: 5 days                                 │
│ Status: Awaiting release                         │
│                                                 │
│ Release from quarantine:                         │
│ Reason: [Supplier confirmed OK ▼]               │
│ Notes: [________________________]               │
│                                                 │
│ [Release to storage] [Keep in quarantine]       │
│                                                 │
│ ⚠ Requires supervisor approval                  │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Add `/grn/exceptions/:id/release` endpoint
- Backend: Check supervisor role before release
- Frontend: Add release button in exception resolution

**Files to modify:**
- `api/modules/grn/handler.go` — Add release endpoint
- `web/src/pages/GRNExceptions.tsx` — Add release button

---

### E-021: Return Reason Picker

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-062 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | Return receipt recorded without reason |
| **Target State** | Reason picker for supplier scorecarding |

**Problem:**
Return receipts don't capture the reason, making supplier scorecarding impossible.

**Solution:**
Add reason picker:

```
┌─────────────────────────────────────────────────┐
│ RETURN RECEIPT                                   │
├─────────────────────────────────────────────────┤
│ Reason: [Defective ▼]                           │
│                                                 │
│ Options:                                        │
│ • Defective                                     │
│ • Wrong item sent                                │
│ • Customer changed mind                          │
│ • Warranty claim                                 │
│ • Quality issue                                  │
│ • Excess ordered                                 │
│                                                 │
│ Notes: [________________________]               │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Add `return_reason` field to GRN session
- Frontend: Add dropdown in return receipt form

**Files to modify:**
- `api/modules/grn/handler.go` — Store return reason
- `web/src/pages/GRN.tsx` — Add reason picker

---

### E-022: Source Warehouse Picker for Transfers

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-063 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | Transfer in recorded without source |
| **Target State** | Source warehouse picker |

**Problem:**
Transfer in receipts don't capture the source warehouse, making the transfer record incomplete.

**Solution:**
Add source warehouse picker:

```
┌─────────────────────────────────────────────────┐
│ TRANSFER IN                                      │
├─────────────────────────────────────────────────┤
│ Source warehouse: [DGH Warehouse ▼]             │
│                                                 │
│ Options:                                        │
│ • DGH Warehouse                                 │
│ • WH-MUM-01                                     │
│ • WH-DEL-02                                     │
│                                                 │
│ Transfer note: [________________________]       │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Backend: Add `source_warehouse_id` to GRN session
- Frontend: Add warehouse picker dropdown

**Files to modify:**
- `api/modules/grn/handler.go` — Store source warehouse
- `web/src/pages/GRN.tsx` — Add warehouse picker

---

### E-023: Supplier-Owned Stock Badge

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-064 |
| **Impact** | MEDIUM |
| **Effort** | LOW |
| **Current State** | Consignment stock looks like regular stock |
| **Target State** | Visual badge on consignment stock in all views |

**Problem:**
Consignment (supplier-owned) stock can be accidentally picked/sold. There's no visual distinction from regular stock.

**Solution:**
Add "Supplier-owned" badge:

```
Inventory Table:
┌─────────────┬──────┬────────┬──────────┐
│ Part        │ Qty  │ Status │ Owner    │
├─────────────┼──────┼────────┼──────────┤
│ PART-A-001  │  50  │ On Hand │ 🏭 Own  │
│ PART-B-002  │  30  │ On Hand │ 📦 Supplier │
│ PART-C-003  │  25  │ On Hand │ 🏭 Own  │
└─────────────┴──────┴────────┴──────────┘
```

**Implementation:**
- Backend: Add `owner` field to stock balance
- Frontend: Show badge in inventory tables

**Files to modify:**
- `web/src/pages/Inventory.tsx` — Add owner badge
- `web/src/pages/Items.tsx` — Add owner column

---

### E-024: Do Not Mix Indicator for Samples

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-066 |
| **Impact** | LOW |
| **Effort** | LOW |
| **Current State** | Sample stock looks like regular stock |
| **Target State** | Red "Do not mix" indicator on sample stock |

**Problem:**
Sample stock can be accidentally mixed with saleable inventory.

**Solution:**
Add red indicator:

```
Inventory Table:
┌─────────────┬──────┬────────┬──────────┐
│ Part        │ Qty  │ Status │ Type     │
├─────────────┼──────┼────────┼──────────┤
│ PART-A-001  │  50  │ On Hand │ Regular  │
│ PART-S-001  │   5  │ On Hand │ 🔴 SAMPLE │
│ PART-C-003  │  25  │ On Hand │ Regular  │
└─────────────┴──────┴────────┴──────────┘
```

**Implementation:**
- Backend: Add `stock_type` field to stock balance
- Frontend: Show red badge for sample stock

**Files to modify:**
- `web/src/pages/Inventory.tsx` — Add sample badge

---

## P3 — Low Priority (13 Enhancements)

Polish items and future roadmap features.

---

### E-025: Loan Return Date Tracking

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-067 |
| **Impact** | LOW |
| **Effort** | LOW |
| **Current State** | Loan received without return date |
| **Target State** | Return date picker + overdue reminders |

**Implementation:**
- Add `return_by_date` field to GRN session for loan type
- Add reminder notifications 3 days before and on due date
- Flag overdue loans in dashboard

---

### E-026: Dimensions Input for Oversized

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-069 |
| **Impact** | LOW |
| **Effort** | LOW |
| **Current State** | Oversized items received without dimensions |
| **Target State** | L×W×H×Weight input for putaway location filtering |

**Implementation:**
- Add dimension inputs when oversized is selected
- Use dimensions to filter putaway locations by capacity
- Store in GRN session for reference

---

### E-027: Side-by-Side Comparison for Document Mismatches

| Attribute | Value |
|-----------|-------|
| **Scenarios** | S-043, S-044 |
| **Impact** | MEDIUM |
| **Effort** | MEDIUM |
| **Current State** | Exception reported without comparison |
| **Target State** | Side-by-side table showing PO vs invoice/PL |

**Implementation:**
- Add comparison modal when document mismatch is reported
- Show PO data vs invoice/PL data in parallel columns
- Highlight differences in red

---

### E-028: Dynamic Invoice Input Rows

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-045 |
| **Impact** | LOW |
| **Effort** | LOW |
| **Current State** | Comma-separated invoice numbers |
| **Target State** | "Add invoice" button for dynamic rows |

**Implementation:**
- Replace comma-separated input with dynamic rows
- Add "+" button to add new invoice input
- Store as array in GRN session

---

### E-029: Documents to Follow Checkbox

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-046 |
| **Impact** | LOW |
| **Effort** | LOW |
| **Current State** | Driver has no docs reported manually |
| **Target State** | Checkbox in truck arrival form |

**Implementation:**
- Add "Documents to follow" checkbox in truck arrival form
- Auto-set `driver_no_docs` exception when checked
- Add "Expected by" date picker for follow-up

---

### E-030: VMI Replenishment Alerts

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-065 |
| **Impact** | LOW |
| **Effort** | HIGH |
| **Current State** | VMI received without threshold tracking |
| **Target State** | Auto-generate replenishment request when below threshold |

**Implementation:**
- Add `vmi_threshold` field to item master
- Monitor VMI stock levels daily
- Auto-generate PO/replenishment request when below threshold

---

### E-031: Batch Template Feature

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-076 |
| **Impact** | LOW |
| **Effort** | LOW |
| **Current State** | Batch config entered manually each time |
| **Target State** | Save/reuse common batch configurations |

**Implementation:**
- Add "Save as template" button on batch config
- Add "Load template" dropdown on batch entry
- Store templates per warehouse

---

### E-032: Email Completion Summary

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-077 |
| **Impact** | LOW |
| **Effort** | LOW |
| **Current State** | Summary shown in modal only |
| **Target State** | Email summary to warehouse manager |

**Implementation:**
- Add email sending on GRN completion
- Include key metrics: boxes, items, exceptions, stock posted
- Configurable email recipients per warehouse

---

### E-033: Multi-Level Exception Approval

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-079 |
| **Impact** | LOW |
| **Effort** | HIGH |
| **Current State** | Supervisor can resolve any exception |
| **Target State** | Manager approval for exceptions above threshold |

**Implementation:**
- Add `approval_threshold` config per exception type
- Route exceptions above threshold to manager
- Add approval/reject buttons for managers

---

### E-034: Re-Open Reason Picker

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-080 |
| **Impact** | LOW |
| **Effort** | LOW |
| **Current State** | Session re-opened without reason |
| **Target State** | Reason picker for audit trail |

**Implementation:**
- Add reason dropdown when session is re-opened
- Options: Browser crash, Network issue, Operator break, System maintenance
- Store reason in audit trail

---

### E-035: GRN Lifecycle Timeline

| Attribute | Value |
|-----------|-------|
| **Scenario** | S-081 |
| **Impact** | LOW |
| **Effort** | LOW |
| **Current State** | Status shown as text badge |
| **Target State** | Visual timeline with duration at each stage |

**Implementation:**
- Query all status change events for a GRN
- Render as vertical timeline with timestamps
- Show duration between each stage

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)
Low effort, high impact changes:

| Enhancement | Effort | Impact |
|-------------|--------|--------|
| E-002: Physical count on box scan | LOW | HIGH |
| E-005: Hazmat safety checklist | LOW | HIGH |
| E-006: Auto-trigger QI from item master | LOW | MEDIUM |
| E-007: Expiry date validation on scan | LOW | MEDIUM |
| E-014: Auto delivery timing detection | LOW | MEDIUM |
| E-016: Receiving hours config | LOW | MEDIUM |
| E-017: High value secure putaway | LOW | MEDIUM |
| E-020: Quarantine release workflow | LOW | MEDIUM |
| E-021: Return reason picker | LOW | MEDIUM |
| E-022: Source warehouse picker | LOW | MEDIUM |
| E-025: Loan return date tracking | LOW | LOW |
| E-026: Dimensions input for oversized | LOW | LOW |
| E-028: Dynamic invoice input rows | LOW | LOW |
| E-029: Documents to follow checkbox | LOW | LOW |
| E-031: Batch template feature | LOW | LOW |
| E-032: Email completion summary | LOW | LOW |
| E-034: Re-open reason picker | LOW | LOW |
| E-035: GRN lifecycle timeline | LOW | LOW |

### Phase 2: Core Enhancements (3-4 weeks)
Medium effort, high impact changes:

| Enhancement | Effort | Impact |
|-------------|--------|--------|
| E-001: Auto-validate PL on import | MEDIUM | HIGH |
| E-003: GRN completion PDF export | MEDIUM | HIGH |
| E-004: Exception escalation workflow | MEDIUM | HIGH |
| E-008: Batch validation against PO | MEDIUM | MEDIUM |
| E-009: Receiving type auto-routing | MEDIUM | HIGH |
| E-010: Serial scan enforcement | MEDIUM | HIGH |
| E-012: COA file upload | MEDIUM | HIGH |
| E-013: Photo capture for evidence | MEDIUM | HIGH |
| E-015: Supplier barcode validation | MEDIUM | MEDIUM |
| E-018: Cross-dock outbound link | MEDIUM | MEDIUM |
| E-023: Supplier-owned stock badge | MEDIUM | MEDIUM |
| E-024: Do not mix indicator | MEDIUM | LOW |
| E-027: Side-by-side comparison UI | MEDIUM | MEDIUM |

### Phase 3: Advanced Features (5-8 weeks)
High effort, high impact changes:

| Enhancement | Effort | Impact |
|-------------|--------|--------|
| E-011: Putaway confidence score | HIGH | MEDIUM |
| E-030: VMI replenishment alerts | HIGH | LOW |
| E-033: Multi-level exception approval | HIGH | LOW |

---

## Metrics

| Metric | Value |
|--------|-------|
| **Total Enhancements** | 35 |
| **P0 Critical** | 5 |
| **P1 High** | 6 |
| **P2 Medium** | 11 |
| **P3 Low** | 13 |
| **Estimated Total Effort** | 12-16 weeks (1 developer) |
| **Quick Wins (Phase 1)** | 18 enhancements |
| **Core Enhancements (Phase 2)** | 13 enhancements |
| **Advanced Features (Phase 3)** | 3 enhancements |

---

*Generated from codebase analysis of 81 GRN test scenarios.*
*All scenarios are fully implemented in the codebase.*
*These enhancements would elevate goWMS to Tier-1 global WMS standards.*
