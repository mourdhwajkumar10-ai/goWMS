# goWMS GRN Module — Critical Bug Report & UI Audit

**Date:** 2026-08-15  
**Tested URL:** http://34.93.122.213:8080  
**Tested By:** AI QA Agent  
**Environment:** Production instance  
**Login:** admin / admin123

---

## Executive Summary

The GRN module has **22 total issues**: 5 critical, 5 high, 7 medium, and 5 low. The most severe problems include duplicate UI controls, broken date defaults, status values not matching spec, and missing workflow visualization.

---

## 🔴 CRITICAL ISSUES (5)

### BUG-001: Duplicate Receiving Mode Selectors
| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Page** | GRN main page |
| **Impact** | User confusion, conflicting state |

**Description:** Two separate comboboxes control the receiving mode:
1. `@e8` — "Yes — packing list" / "No — invoice only" (asks IF you have a packing list)
2. `@e9` — "Packing list" / "Invoice only" (asks WHAT mode to use)

**Problem:** These are redundant and can contradict each other. If a user selects "No — invoice only" in the first dropdown but "Packing list" in the second, the system state is undefined.

**Expected:** Single selector per the spec — just "Packing List Mode" vs "Invoice-Only Mode".

---

### BUG-002: Date/Time Fields Default to Zero
| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Page** | GRN creation form |
| **Impact** | Invalid data, user must manually enter date |

**Description:** All date/time spinbuttons show `0`:
- Month: 0, Day: 0, Year: 0, Hours: 0, Minutes: 0, AM/PM: 0

**Expected:** Auto-populate with current date/time per spec.

---

### BUG-003: GRN Status Values Don't Match Specification
| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Page** | GRN list, all GRN pages |
| **Impact** | Workflow states are wrong, spec non-compliance |

**Spec defines:** `DRAFT → RECEIVING → BOX_RECONCILIATION → ITEM_VERIFICATION → EXCEPTION_PENDING → ITEM_VERIFICATION_COMPLETE → PUTAWAY_PENDING → PUTAWAY_IN_PROGRESS → COMPLETED`

**Actual values found:**
| Actual Status | Count | Spec Equivalent |
|--------------|-------|-----------------|
| `open` | 13 | ??? (not in spec) |
| `closed` | 6 | ??? (not in spec) |
| `draft` | 5 | DRAFT |
| `completed` | 3 | COMPLETED |
| `receiving` | 1 | RECEIVING |
| `putaway_pending` | 1 | PUTAWAY_PENDING |

---

### BUG-004: GRNs Can Exist Without Supplier or PO
| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Page** | GRN list |
| **Impact** | Data integrity violation |

**Evidence:** Multiple GRN sessions show "-" for Supplier and/or PO:
- GRN-2026-00042: Supplier = "-", PO = "-"
- GRN-2026-00038: Supplier = "No WH", PO = "-"
- GRN-2026-00036: Supplier = "-", PO = "-"

**Additional Issue:** GRN-2026-00046 has supplier "PO-01" — a PO number entered in the supplier field.

---

### BUG-005: Navigation Routing Bug — GRN Link Opens Notifications
| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Page** | All pages |
| **Impact** | Users cannot reliably navigate to GRN |

**Description:** Clicking the GRN sidebar link sometimes navigated to the Notifications page instead of the GRN page.

---

## 🟠 HIGH ISSUES (5)

### BUG-006: All POs Show Zero Items and Zero Total
| Field | Value |
|-------|-------|
| **Severity** | High |
| **Page** | GRN — Select PO to Receive |
| **Impact** | Operators cannot see what they're receiving |

**Evidence:** Every PO shows Items: `0`, Total: `0.00`

---

### BUG-007: Test/Debug Warehouses Visible in Production
| Field | Value |
|-------|-------|
| **Severity** | High |
| **Page** | GRN — Warehouse selector |
| **Impact** | Data pollution, user confusion |

**Test warehouses found:** WH-TEST-01, WH WITH SPACES, WH_UNDER_01, WH-HYPHEN-01, WH-MODE-01

