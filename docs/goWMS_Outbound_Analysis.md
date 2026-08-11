# goWMS Outbound Feature — QA Analysis & Recommendations

**Application:** goWMS (Warehouse Management Desk)  
**URL:** http://35.200.249.129:8080/  
**Business Context:** Spare parts warehouse, ₹20 Cr turnover  
**Date:** 2026-08-11  

---

## Executive Summary

goWMS is a clean, well-structured WMS with a logical flow inspired by ERPNext but simplified for warehouse-floor use. The outbound pipeline (Picking → Packing → Dispatch → Delivery Note) has a solid foundation but has **significant gaps** that will block real-world operations at ₹20Cr scale. Below is a detailed breakdown.

---

## Current Outbound Flow

```
Sales Order → Pick List → Packing (Box) → Dispatch (Trip) → Delivery Note
```

### What Works Well ✅

| Feature | Assessment |
|---------|-----------|
| Clean sidebar navigation | Logical grouping (Stock / Buying / Selling / Masters) |
| FEFO allocation on Pick List | Good for spare parts with expiry/shelf-life |
| Scan support at each stage | Barcode/QR scanning buttons present |
| Box-based packing model | Practical for shipment management |
| Trip-based dispatch | Vehicle + Driver tracking is useful |
| Dashboard shortcuts | Quick-access cards for common actions |
| Analytics module | Fast/slow/dead stock classification |

---

## Critical Shortcomings & Fixes

### 🔴 CRITICAL — Will Block Operations

#### 1. No Sales Order Integration
**Problem:** Pick List asks for "Sales Order No" but there's no Sales Order module in the system. The Selling section only has Delivery Note and Customer — no Sales Order creation.

**Impact:** Users can't create pick lists because there are no sales orders to pick against. The outbound flow is broken at step 1.

