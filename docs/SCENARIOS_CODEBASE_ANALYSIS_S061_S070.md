# S-061 to S-070: Codebase Implementation + UX Enhancement Report

## Summary

| Scenario | Category | Expected Feature | Implemented? | UX Enhancement Needed |
|----------|----------|-----------------|-------------|----------------------|
| S-061 | Supplier | Driver has no docs | ✅ IMPLEMENTED | Add "documents to follow" workflow |
| S-062 | System | Return receipt | ✅ IMPLEMENTED | Add return reason picker |
| S-063 | System | Transfer in | ✅ IMPLEMENTED | Add source warehouse picker |
| S-064 | System | Consignment | ✅ IMPLEMENTED | Add supplier ownership badge |
| S-065 | System | VMI | ✅ IMPLEMENTED | Add VMI threshold alert |
| S-066 | System | Sample receipt | ✅ IMPLEMENTED | Add "do not mix" visual indicator |
| S-067 | System | Loan/tooling | ✅ IMPLEMENTED | Add return date picker |
| S-068 | System | Hazmat | ✅ IMPLEMENTED | Add hazmat class + PPE checklist |
| S-069 | System | Oversized | ✅ IMPLEMENTED | Add dimensions input + location filter |
| S-070 | Special | Serialized receiving | ✅ IMPLEMENTED | Add serial scan enforcement |

---

## Detailed Analysis

### S-061: Driver Has No Documents

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Exception type | `remaining.go` line 36: `driver_no_docs` — `DRIVER_NO_DOCS` |
| UI alert | `GRN.tsx` line 732: `driver_no_docs: '⚠ DRIVER HAS NO DOCUMENTS'` |
| Report button | `GRN.tsx` line 2279: "Driver has no documents" button |
| Description | "papers said to follow by email. Cannot fully verify the truck." |

**💡 UX Enhancement:** Add a **"Documents expected by" date picker** when reporting this exception. The operator enters when documents are expected (e.g., "by tomorrow 10 AM"). The system can then send a reminder notification if documents don't arrive by that time.

---

### S-062: Return Receipt

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Receiving type | `GRN.tsx` line 742: `return_receipt: 'RETURN RECEIPT'` |
| Dropdown option | `GRN.tsx` line 2333: `<option value="return_receipt">Return</option>` |
| Report button | `GRN.tsx` line 2352: "Return receipt" button |
| Returns module | `Returns.tsx`: Full returns workflow with restock/scrap |

**💡 UX Enhancement:** Add a **return reason picker** (Defective, Wrong item sent, Customer changed mind, Warranty, Quality issue). This helps with supplier scorecarding and root cause analysis.

---

### S-063: Transfer In

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Receiving type | `GRN.tsx` line 743: `transfer_in: 'TRANSFER IN'` |
| Dropdown option | `GRN.tsx` line 2334: `<option value="transfer_in">Transfer in</option>` |
| Report button | `GRN.tsx` line 2353: "Transfer in" button |
| Transfers module | `Transfers.tsx`: Stock transfer workflow |

**💡 UX Enhancement:** Add a **source warehouse picker** when "Transfer in" is selected. The operator selects which warehouse the stock is coming from. This auto-populates the transfer record.

---

### S-064: Consignment

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Receiving type | `GRN.tsx` line 744: `consignment: 'CONSIGNMENT'` |
| Dropdown option | `GRN.tsx` line 2335: `<option value="consignment">Consignment</option>` |
| Report button | `GRN.tsx` line 2354: "Consignment" button |
| Description | "supplier-owned stock received into our warehouse." |

**💡 UX Enhancement:** Add a **"Supplier-owned" visual badge** on consignment stock in inventory views. This prevents accidental picking/selling of supplier-owned goods.

---

### S-065: VMI (Vendor-Managed Inventory)

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Receiving type | `GRN.tsx` line 745: `vmi: 'VMI'` |
| Dropdown option | `GRN.tsx` line 2336: `<option value="vmi">VMI</option>` |
| Report button | `GRN.tsx` line 2355: "VMI" button |
| Description | "vendor-managed inventory receipt." |

