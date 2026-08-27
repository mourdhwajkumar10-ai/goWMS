# S-051 to S-060: Codebase Implementation Verification + Suggestions

## Summary

| Scenario | Category | Expected Feature | Implemented? | Suggestion |
|----------|----------|-----------------|-------------|------------|
| S-051 | Quality | Missing COA / certifications | ✅ IMPLEMENTED | Add COA file upload during receiving |
| S-052 | Quality | Contaminated items | ✅ IMPLEMENTED | Add contamination photo capture |
| S-053 | Quality | Cold chain break | ✅ IMPLEMENTED | Add temperature log integration |
| S-054 | Supplier | Wrong supplier delivers | ✅ IMPLEMENTED | Add supplier barcode validation |
| S-055 | Supplier | Unscheduled delivery | ✅ IMPLEMENTED | Add appointment scheduler |
| S-056 | Supplier | Early delivery | ✅ IMPLEMENTED | Add delivery window config |
| S-057 | Supplier | Late delivery | ✅ IMPLEMENTED | Add PO delivery date comparison |
| S-058 | Supplier | Split truck (same PO) | ✅ IMPLEMENTED | Add multi-truck PO tracking |
| S-059 | Supplier | Outside operating hours | ✅ IMPLEMENTED | Add receiving hours config |
| S-060 | Supplier | Rejected truck returned | ✅ IMPLEMENTED | Add reject history check |

---

## Detailed Analysis

### S-051: Missing COA / Certifications

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 26: `missing_coa` — `MISSING_COA` |
| UI alert | `GRN.tsx` line 722: `missing_coa: '⚠ MISSING COA'` |
| Report button | `GRN.tsx` line 2252: "Missing certifications / COA" button |
| Auto-hold | `remaining.go` line 85-91: Sets `requires_qi=true` on GRN lines |
| QI hold note | `remaining.go` line 91: Appends `\nQI HOLD: missing_coa` to session notes |

**💡 Suggestion:** Add a **COA file upload field** during receiving. When "Missing COA" is reported, the operator should be able to upload the COA document (PDF/image) and attach it to the GRN session. Currently there's no way to attach the COA once it arrives later.

---

### S-052: Contaminated Items

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 27: `contaminated` — `CONTAMINATED` |
| UI alert | `GRN.tsx` line 723: `contaminated: '⚠ CONTAMINATED'` |
| Report button | `GRN.tsx` line 2253: "Contaminated items" button |
| Auto-hold | `remaining.go` line 85-91: Sets `requires_qi=true` |
| Description | "smell, wetness, residue, or contamination. Quarantine." |

**💡 Suggestion:** Add a **photo capture button** for contamination evidence. Warehouse operators should be able to take a photo of the contamination and attach it to the exception record for vendor disputes.

---

### S-053: Cold Chain Break

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 28: `cold_chain` — `COLD_CHAIN_BREAK` |
| UI alert | `GRN.tsx` line 724: `cold_chain: '⚠ COLD CHAIN BREAK'` |
| Report button | `GRN.tsx` line 2254: "Temperature-sensitive arrived wrong" button |
| Auto-hold | `remaining.go` line 85-91: Sets `requires_qi=true` |
| Description | "temperature-sensitive goods arrived warm / thawed." |

**💡 Suggestion:** Add a **temperature reading input** when reporting cold chain break. Operator enters the measured temperature (e.g., "8°C" when it should be "< 4°C"). This data is critical for supplier claims.

---

### S-054: Wrong Supplier Delivers

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 30: `wrong_supplier` — `WRONG_SUPPLIER` |
| UI alert | `GRN.tsx` line 726: `wrong_supplier: '⚠ WRONG SUPPLIER'` |
| Report button | `GRN.tsx` line 2273: "Wrong supplier delivers" button |
| Expected supplier input | `GRN.tsx`: `expectedSupplier` state for specifying expected supplier |

**💡 Suggestion:** Add **supplier barcode validation**. If the supplier has a registered barcode/QR on their delivery documents, the system could auto-validate against the PO supplier. Currently the operator must manually report "Wrong supplier".

---

### S-055: Unscheduled Delivery

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 31: `unscheduled_delivery` — `UNSCHEDULED_DELIVERY` |
| UI alert | `GRN.tsx` line 727: `unscheduled_delivery: '⚠ UNSCHEDULED DELIVERY'` |
| Report button | `GRN.tsx` line 2274: "Unscheduled delivery" button |
| Checkbox | `GRN.tsx` line 1527: "Unscheduled delivery" checkbox in truck arrival form |
| Description | "no PO/ASN appointment. Surprise truck." |

**💡 Suggestion:** Add an **appointment scheduler** for inbound deliveries. Suppliers book delivery slots, and the system auto-validates against the schedule on arrival. Currently there's no scheduling mechanism.

---

### S-056: Early Delivery

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 32: `early_delivery` — `EARLY_DELIVERY` |
| UI alert | `GRN.tsx` line 728: `early_delivery: '⚠ EARLY DELIVERY'` |
| Report button | `GRN.tsx` line 2275: "Early delivery" button |
| Expected delivery input | `GRN.tsx`: `expectedDeliveryAt` state for PO scheduled delivery |
| Description | "arrived before the PO schedule. Warehouse may not be ready." |

**💡 Suggestion:** Add **automatic early delivery detection**. Compare `arrival_at` against `expectedDeliveryAt` (PO scheduled delivery). If arrival is > 24 hours early, auto-report the exception.