---

### BUG-008: Save Draft Enabled Without Any Data
| Field | Value |
|-------|-------|
| **Severity** | High |
| **Page** | GRN creation form |
| **Impact** | Empty/draft GRNs pollute the system |

**Description:** "Save draft" button is always enabled, even with an empty form.

---

### BUG-009: No Workflow Progress Bar on GRN Detail Page
| Field | Value |
|-------|-------|
| **Severity** | High |
| **Page** | GRN workspace |
| **Impact** | Users cannot see where they are in the workflow |

**Spec defines:** Progress bar showing TRUCK → GRN → BOX RECEIVING → BOX RECONCILIATION → ITEM VERIFICATION → EXCEPTIONS → PUT-AWAY → COMPLETE

**Actual:** No progress bar found.

---

### BUG-010: Missing GRN Tabs
| Field | Value |
|-------|-------|
| **Severity** | High |
| **Page** | GRN workspace |
| **Impact** | Cannot access key GRN functions |

**Spec defines tabs:** Overview, Boxes, Items, Exceptions, Audit, Activity

**Actual:** No tabs found.

---

## 🟡 MEDIUM ISSUES (7)

### BUG-011: Hardcoded Placeholder Text in Fields
Truck number shows `MH-12-AB-1234`, Invoice shows `INV-001, INV-002` — looks like real values, not placeholders.

### BUG-012: Scan Button Has No Context
"Scan" button has no label explaining what it scans (box, item, etc.).

### BUG-013: 29 Unread Notifications
31 total notifications, 29 unread — no auto-read mechanism.

### BUG-014: Putaway Button on GRN Receiving Page
Putaway button appears on receiving page — violates spec ("Put-away is a separate downstream process").

### BUG-015: GRN-2026-00046 Has Supplier "PO-01"
PO number entered in supplier field — no validation.

### BUG-016: No Search/Filter on GRN List
Status filter buttons exist but no text search for GRN number, supplier, or date range.

### BUG-017: Blank Session Creates Unlinked GRN
"+ Blank Session" creates GRN without linking to a PO — orphaned GRNs possible.

---

## 🟢 LOW ISSUES (5)

### BUG-018: Inconsistent Status Casing
Statuses use lowercase (`open`, `receiving`) while spec uses UPPERCASE (`DRAFT`, `RECEIVING`).

### BUG-019: Supplier Name "PO-01" Suggests Missing Validation
No dropdown/search validation on supplier field.

### BUG-020: Date Picker Has Show Button But No Clear Label
"Show local date and time picker" button exists but fields are spinbuttons.

### BUG-021: No Breadcrumb Navigation
No breadcrumb trail showing Home > Inward > GRN > [GRN Number].

### BUG-022: GRN List Shows 25+ Entries Without Pagination
All entries shown at once — no pagination or virtual scrolling.

---

## Summary Table

| Severity | Count | Issues |
|----------|-------|--------|
| 🔴 Critical | 5 | BUG-001 to BUG-005 |
| 🟠 High | 5 | BUG-006 to BUG-010 |
| 🟡 Medium | 7 | BUG-011 to BUG-017 |
| 🟢 Low | 5 | BUG-018 to BUG-022 |
| **Total** | **22** | |

---

## Recommendations

1. **Immediate:** Fix duplicate mode selectors (BUG-001)
2. **Immediate:** Auto-populate date/time fields (BUG-002)
3. **Immediate:** Align status values with spec (BUG-003)
4. **Immediate:** Add supplier validation (BUG-004, BUG-015)
5. **High Priority:** Fix navigation routing (BUG-005)
6. **High Priority:** Implement workflow progress bar (BUG-009)
7. **High Priority:** Add GRN tabs per spec (BUG-010)
8. **Medium:** Clean up test data (BUG-007)
9. **Medium:** Remove Putaway button from receiving page (BUG-014)
10. **Low:** Add search/filter to GRN list (BUG-016)