**Fix:**
- Add a **Sales Order** module under SELLING (or integrate with ERPNext API if that's the backend)
- Sales Order should: link to Customer, list items + quantities, track status (Draft → Confirmed → Partially Picked → Fulfilled)
- Pick List should auto-populate from Sales Order lines

#### 2. No Warehouse Configured
**Problem:** The Warehouses module shows "All Warehouses (0)" — zero warehouses set up. Locations page says "No locations — add them under Warehouses."

**Impact:** Can't assign stock to locations, can't do FEFO allocation, can't do putaway. The entire warehouse operations backbone is missing.

**Fix:**
- Create at least one warehouse with aisle/shelf/level/bin structure
- For ₹20Cr spare parts: recommend zones (Fast-Moving, Slow-Moving, Heavy/Bulk, Hazardous)
- Pre-populate common spare parts bin naming: `A-01-02-03` (Aisle-Shelf-Level-Bin)

#### 3. No Stock on Hand
**Problem:** Dashboard shows "Total Stock Qty: 0". Three items exist (Brake Pad, Brake Pad Set, Filter Oil) but zero inventory.

**Impact:** Nothing to pick, pack, or ship. Can't test the full outbound flow.

**Fix:**
- Add a "Stock Opening Balance" entry mechanism (or import from ERPNext)
- Create at least 50-100 sample stock entries across locations to simulate real operations

#### 4. Delivery Note Has No Create Flow
**Problem:** Delivery Notes page shows "All Delivery Notes (0)" with no "New" or "Create" button. It's read-only — can only view notes created elsewhere.

**Impact:** Users can't manually create delivery notes. If the auto-generation from Dispatch fails, there's no fallback.

**Fix:**
- Add "+ New Delivery Note" button
- Allow creation from: (a) Sales Order, (b) Pick List completion, (c) Manual entry
- DN should auto-populate items from the linked Pick List

---

### 🟠 HIGH — Will Cause Operational Pain

#### 5. No Pick List Status Workflow
**Problem:** Pick List table has a "Status" column but no visible workflow states. The Workflow module is empty (0 definitions).

**Impact:** No way to track: Draft → Allocated → Picking in Progress → Picked → Verified. Users won't know what's done vs. pending.

**Fix:**
- Define status flow: `Draft → Allocated → In Progress → Picked → Verified → Cancelled`
- Color-code statuses (Green = Done, Yellow = In Progress, Red = Overdue)
- Add status filters at the top of the list view

#### 6. No Batch/Serial Tracking in Picking
**Problem:** The system supports Batch and Serial No modules, but the Pick List form doesn't show batch/serial fields during picking.

**Impact:** For spare parts (especially high-value items like engine components), you need to track which specific batch/serial was picked. This is critical for recalls and warranty claims.

**Fix:**
- Add batch/serial selection in the pick line items
- Auto-suggest FEFO batch based on expiry date
- For serialized items, require scan of serial number during pick

#### 7. No Pick List Print/Pick Slip
**Problem:** No print or export option visible on the Pick List page.

**Impact:** Warehouse pickers often work with paper pick slips (especially in Indian warehouses where handheld devices are limited). No print = can't dispatch work to floor staff.

**Fix:**
- Add "Print Pick Slip" button (PDF generation)
- Pick slip should include: Pick List ID, Customer, Item list with bin locations, quantities, barcode for scanning
- Support thermal printer format (4x6 inch)

#### 8. No Wave/Batch Picking
**Problem:** Pick lists are created one-at-a-time from individual sales orders.

**Impact:** At ₹20Cr with multiple orders per day, creating individual picks is inefficient. Wave picking (combining multiple orders into one pick run) saves 30-50% travel time in warehouses.

**Fix:**
- Add "Wave Pick" option: select multiple pending orders → generate optimized pick path
- Group picks by zone/aisle to minimize travel
- Show estimated pick time based on bin locations

#### 9. Dispatch Has No Delivery Schedule
**Problem:** Dispatch only captures Vehicle No and Driver Name. No delivery date, route, or destination.

**Impact:** Can't plan deliveries, can't track if shipments are on time, can't optimize routes.

**Fix:**
- Add fields: Delivery Date, Route/Zone, Destination (auto-fill from Customer address)
- Add trip status: Scheduled → Loading → In Transit → Delivered → Completed
- Optional: Google Maps integration for route optimization

---

### 🟡 MEDIUM — Will Limit Growth

#### 10. No Outbound Analytics
**Problem:** Analytics module focuses on inventory health (fast/slow/dead stock, expiry). No outbound metrics.

**Impact:** Can't measure warehouse performance — no visibility into pick rates, packing efficiency, dispatch SLA compliance.

**Fix — Add these KPIs:**
- **Order Fulfillment Rate** (% orders shipped on time)
- **Pick Accuracy** (% picks without errors)
- **Average Pick Time** (per item/order)
- **Packing Throughput** (boxes/hour)
- **Dispatch SLA** (% trips leaving on schedule)
- **Return Rate** (% shipments returned)

#### 11. No Backorder Management
**Problem:** Dashboard shows "Pending Backorders: 0" but there's no backorder module or flow.

**Impact:** When stock is insufficient for a sales order, there's no mechanism to partial-pick and backorder the remaining items.

**Fix:**
- When pick quantity > available stock, auto-create backorder for remaining
- Show backorder aging and priority
- Alert when backordered stock arrives via GRN

#### 12. No Returns/Reverse Logistics
**Problem:** No returns module exists.

**Impact:** Spare parts warehouses deal with significant returns (wrong part, warranty claims, damaged goods). Without a returns flow, these get lost.

**Fix:**
- Add "Returns" module under SELLING
- Flow: Return Request → Inspection (QC) → Restock / Scrap / Return to Supplier
- Link returns to original Delivery Note

#### 13. No Quality Check in Outbound
**Problem:** Quality Inspection module exists but only seems linked to inbound (GRN). No outbound QC.

**Impact:** High-value spare parts should be verified before shipping (correct part, condition, packaging). No QC = more returns.

**Fix:**
- Add optional QC step between Packing and Dispatch
- QC checklist: Part number match, visual inspection, packaging integrity
- Block dispatch if QC fails

#### 14. No Multi-User Role Support Visible
**Problem:** Only "Admin" user visible. No role-based access (Picker, Packer, Dispatch Manager, Supervisor).

**Impact:** At ₹20Cr scale with 5-15 warehouse staff, you need role separation. A picker shouldn't be able to approve dispatches.

**Fix:**
- Add roles: Admin, Supervisor, Picker, Packer, Dispatch Operator, Viewer
- Each role sees only relevant modules/actions
- Audit trail for who did what

---

### 🟢 LOW — Nice to Have

#### 15. No Mobile-Optimized View
**Problem:** The UI is desktop-oriented. Scanning buttons exist but the layout doesn't look mobile-friendly.

**Impact:** Warehouse staff using phones/tablets for scanning will struggle.

**Fix:** Responsive design or dedicated mobile view for scan-heavy workflows.

#### 16. No Notifications for Outbound Events
**Problem:** Notifications module is empty. No alerts for: new pick assigned, packing complete, dispatch delay.

**Fix:** Push/SMS/email notifications for key events.

#### 17. No Integration Endpoints Visible
**Problem:** No API documentation or integration settings visible.

**Impact:** For ₹20Cr, you likely need to integrate with: accounting software (Tally/Zoho), e-commerce platforms, courier APIs (Delhivery/BlueDart).

**Fix:** REST API documentation, webhook support for status changes.

#### 18. Workflow Module Unused
**Problem:** Workflow module exists but has 0 definitions. It's a powerful feature sitting idle.

**Fix:** Pre-configure workflows for: Pick List approval, Dispatch authorization, Return processing.

---

## Recommended Implementation Priority

### Phase 1 — Fix the Foundation (Week 1-2)
1. ✅ Set up warehouse with bin locations
2. ✅ Add opening stock balances
3. ✅ Create Sales Order module
4. ✅ Enable Delivery Note creation
5. ✅ Add pick list status workflow

### Phase 2 — Operational Ready (Week 3-4)
6. ✅ Batch/serial tracking in picking
7. ✅ Pick slip printing
8. ✅ Outbound analytics dashboard
9. ✅ User roles and permissions

### Phase 3 — Scale & Optimize (Month 2)
10. ✅ Wave/batch picking
11. ✅ Backorder management
12. ✅ Returns module
13. ✅ Outbound QC step

### Phase 4 — Integration (Month 3)
14. ✅ API documentation
15. ✅ Courier integration
16. ✅ Accounting integration
17. ✅ Mobile optimization

---

## Comparison: Inbound vs Outbound Feature Maturity

| Feature | Inbound (GRN) | Outbound (Pick/Ship) | Gap |
|---------|--------------|---------------------|-----|
| Document flow | PO → GRN → Putaway ✅ | SO → Pick → Pack → Ship ⚠️ | Sales Order missing |
| Status tracking | Open/Closed ✅ | No visible statuses ❌ | Critical gap |
| Scan support | Yes ✅ | Yes ✅ | Par |
| Print/export | Not visible ⚠️ | Not visible ⚠️ | Both need work |
| Reports | GRN Summary ✅ | Pick Performance (0) ⚠️ | Need more outbound reports |
| Analytics | Inbound-focused ⚠️ | No outbound KPIs ❌ | Critical gap |

---

## Bottom Line

The **inbound side** (GRN/Putaway) is significantly more mature than outbound. For a ₹20Cr spare parts warehouse, the outbound flow needs:

1. **A complete Sales Order → Delivery pipeline** (currently broken at step 1)
2. **Status tracking and workflow** (invisible progress = chaos on the floor)
3. **Batch/serial picking** (non-negotiable for spare parts)
4. **Print capability** (Indian warehouses still run on paper)
5. **Outbound analytics** (you can't improve what you don't measure)

The foundation is solid — the architecture, navigation, and scan-first approach are good. It needs the outbound features filled in to match the inbound maturity.