---

### S-057: Late Delivery

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 33: `late_delivery` — `LATE_DELIVERY` |
| UI alert | `GRN.tsx` line 729: `late_delivery: '⚠ LATE DELIVERY'` |
| Report button | `GRN.tsx` line 2276: "Late delivery" button |
| Expected delivery input | `GRN.tsx`: `expectedDeliveryAt` state |
| Description | "arrived after the PO schedule." |

**💡 Suggestion:** Add **automatic late delivery detection**. Compare `arrival_at` against `expectedDeliveryAt`. If arrival is > 24 hours late, auto-report the exception.

---

### S-058: Split Truck (Same PO Across Multiple Trucks)

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 34: `split_truck` — `SPLIT_TRUCK` |
| UI alert | `GRN.tsx` line 730: `split_truck: '⚠ SPLIT TRUCK'` |
| Report button | `GRN.tsx` line 2277: "Multiple trucks, same PO" button |
| Description | "this PO is split across multiple trucks. Receive this truck only." |
| Multi-PO same truck | `GRN.tsx`: Checkbox selection for multiple POs on same truck |

**💡 Suggestion:** Add **PO quantity tracking across trucks**. When a split truck is reported, show how much of the PO has been received across all GRN sessions for that PO. Currently there's no visibility into partial PO receipt across multiple trucks.

---

### S-059: Outside Operating Hours

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 35: `outside_hours` — `OUTSIDE_HOURS` |
| UI alert | `GRN.tsx` line 731: `outside_hours: '⚠ OUTSIDE HOURS'` |
| Report button | `GRN.tsx` line 2278: "Truck arrives outside operating hours" button |
| Description | "delivery outside staffed receiving window." |

**💡 Suggestion:** Add **receiving hours configuration** per warehouse. Store allowed receiving hours (e.g., "Mon-Fri 6AM-6PM") and auto-detect when a truck arrives outside those hours.

---

### S-060: Rejected Truck Returns

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 37: `rejected_truck_return` — `REJECTED_TRUCK_RETURN` |
| UI alert | `GRN.tsx` line 733: `rejected_truck_return: '⚠ REJECTED TRUCK RETURNED'` |
| Report button | `GRN.tsx` line 2280: "Rejected truck returns" button |
| Description | "same-day return after a prior reject. Confirm goods were not swapped." |

**💡 Suggestion:** Add **reject history lookup**. When this exception is reported, the system should search for recent GRN sessions with the same truck number that were rejected/cancelled, and show the history to the operator.

---

## Top 5 High-Impact Suggestions (S-051 to S-060)

### 1. COA File Upload During Receiving
**Impact:** HIGH — Critical for compliance
**Effort:** MEDIUM
**Details:** Add a file upload field when "Missing COA" is reported. Store the COA document attached to the GRN session. When the COA arrives later, operator can upload it and resolve the exception.

### 2. Photo Capture for Contamination/Damage Evidence
**Impact:** HIGH — Essential for vendor disputes
**Effort:** MEDIUM
**Details:** Add a camera button on contamination/damage exception reports. Use the device camera to capture evidence photos and attach them to the exception record.

### 3. Automatic Delivery Timing Detection
**Impact:** MEDIUM — Proactive alerts
**Effort:** LOW
**Details:** Compare `arrival_at` against PO `expectedDeliveryAt`. Auto-report early/late delivery exceptions without operator action.

### 4. Supplier Barcode Validation
**Impact:** MEDIUM — Prevents wrong supplier receipts
**Effort:** MEDIUM
**Details:** If supplier delivery documents have barcodes, auto-validate against the PO supplier. Flag mismatches immediately.

### 5. Receiving Hours Configuration
**Impact:** MEDIUM — Operational control
**Effort:** LOW
**Details:** Add warehouse-level receiving hours config (e.g., "Mon-Fri 6AM-6PM"). Auto-detect outside-hours deliveries.

---

## All Remaining Exception Types (S-051 to S-060 mapped)

| Scenario | Exception Type | Event | UI Alert | Report Button |
|----------|---------------|-------|----------|---------------|
| S-051 | Missing COA | `MISSING_COA` | ⚠ MISSING COA | ✅ |
| S-052 | Contaminated | `CONTAMINATED` | ⚠ CONTAMINATED | ✅ |
| S-053 | Cold chain break | `COLD_CHAIN_BREAK` | ⚠ COLD CHAIN BREAK | ✅ |
| S-054 | Wrong supplier | `WRONG_SUPPLIER` | ⚠ WRONG SUPPLIER | ✅ |
| S-055 | Unscheduled delivery | `UNSCHEDULED_DELIVERY` | ⚠ UNSCHEDULED DELIVERY | ✅ |
| S-056 | Early delivery | `EARLY_DELIVERY` | ⚠ EARLY DELIVERY | ✅ |
| S-057 | Late delivery | `LATE_DELIVERY` | ⚠ LATE DELIVERY | ✅ |
| S-058 | Split truck | `SPLIT_TRUCK` | ⚠ SPLIT TRUCK | ✅ |
| S-059 | Outside hours | `OUTSIDE_HOURS` | ⚠ OUTSIDE HOURS | ✅ |
| S-060 | Rejected truck return | `REJECTED_TRUCK_RETURN` | ⚠ REJECTED TRUCK RETURNED | ✅ |