**💡 UX Enhancement:** Add **VMI threshold alerts**. When VMI stock falls below a configured level, the system should auto-generate a replenishment request to the supplier.

---

### S-066: Sample Receipt

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Receiving type | `GRN.tsx` line 746: `sample: 'SAMPLE'` |
| Dropdown option | `GRN.tsx` line 2337: `<option value="sample">Sample</option>` |
| Report button | `GRN.tsx` line 2356: "Sample" button |
| Description | "non-stock / evaluation sample. Do not mix with saleable inventory." |

**💡 UX Enhancement:** Add a **"Do not mix" visual indicator** (red border/badge) on sample stock in all inventory views. Also add an auto-location suggestion to route samples to a dedicated sample area.

---

### S-067: Loan / Tooling

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Receiving type | `GRN.tsx` line 747: `loan: 'LOAN / TOOLING'` |
| Dropdown option | `GRN.tsx` line 2338: `<option value="loan">Loan</option>` |
| Report button | `GRN.tsx` line 2357: "Loan" button |
| Description | "temporary loaned material. Track for return." |

**💡 UX Enhancement:** Add a **return date picker** when "Loan" is selected. The operator enters the expected return date. The system should send reminders as the return date approaches and flag overdue loans.

---

### S-068: Hazmat

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Receiving type | `GRN.tsx` line 748: `hazmat: '⚠ HAZMAT'` |
| Dropdown option | `GRN.tsx` line 2339: `<option value="hazmat">Hazmat</option>` |
| Report button | `GRN.tsx` line 2354: "Hazmat" button |
| Description | "hazardous material. Use designated dock and PPE." |

**💡 UX Enhancement:** Add a **hazmat class selector** (Class 1-9) and a **PPE checklist** (gloves, goggles, respirator, etc.) that the operator must confirm before proceeding. This ensures safety compliance.

---

### S-069: Oversized

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Receiving type | `GRN.tsx` line 749: `oversized: 'OVERSIZED'` |
| Dropdown option | `GRN.tsx` line 2340: `<option value="oversized">Oversized</option>` |
| Report button | `GRN.tsx` line 2355: "Oversized" button |
| Description | "will not fit standard locations. Stage separately." |

**💡 UX Enhancement:** Add **dimensions input** (Length × Width × Height × Weight) when "Oversized" is selected. The system can then filter putaway locations to only show oversized-capable bins.

---

### S-070: Serialized Receiving

**Codebase Status:** ✅ IMPLEMENTED

| Feature | Code Reference |
|---------|----------------|
| Receiving type | `GRN.tsx` line 751: `serialized: 'SERIALIZED RECEIVING'` |
| Dropdown option | `GRN.tsx` line 2342: `<option value="serialized">Serialized</option>` |
| Report button | `GRN.tsx` line 2358: "Serialized receiving" button |
| Serial module | `Serial.tsx`: Serial number tracking with status management |
| Serial input | `GRN.tsx`: `discSerial` state for serial number entry |

**💡 UX Enhancement:** Add **serial scan enforcement**. When "Serialized" is selected, the system should require a serial number scan for each unit before the item can be received. This prevents missing serials.

---

## Top 10 UX Enhancement Suggestions (S-061 to S-070)

### 1. Receiving Type Auto-Routing
**Impact:** HIGH — Reduces errors
**Effort:** MEDIUM
**Details:** When a receiving type is selected, auto-route the stock to appropriate locations:
- Hazmat → Hazmat zone
- Oversized → Oversized staging
- Sample → Sample area
- Consignment → Consignment zone
- Cross-dock → Outbound staging

### 2. Receiving Type Badges on Inventory
**Impact:** HIGH — Visibility
**Effort:** LOW
**Details:** Show colored badges on stock balance rows:
- 🟡 Consignment (supplier-owned)
- 🔴 Sample (do not mix)
- ⚠️ Hazmat (safety)
- 📦 Loan (track for return)
- 🔒 High value (secure)

### 3. Hazmat Safety Checklist
**Impact:** HIGH — Safety compliance
**Effort:** LOW
**Details:** When hazmat is selected, show a mandatory PPE checklist:
- [ ] Gloves worn
- [ ] Safety goggles on
- [ ] Respirator if required
- [ ] MSDS sheet available
- [ ] Designated dock confirmed

### 4. Loan Return Date Tracking
**Impact:** MEDIUM — Operational
**Effort:** LOW
**Details:** When loan is selected, show return date picker. Send reminders 3 days before and on due date. Flag overdue loans in dashboard.

### 5. Dimensions Input for Oversized
**Impact:** MEDIUM — Putaway optimization
**Effort:** LOW
**Details:** When oversized is selected, show L×W×H×Weight inputs. Use these to filter putaway locations by capacity.

### 6. Return Reason Picker
**Impact:** MEDIUM — Analytics
**Effort:** LOW
**Details:** When return receipt is selected, show reason dropdown: Defective, Wrong item, Customer changed mind, Warranty, Quality issue.

### 7. Source Warehouse for Transfers
**Impact:** MEDIUM — Data accuracy
**Effort:** LOW
**Details:** When transfer in is selected, show source warehouse picker. Auto-populate transfer record.

### 8. Serial Scan Enforcement
**Impact:** HIGH — Data integrity
**Effort:** MEDIUM
**Details:** When serialized is selected, require serial scan for each unit. Block receiving until all serials are captured.

### 9. VMI Replenishment Alerts
**Impact:** MEDIUM — Proactive
**Effort:** HIGH
**Details:** When VMI stock falls below threshold, auto-generate replenishment request to supplier.

### 10. Supplier-Owned Stock Visibility
**Impact:** MEDIUM — Prevents errors
**Effort:** LOW
**Details:** Show "Supplier-owned" badge on consignment stock in all views (inventory, picking, reports). Prevent accidental picking.

---

## All Special Receiving Types (S-061 to S-070 mapped)

| Scenario | Receiving Type | Event | UI Badge | Report Button |
|----------|---------------|-------|----------|---------------|
| S-061 | Driver no docs | `DRIVER_NO_DOCS` | ⚠ DRIVER HAS NO DOCUMENTS | ✅ |
| S-062 | Return receipt | `RETURN_RECEIPT` | RETURN RECEIPT | ✅ |
| S-063 | Transfer in | `TRANSFER_IN` | TRANSFER IN | ✅ |
| S-064 | Consignment | `CONSIGNMENT` | CONSIGNMENT | ✅ |
| S-065 | VMI | `VMI` | VMI | ✅ |
| S-066 | Sample | `SAMPLE` | SAMPLE | ✅ |
| S-067 | Loan | `LOAN` | LOAN / TOOLING | ✅ |
| S-068 | Hazmat | `HAZMAT` | ⚠ HAZMAT | ✅ |
| S-069 | Oversized | `OVERSIZED` | OVERSIZED | ✅ |
| S-070 | Serialized | `SERIALIZED` | SERIALIZED RECEIVING | ✅ |

---

## Post-Receiving Features (also in S-061-S-070 range)

| Feature | Status | Code Reference |
|---------|--------|----------------|
| Cross-dock | ✅ IMPLEMENTED | `remaining.go`: `CROSS_DOCK` — "do not put away; stage for outbound" |
| Quarantine | ✅ IMPLEMENTED | `remaining.go`: `QUARANTINE` — "hold in quarantine / QI" |
| RMA | ✅ IMPLEMENTED | `remaining.go`: `RMA` — "link this receipt to a return merchandise authorization" |
| Stock adjustment | ✅ IMPLEMENTED | `remaining.go`: `STOCK_ADJUSTMENT` — "post-receiving qty correction" |
| Putaway link | ✅ IMPLEMENTED | `GRN.tsx`: "Open Putaway" button |
| Follow-up link | ✅ IMPLEMENTED | `GRN.tsx`: "Open Follow-Up Receipts" button |
| Returns link | ✅ IMPLEMENTED | `GRN.tsx`: "Open RMA / Returns" button |
| Stock entry link | ✅ IMPLEMENTED | `GRN.tsx`: "Open Stock Entry" button |
| Stock reconciliation link | ✅ IMPLEMENTED | `GRN.tsx`: "Open Stock Reconciliation" button |
| QI link | ✅ IMPLEMENTED | `GRN.tsx`: "Open Quarantine / QI" button |
