# SPEC 03 — Outbound Operations (Sales Order, Picking, Packing, Dispatch, Delivery)

> **For coding agent.** This spec covers the complete outbound flow from receiving a sales order to dispatching goods to customers. Includes priority queue for fulfillment. Designed for simplicity — a warehouse person with minimal tech skills should be able to operate this with a phone/tablet.

---

## ASSUMPTIONS

1. **Sales Orders** can be created manually, imported from CSV/Excel, or received via API
2. **Priority queue** (1-10) determines fulfillment order — higher priority ships first
3. **Picking is list-based** — system generates pick lists from orders, picker follows the list
4. **Packing is box-based** — items packed into boxes, each box gets a label
5. **Dispatch is trip-based** — boxes loaded onto vehicles, trip tracked
6. **Delivery Note** auto-generated from dispatch, can be printed/shared
7. **Partial fulfillment** allowed — ship what's available, backorder the rest
8. **Returns** handled as a separate flow (covered at end of this spec)
9. **Barcode scanning** supported at every stage but not mandatory
10. **Pick list can be printed** on paper for floor workers without devices
11. **Batch/Serial tracking** in picking for items configured with batch/serial control
12. **One person can do Pick + Pack** in a small warehouse

---

## 1. OUTBOUND FLOW OVERVIEW

```
Sales Order Received
    │
    ▼
┌─────────────────┐
│  1. Sales Order  │  ← Create/import order, set priority
│     Management   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. Pick List    │  ← Generate pick list from order(s), assign to picker
│     Generation   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. Picking      │  ← Picker follows list, scans items from bins
│     (Floor Work) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. Packing      │  ← Pack items into boxes, print labels
│     (Packing Stn)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. Dispatch     │  ← Load boxes onto vehicle, create trip
│     (Loading)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. Delivery     │  ← Track delivery, confirm receipt
│     Tracking     │
└────────┬────────┘
         │
         ▼
    Order Fulfilled ✅
```

---

## 2. SALES ORDER

### 2.1 Sales Order Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `so_no` | text | Auto | SO-YYYY-NNNNN |
| `customer_id` | FK | Yes | Customer |
| `customer_name` | text | Auto | Denormalized for display |
| `delivery_address` | text | Yes | Ship-to address |
| `delivery_date` | date | Yes | Expected delivery date |
| `priority` | int | Yes | 1-10 (10 = highest) |
| `priority_label` | text | Auto | Emergency/Critical/Urgent/High/Elevated/Normal+/Normal/Low/Bulk/Background |
| `priority_reason` | text | No | Why this priority |
| `priority_set_by` | FK | Auto | Who set the priority |
| `priority_set_at` | datetime | Auto | |
| `subtotal` | decimal | Auto | Sum of line totals |
| `tax_amount` | decimal | Auto | GST |
| `total` | decimal | Auto | |
| `payment_status` | enum | Auto | `unpaid`, `partial`, `paid` |
| `status` | enum | Auto | `draft`, `confirmed`, `picking`, `packed`, `dispatched`, `delivered`, `cancelled`, `closed` |
| `fulfillment_pct` | decimal | Auto | % of items shipped |
| `notes` | text | No | |
| `created_by` | FK | Auto | |
| `created_at` | datetime | Auto | |
| `updated_at` | datetime | Auto | |

### 2.2 Sales Order Lines

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `so_id` | FK | Yes | Parent SO |
| `item_id` | FK | Yes | Item |
| `part_code` | text | Auto | |
| `part_name` | text | Auto | |
| `qty_ordered` | int | Yes | Ordered quantity |
| `qty_allocated` | int | Auto | Reserved from stock |
| `qty_picked` | int | Auto | Actually picked |
| `qty_packed` | int | Auto | Packed |
| `qty_shipped` | int | Auto | Shipped |
| `qty_cancelled` | int | Auto | |
| `unit_price` | decimal | Yes | |
| `tax_rate` | decimal | Auto | |
| `line_total` | decimal | Auto | |
| `batch_id` | FK | No | If batch-tracked |
| `serial_nos` | text[] | No | If serial-tracked |
| `status` | enum | Auto | `pending`, `allocated`, `picked`, `packed`, `shipped`, `cancelled` |

### 2.3 Priority Model

| Priority | Label | Color | SLA |
|----------|-------|-------|-----|
| 10 | 🔴 Emergency | Red | 2 hours |
| 9 | 🔴 Critical | Red | 4 hours |
| 8 | 🟠 Urgent | Orange | Same day |
| 7 | 🟠 High | Orange | Same day |
| 6 | 🟡 Elevated | Yellow | Next day AM |
| 5 | 🟡 Normal+ | Yellow | Next day |
| 4 | ⚪ Normal | Grey | 2 days |
| 3 | ⚪ Low | Grey | 3 days |
| 2 | ⚪ Bulk/Low | Grey | 5 days |
| 1 | ⚪ Background | Grey | Best effort |

### 2.4 Auto-Priority Rules (Configurable)

```yaml
rules:
  - name: "Key Account Rush"
    condition: "customer.type == 'key_account' AND delivery_within(1d)"
    priority: 9

  - name: "High Value"
    condition: "order_value > 50000"
    priority: 7

  - name: "Dealer Stockout"
    condition: "customer.type == 'dealer' AND tags contains 'stockout'"
    priority: 9

  - name: "Same Day"
    condition: "delivery_date == today"
    priority: 8

  - name: "Default"
    condition: "true"
    priority: 4
```

### 2.5 Sales Order Import

CSV/Excel format:
```csv
so_number,customer_code,delivery_address,delivery_date,priority,item_code,qty,unit_price
SO-001,0000016105,"Plot 12, Waluj MIDC",2026-08-15,8,BRAKE-PAD-001,10,450
SO-001,0000016105,"Plot 12, Waluj MIDC",2026-08-15,8,FILTER-OIL-002,50,120
SO-002,CUST-002,"Shop 5, Pune",2026-08-20,4,JF402006,2,8500
```

Multiple lines with same SO number = multiple items in one order.
If priority column empty → auto-assign from rules.

### 2.6 Sales Order UI

```
┌─ Sales Orders ──────────────────────────────────────────────────────────┐
│                                                                          │
│  [+ New Order]  [📥 Import]  [📤 Export]                               │
│                                                                          │
│  Filter: [Status ▾] [Priority ▾] [Customer ▾] [Date ▾]                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Pri │ SO No        │ Customer       │ Items │ Value    │ Status  │   │
│  ├─────┼──────────────┼────────────────┼───────┼──────────┼─────────┤   │
│  │ 🔴8 │ SO-2026-0005 │ Ganju Auto     │   3   │ ₹45,000  │ Conf    │   │
│  │ 🟠7 │ SO-2026-0004 │ Raj Parts      │   5   │ ₹72,000  │ Conf    │   │
│  │ ⚪4 │ SO-2026-0003 │ Sharma & Co    │   2   │ ₹8,000   │ Draft   │   │
│  │ ⚪3 │ SO-2026-0002 │ Internal       │   1   │ ₹2,200   │ Picking │   │
│  └─────┴──────────────┴────────────────┴───────┴──────────┴─────────┘   │
│                                                                          │
│  Total: 4 orders  |  🔴 1  🟠 1  ⚪ 2                                 │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.7 Sales Order Detail

```
┌─ Sales Order: SO-2026-0005 ─────────────────────────────────────────────┐
│                                                                          │
│  Customer: Ganju Automotives        Priority: 🔴 8 — Urgent            │
│  Delivery Date: 12/08/2026          Status: Confirmed                   │
│  Address: Plot 12, Waluj MIDC, Aurangabad                              │
│                                                                          │
│  ┌─ Line Items ──────────────────────────────────────────────────────┐  │
│  │ Part Code    │ Part Name           │ Qty │ Picked │ Status        │  │
│  ├──────────────┼─────────────────────┼─────┼────────┼───────────────┤  │
│  │ BRAKE-PAD-001│ Brake Pad Set       │  10 │   0    │ ⬜ Pending    │  │
│  │ FILTER-OIL   │ Oil Filter          │  50 │   0    │ ⬜ Pending    │  │
│  │ JF402006     │ Unit Regulator      │   2 │   0    │ ⬜ Pending    │  │
│  └──────────────┴─────────────────────┴─────┴────────┴───────────────┘  │
│                                                                          │
│  Total: ₹45,000  |  Fulfillment: 0%                                    │
│                                                                          │
│  [Edit]  [Cancel Order]  [Generate Pick List →]  [Print]               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. PICK LIST GENERATION

### 3.1 Generation Methods

**Method A: Single Order Pick**
- One pick list per sales order
- Simple, good for large orders

**Method B: Batch Pick (Wave Pick)**
- Multiple orders combined into one pick list
- Picker picks items for 3-5 orders in one trip
- Reduces walking time by 30-50%

**Method C: Priority-Based Auto-Generate**
- System picks the highest priority pending orders
- Generates pick lists automatically
- Respects picker capacity

### 3.2 Pick List Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pick_no` | text | Auto | PICK-YYYY-NNNNN |
| `so_ids` | FK[] | Yes | Linked sales orders |
| `warehouse_id` | FK | Yes | |
| `priority` | int | Auto | Highest priority among linked SOs |
| `assigned_to` | FK | No | Assigned picker |
| `status` | enum | Auto | `draft`, `allocated`, `picking`, `picked`, `verified`, `cancelled` |
| `pick_mode` | enum | Auto | `single`, `batch` |
| `total_items` | int | Auto | |
| `total_picked` | int | Auto | |
| `completion_pct` | decimal | Auto | |
| `started_at` | datetime | Auto | |
| `completed_at` | datetime | Auto | |
| `notes` | text | No | |

### 3.3 Pick List Lines

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pick_id` | FK | Yes | Parent pick list |
| `so_line_id` | FK | Yes | Link to SO line |
| `item_id` | FK | Yes | |
| `part_code` | text | Auto | |
| `part_name` | text | Auto | |
| `location_id` | FK | Yes | Bin to pick from |
| `location_code` | text | Auto | |
| `qty_to_pick` | int | Yes | |
| `qty_picked` | int | Auto | |
| `batch_id` | FK | No | If batch-tracked |
| `serial_nos` | text[] | No | If serial-tracked |
| `pick_sequence` | int | Auto | Optimized walking order |
| `status` | enum | Auto | `pending`, `picked`, `short`, `skipped` |
| `notes` | text | No | |

### 3.4 Pick Sequence Optimization

When generating pick lists, system optimizes walking order:
1. Group by aisle
2. Within aisle, sort by bay/bin number
3. Minimize backtracking

```
Unoptimized: A1-B3 → A5-B1 → A1-B1 → A5-B3
Optimized:   A1-B1 → A1-B3 → A5-B1 → A5-B3
```

### 3.5 Pick List Generation UI

```
┌─ Generate Pick Lists ───────────────────────────────────────────────────┐
│                                                                          │
│  Method: [ Priority Queue ▾ ]                                          │
│                                                                          │
│  ┌─ Pending Orders (Priority Sorted) ────────────────────────────────┐  │
│  │                                                                    │  │
│  │  ☑ 🔴 8  SO-0005  Ganju Auto    3 items  ₹45,000  Due: Today    │  │
│  │  ☑ 🟠 7  SO-0004  Raj Parts     5 items  ₹72,000  Due: Today    │  │
│  │  ☐ ⚪ 4  SO-0003  Sharma & Co   2 items  ₹8,000   Due: 15/08   │  │
│  │  ☐ ⚪ 3  SO-0002  Internal      1 item   ₹2,200   Due: 20/08   │  │
│  │                                                                    │  │
│  │  ☑ Auto-select orders with priority ≥ [ 6 ▾ ]                    │  │
│  │  ☑ Group picks by zone (optimize walking path)                   │  │
│  │  ☐ Assign to picker: [ ▾ ]                                       │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Selected: 2 orders → 8 items → Estimated: 1 pick list, ~20 min       │
│                                                                          │
│  [Cancel]  [Preview]  [Generate Pick Lists]                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. PICKING (Floor Work)

### 4.1 Picking UI (Mobile/Tablet — Big Buttons, Easy to Use)

```
┌─ Pick List: PICK-2026-0001 ─────────────────────────────────────────────┐
│                                                                          │
│  🔴 Priority: 8 — Urgent    SO: SO-0005 (Ganju Auto)                  │
│  Progress: ████████░░ 80%    4/5 items picked                          │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                                                                    │   │
│  │  CURRENT ITEM                                                      │   │
│  │  ┌────────────────────────────────────────────────────────────┐   │   │
│  │  │                                                            │   │   │
│  │  │  📍 Go to: A2-B1-LA-01                                     │   │   │
│  │  │                                                            │   │   │
│  │  │  Part: BRAKE PAD SET (JW131807)                            │   │   │
│  │  │  Qty to Pick: 10                                           │   │   │
│  │  │                                                            │   │   │
│  │  │  [📷 Scan Item]  [📷 Scan Bin]                             │   │   │
│  │  │                                                            │   │   │
│  │  │  ┌──────────────┐                                          │   │   │
│  │  │  │              │                                          │   │   │
│  │  │  │   10         │  ← Tap +/- or type qty                  │   │   │
│  │  │  │              │                                          │   │   │
│  │  │  └──────────────┘                                          │   │   │
│  │  │                                                            │   │   │
│  │  │  [ - ]  [ + ]  [ ← Skip ]  [ ✅ Confirm Pick ]            │   │   │
│  │  │                                                            │   │   │
│  │  └────────────────────────────────────────────────────────────┘   │   │
│  │                                                                    │   │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ Remaining Items ─────────────────────────────────────────────────┐  │
│  │  ✓ JW131807  Brake Pad Set      A2-B1-LA-01  10/10  ✅ Done     │  │
│  │  ✓ DH111015  Cap Spark Plug     A1-B3-LA-02  50/50  ✅ Done     │  │
│  │  ✓ 36JR0113  Kit Clutch Plate   A3-B2-LB-01  10/10  ✅ Done     │  │
│  │  ✓ JF402006  Unit Regulator     A1-B1-LA-01   2/2   ✅ Done     │  │
│  │  ○ FILTER    Oil Filter         A2-B2-LA-03  0/50   ⬜ Next     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  [← Previous]  [Next →]  [Report Issue]  [Complete Pick ✓]            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Short/Issue Reporting

```
┌─ Report Issue ──────────────────────────────────────────────────────────┐
│                                                                          │
│  Item: BRAKE PAD SET (JW131807)                                        │
│  Location: A2-B1-LA-01                                                  │
│  Expected: 10  |  Found: [ 7 ]                                         │
│                                                                          │
│  Issue Type:                                                            │
│  [ ⚠️ Short Stock ]  [ 📍 Wrong Location ]  [ 🔍 Damaged ]           │
│  [ ❌ Not Found ]    [ 📝 Other ]                                      │
│                                                                          │
│  Notes: [                                        ]                       │
│  📷 Photo: [Take Photo]                                                 │
│                                                                          │
│  Action:                                                                │
│  [ Pick Available (7) & Backorder Rest (3) ]                            │
│  [ Skip This Item ]                                                     │
│  [ Cancel Line ]                                                        │
│                                                                          │
│  [Cancel]  [Submit Report]                                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Batch/Serial Tracked Items

For items with `control_mode = 'batch'` or `'serial'`:

```
┌─ Pick: Oil Filter (Batch Tracked) ──────────────────────────────────────┐
│                                                                          │
│  📍 Location: A2-B2-LA-03                                              │
│  Qty to Pick: 50                                                        │
│                                                                          │
│  Available Batches:                                                     │
│  ┌──────────────┬─────────┬────────────┬────────────┐                  │
│  │ Batch        │ Qty Avail│ Mfg Date   │ Exp Date   │                  │
│  ├──────────────┼─────────┼────────────┼────────────┤                  │
│  │ BATCH-2024-01│    30   │ 15/01/2024 │ 15/01/2025 │ ← FEFO first   │
│  │ BATCH-2024-06│    25   │ 01/06/2024 │ 01/06/2025 │                  │
│  └──────────────┴─────────┴────────────┴────────────┘                  │
│                                                                          │
│  Pick from BATCH-2024-01: [ 30 ] (max available)                       │
│  Pick from BATCH-2024-06: [ 20 ] (remaining needed)                    │
│                                                                          │
│  Total: 50 ✅                                                          │
│                                                                          │
│  [Confirm Pick]                                                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. PACKING

### 5.1 Packing Process

```
After picking is complete:
  1. Items brought to packing station
  2. Packer creates a box (or scans existing box)
  3. Scans/enters items into the box
  4. System verifies: correct items, correct quantities
  5. Weighs box (optional)
  6. Prints box label
  7. Marks box as "Ready for Dispatch"
```

### 5.2 Box/Package Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `box_id` | text | Auto | BOX-YYYY-NNNNN |
| `label` | text | Yes | Box label (user-friendly name) |
| `pick_id` | FK | Yes | Linked pick list |
| `so_ids` | FK[] | Auto | Sales orders in this box |
| `delivery_note_id` | FK | Auto | Linked DN |
| `weight_kg` | decimal | No | Actual weight |
| `length_cm` | decimal | No | Dimensions |
| `width_cm` | decimal | No | |
| `height_cm` | decimal | No | |
| `item_count` | int | Auto | Number of distinct items |
| `total_qty` | int | Auto | Total quantity |
| `status` | enum | Auto | `open`, `packing`, `sealed`, `loaded`, `shipped` |
| `packed_by` | FK | Auto | Employee |
| `created_at` | datetime | Auto | |

### 5.3 Box Line Items

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `box_id` | FK | Yes | Parent box |
| `pick_line_id` | FK | Yes | Link to pick line |
| `item_id` | FK | Yes | |
| `qty_packed` | int | Yes | |
| `batch_id` | FK | No | |
| `serial_nos` | text[] | No | |

### 5.4 Packing UI

```
┌─ Packing Station ───────────────────────────────────────────────────────┐
│                                                                          │
│  Pick List: PICK-2026-0001  |  SO: SO-0005 (Ganju Auto)               │
│  Status: Picked ✅  |  Ready to Pack                                   │
│                                                                          │
│  ┌─ Create Box ──────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Box Label: [ AUTO ]  or  [ Type custom label ]                  │  │
│  │                                                                    │  │
│  │  [📷 Scan Box Barcode]  [+ Create Box]                           │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ Open Box: BOX-2026-0001 ─────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Items to Pack:                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐   │  │
│  │  │ Part Code    │ Part Name          │ Qty │ Packed │ Status  │   │  │
│  │  ├──────────────┼────────────────────┼─────┼────────┼─────────┤   │  │
│  │  │ JW131807     │ Brake Pad Set      │  10 │   10   │ ✅ Done │   │  │
│  │  │ DH111015     │ Cap Spark Plug     │  50 │   50   │ ✅ Done │   │  │
│  │  │ 36JR0113     │ Kit Clutch Plate   │  10 │    0   │ ⬜ Pack │   │  │
│  │  │ JF402006     │ Unit Regulator     │   2 │    0   │ ⬜ Pack │   │  │
│  │  │ FILTER       │ Oil Filter         │  50 │    0   │ ⬜ Pack │   │  │
│  │  └──────────────┴────────────────────┴─────┴────────┴─────────┘   │  │
│  │                                                                    │  │
│  │  [📷 Scan Item]  [Manual Entry]                                  │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Box Weight: [      ] kg  |  [Weigh on Scale]                          │
│  [Seal Box]  [Print Label]                                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.5 Box Label (Printed)

```
┌─────────────────────────────────────────┐
│  BOX-2026-0001                          │
│  ═══════════════════════════════════    │
│  Customer: Ganju Automotives            │
│  SO: SO-2026-0005                       │
│  ───────────────────────────────────    │
│  Contents:                              │
│  • Brake Pad Set (JW131807) x10        │
│  • Cap Spark Plug (DH111015) x50       │
│  • Kit Clutch Plate (36JR0113) x10     │
│  • Unit Regulator (JF402006) x2        │
│  • Oil Filter (FILTER) x50             │
│  ───────────────────────────────────    │
│  Weight: 12.5 kg                        │
│  Packed by: EMP-02 (Suresh)            │
│  Date: 11/08/2026                       │
│                                         │
│  [||||||||||||||||||]  ← Barcode        │
│                                         │
└─────────────────────────────────────────┘
```

---

## 6. DISPATCH

### 6.1 Dispatch Process

```
After packing:
  1. Create a Trip (vehicle + driver)
  2. Scan/load boxes onto the trip
  3. System verifies: all boxes for the order are loaded
  4. Generate Delivery Note
  5. Trip departs
  6. Track delivery status
```

### 6.2 Trip Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trip_no` | text | Auto | TRIP-YYYY-NNNNN |
| `vehicle_no` | text | Yes | Vehicle registration |
| `driver_name` | text | Yes | |
| `driver_phone` | text | No | |
| `route` | text | No | Route description |
| `delivery_date` | date | Yes | |
| `boxes` | FK[] | Auto | Boxes loaded |
| `total_boxes` | int | Auto | |
| `total_weight` | decimal | Auto | |
| `status` | enum | Auto | `created`, `loading`, `loaded`, `in_transit`, `delivered`, `completed` |
| `started_at` | datetime | Auto | |
| `delivered_at` | datetime | Auto | |
| `notes` | text | No | |

### 6.3 Dispatch UI

```
┌─ Dispatch ──────────────────────────────────────────────────────────────┐
│                                                                          │
│  [+ Create Trip]  [📷 Scan Box]                                        │
│                                                                          │
│  ┌─ Active Trips ────────────────────────────────────────────────────┐  │
│  │ Trip No       │ Vehicle    │ Driver  │ Boxes │ Status    │ Action │  │
│  ├───────────────┼────────────┼─────────┼───────┼───────────┼────────┤  │
│  │ TRIP-2026-001 │ MH-20-1234 │ Ramesh  │   5   │ 🟡 Loading│ [Open] │  │
│  │ TRIP-2026-002 │ MH-20-5678 │ Sunil   │   3   │ 🟢 Transit│ [Open] │  │
│  └───────────────┴────────────┴─────────┴───────┴───────────┴────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

```
┌─ Trip: TRIP-2026-0001 ──────────────────────────────────────────────────┐
│                                                                          │
│  Vehicle: MH-20-1234    Driver: Ramesh (9876543210)                    │
│  Delivery Date: 12/08/2026    Status: Loading                          │
│                                                                          │
│  ┌─ Boxes Loaded ────────────────────────────────────────────────────┐  │
│  │ Box ID        │ SO No      │ Customer    │ Items │ Weight │ Status│  │
│  ├───────────────┼────────────┼─────────────┼───────┼────────┼───────┤  │
│  │ BOX-2026-001  │ SO-0005    │ Ganju Auto  │   5   │ 12.5kg │ ✅    │  │
│  │ BOX-2026-002  │ SO-0005    │ Ganju Auto  │   3   │  8.2kg │ ✅    │  │
│  │ BOX-2026-003  │ SO-0004    │ Raj Parts   │   4   │ 15.0kg │ ✅    │  │
│  └───────────────┴────────────┴─────────────┴───────┴────────┴───────┘  │
│                                                                          │
│  [📷 Scan Box to Add]  [+ Add Manually]                                │
│                                                                          │
│  Total: 3 boxes  |  Weight: 35.7 kg                                    │
│                                                                          │
│  [Generate Delivery Note]  [Mark In Transit →]  [Print Trip Sheet]     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 7. DELIVERY NOTE

### 7.1 Delivery Note (Auto-generated from Trip)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                      DELIVERY NOTE                              │
│                      DN-2026-0001                               │
│                                                                 │
│  Customer: Ganju Automotives Pvt. Ltd.                         │
│  Address: Plot 12, Waluj MIDC, Aurangabad                      │
│  Phone: 9876543210                                              │
│                                                                 │
│  Date: 12/08/2026        Trip: TRIP-2026-0001                 │
│  Vehicle: MH-20-1234    Driver: Ramesh                         │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  S.No │ Part Code    │ Part Name          │ Qty │ Weight       │
│  ───────────────────────────────────────────────────────────    │
│  1    │ JW131807     │ Brake Pad Set      │  10 │ 1.62 kg      │
│  2    │ DH111015     │ Cap Spark Plug     │  50 │ 2.40 kg      │
│  3    │ 36JR0113     │ Kit Clutch Plate   │  10 │ 1.62 kg      │
│  4    │ JF402006     │ Unit Regulator     │   2 │ 0.63 kg      │
│  5    │ FILTER       │ Oil Filter         │  50 │ 5.00 kg      │
│  ───────────────────────────────────────────────────────────    │
│  Total Items: 122        Total Weight: 11.27 kg                │
│  Boxes: 2                                                        │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  Received by: _________________  Date: ____________             │
│  Signature: _________________   Stamp:                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Delivery Confirmation

```
┌─ Delivery Confirmation: DN-2026-0001 ────────────────────────────────────┐
│                                                                          │
│  Customer: Ganju Automotives    Status: In Transit                      │
│                                                                          │
│  ┌─ Confirm Delivery ────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Received by: [                              ]                     │  │
│  │  Phone:       [                              ]                     │  │
│  │  Signature:   [📷 Capture Signature]                               │  │
│  │  Photo:       [📷 Take Photo]                                      │  │
│  │                                                                    │  │
│  │  Condition:  [ ✅ All OK ]  [ ⚠️ Partial ]  [ ❌ Damaged ]        │  │
│  │                                                                    │  │
│  │  Notes: [                                        ]                 │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  [Cancel]  [Confirm Delivery ✅]                                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 8. BACKORDER MANAGEMENT

When pick quantity > available stock:

### 8.1 Backorder Fields

| Field | Type | Description |
|-------|------|-------------|
| `backorder_no` | text | BO-YYYY-NNNNN |
| `so_line_id` | FK | Original SO line |
| `item_id` | FK | |
| `qty_backordered` | int | |
| `qty_fulfilled` | int | Auto-updated when stock arrives |
| `reason` | enum | `out_of_stock`, `short_pick`, `damaged`, `reserved` |
| `status` | enum | `open`, `partial`, `fulfilled`, `cancelled` |
| `created_at` | datetime | |
| `resolved_at` | datetime | |

### 8.2 Backorder UI

```
┌─ Backorders ────────────────────────────────────────────────────────────┐
│                                                                          │
│  Open Backorders: 3                                                     │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ BO No        │ SO No      │ Part          │ Qty │ Age  │ Status  │   │
│  ├──────────────┼────────────┼───────────────┼─────┼──────┼─────────┤   │
│  │ BO-2026-001  │ SO-0005    │ FILTER-OIL    │  30 │ 2d   │ 🔴 Open │   │
│  │ BO-2026-002  │ SO-0003    │ BRAKE-PAD-001 │   5 │ 1d   │ 🔴 Open │   │
│  │ BO-2026-003  │ SO-0002    │ JF402006      │   1 │ 4d   │ 🟡 Part │   │
│  └──────────────┴────────────┴───────────────┴─────┴──────┴─────────┘   │
│                                                                          │
│  When stock arrives via GRN → System auto-alerts for pending backorders │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 9. RETURNS

### 9.1 Return Flow

```
Customer requests return
    │
    ▼
┌─────────────────┐
│  Return Request  │  ← Create from DN or SO
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Return Receive  │  ← Receive returned items at dock
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  QC / Inspection │  ← Inspect condition
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Decision        │  ← Restock / Repair / Scrap / Return to Supplier
└────────┬────────┘
         │
         ▼
   Credit Note / Replacement
```

---

## 10. DATABASE SCHEMA (Outbound)

```sql
-- Sales Orders
CREATE TABLE sales_orders (
    id UUID PRIMARY KEY,
    so_no TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    customer_name TEXT,
    delivery_address TEXT,
    delivery_date DATE,
    priority INT DEFAULT 4,
    priority_label TEXT,
    priority_reason TEXT,
    priority_set_by UUID REFERENCES employees(id),
    priority_set_at TIMESTAMPTZ,
    subtotal DECIMAL DEFAULT 0,
    tax_amount DECIMAL DEFAULT 0,
    total DECIMAL DEFAULT 0,
    payment_status TEXT DEFAULT 'unpaid',
    status TEXT DEFAULT 'draft',
    fulfillment_pct DECIMAL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales Order Lines
CREATE TABLE so_lines (
    id UUID PRIMARY KEY,
    so_id UUID REFERENCES sales_orders(id),
    item_id UUID REFERENCES items(id),
    part_code TEXT,
    part_name TEXT,
    qty_ordered INT NOT NULL,
    qty_allocated INT DEFAULT 0,
    qty_picked INT DEFAULT 0,
    qty_packed INT DEFAULT 0,
    qty_shipped INT DEFAULT 0,
    qty_cancelled INT DEFAULT 0,
    unit_price DECIMAL,
    tax_rate DECIMAL,
    line_total DECIMAL,
    batch_id UUID,
    serial_nos TEXT[],
    status TEXT DEFAULT 'pending'
);

-- Pick Lists
CREATE TABLE pick_lists (
    id UUID PRIMARY KEY,
    pick_no TEXT UNIQUE NOT NULL,
    warehouse_id UUID REFERENCES warehouses(id),
    priority INT,
    assigned_to UUID REFERENCES employees(id),
    status TEXT DEFAULT 'draft',
    pick_mode TEXT DEFAULT 'single',
    total_items INT DEFAULT 0,
    total_picked INT DEFAULT 0,
    completion_pct DECIMAL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pick List to SO mapping (for batch picks)
CREATE TABLE pick_so_map (
    pick_id UUID REFERENCES pick_lists(id),
    so_id UUID REFERENCES sales_orders(id),
    PRIMARY KEY (pick_id, so_id)
);

-- Pick Lines
CREATE TABLE pick_lines (
    id UUID PRIMARY KEY,
    pick_id UUID REFERENCES pick_lists(id),
    so_line_id UUID REFERENCES so_lines(id),
    item_id UUID REFERENCES items(id),
    part_code TEXT,
    part_name TEXT,
    location_id UUID REFERENCES locations(id),
    location_code TEXT,
    qty_to_pick INT NOT NULL,
    qty_picked INT DEFAULT 0,
    batch_id UUID,
    serial_nos TEXT[],
    pick_sequence INT,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Boxes (Packing)
CREATE TABLE boxes (
    id UUID PRIMARY KEY,
    box_no TEXT UNIQUE NOT NULL,
    label TEXT,
    pick_id UUID REFERENCES pick_lists(id),
    weight_kg DECIMAL,
    length_cm DECIMAL,
    width_cm DECIMAL,
    height_cm DECIMAL,
    item_count INT DEFAULT 0,
    total_qty INT DEFAULT 0,
    status TEXT DEFAULT 'open',
    packed_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Box Lines
CREATE TABLE box_lines (
    id UUID PRIMARY KEY,
    box_id UUID REFERENCES boxes(id),
    pick_line_id UUID REFERENCES pick_lines(id),
    item_id UUID REFERENCES items(id),
    qty_packed INT NOT NULL,
    batch_id UUID,
    serial_nos TEXT[]
);

-- Box to SO mapping
CREATE TABLE box_so_map (
    box_id UUID REFERENCES boxes(id),
    so_id UUID REFERENCES sales_orders(id),
    PRIMARY KEY (box_id, so_id)
);

-- Trips (Dispatch)
CREATE TABLE trips (
    id UUID PRIMARY KEY,
    trip_no TEXT UNIQUE NOT NULL,
    vehicle_no TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    driver_phone TEXT,
    route TEXT,
    delivery_date DATE,
    total_boxes INT DEFAULT 0,
    total_weight DECIMAL DEFAULT 0,
    status TEXT DEFAULT 'created',
    started_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trip Boxes
CREATE TABLE trip_boxes (
    trip_id UUID REFERENCES trips(id),
    box_id UUID REFERENCES boxes(id),
    loaded_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (trip_id, box_id)
);

-- Delivery Notes
CREATE TABLE delivery_notes (
    id UUID PRIMARY KEY,
    dn_no TEXT UNIQUE NOT NULL,
    so_id UUID REFERENCES sales_orders(id),
    trip_id UUID REFERENCES trips(id),
    customer_id UUID REFERENCES customers(id),
    customer_name TEXT,
    delivery_address TEXT,
    delivery_date DATE,
    total_items INT DEFAULT 0,
    total_boxes INT DEFAULT 0,
    total_weight DECIMAL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    received_by_name TEXT,
    received_by_phone TEXT,
    signature_url TEXT,
    photo_urls TEXT[],
    proof_of_delivery JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

-- Backorders
CREATE TABLE backorders (
    id UUID PRIMARY KEY,
    bo_no TEXT UNIQUE NOT NULL,
    so_line_id UUID REFERENCES so_lines(id),
    item_id UUID REFERENCES items(id),
    qty_backordered INT NOT NULL,
    qty_fulfilled INT DEFAULT 0,
    reason TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Returns
CREATE TABLE returns (
    id UUID PRIMARY KEY,
    return_no TEXT UNIQUE NOT NULL,
    dn_id UUID REFERENCES delivery_notes(id),
    so_id UUID REFERENCES sales_orders(id),
    customer_id UUID REFERENCES customers(id),
    reason TEXT,
    status TEXT DEFAULT 'requested',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE return_lines (
    id UUID PRIMARY KEY,
    return_id UUID REFERENCES returns(id),
    item_id UUID REFERENCES items(id),
    qty_returned INT NOT NULL,
    condition TEXT,
    action TEXT,  -- restock, repair, scrap, return_to_supplier
    notes TEXT
);
```

---

## 11. API ENDPOINTS (Outbound)

```
# Sales Orders
GET    /api/sales-orders?status=&priority=&customer_id=&date_from=&date_to=
POST   /api/sales-orders
GET    /api/sales-orders/{id}
PUT    /api/sales-orders/{id}
POST   /api/sales-orders/{id}/confirm
POST   /api/sales-orders/{id}/cancel
POST   /api/sales-orders/import
PATCH  /api/sales-orders/{id}/priority
POST   /api/sales-orders/bulk-priority
GET    /api/sales-orders/priority-queue

# Pick Lists
GET    /api/pick-lists?status=&assigned_to=
POST   /api/pick-lists/generate
GET    /api/pick-lists/{id}
POST   /api/pick-lists/{id}/assign
POST   /api/pick-lists/{id}/start
POST   /api/pick-lists/{id}/lines/{line_id}/pick
POST   /api/pick-lists/{id}/lines/{line_id}/report-issue
POST   /api/pick-lists/{id}/complete
GET    /api/pick-lists/{id}/print

# Boxes
GET    /api/boxes?pick_id=&status=
POST   /api/boxes
GET    /api/boxes/{id}
POST   /api/boxes/{id}/add-item
POST   /api/boxes/{id}/seal
GET    /api/boxes/{id}/label

# Trips
GET    /api/trips?status=
POST   /api/trips
GET    /api/trips/{id}
POST   /api/trips/{id}/add-box
POST   /api/trips/{id}/depart
POST   /api/trips/{id}/deliver

# Delivery Notes
GET    /api/delivery-notes?status=&customer_id=
GET    /api/delivery-notes/{id}
POST   /api/delivery-notes/{id}/confirm-delivery
GET    /api/delivery-notes/{id}/print

# Backorders
GET    /api/backorders?status=
POST   /api/backorders/{id}/fulfill

# Returns
GET    /api/returns?status=
POST   /api/returns
POST   /api/returns/{id}/inspect
POST   /api/returns/{id}/process
```

---

## 12. SIMPLIFIED FLOW (For Warehouse Person)

### Processing an Order (Step by Step)

```
Step 1: Order comes in → Go to Sales Orders → + New (or Import CSV)
Step 2: Set priority (1-10) → System shows color badge
Step 3: Click "Generate Pick List" → System creates optimized pick list
Step 4: Assign picker → Picker gets notification on their device

Step 5 (Picker): Open Pick List → Follow the route (A1 → A2 → A3...)
Step 6 (Picker): Go to first location → Scan bin → Scan item → Enter qty
Step 7 (Picker): Repeat for all items → Mark "Pick Complete"

Step 8 (Packer): Open Pick → Create Box → Scan items into box
Step 9 (Packer): Weigh box → Seal → Print label

Step 10 (Dispatcher): Create Trip → Enter vehicle/driver
Step 11 (Dispatcher): Scan boxes onto trip → Mark "In Transit"
Step 12 (Dispatcher): Customer receives → Confirm delivery → Done ✅

Total time: ~30-45 minutes for a 5-item order
```

### Handling a Priority Order (Step by Step)

```
Step 1: Order arrives with priority 8 (Urgent) → Shows 🔴 on dashboard
Step 2: Supervisor sees it on top of the queue
Step 3: Clicks "Generate Pick List" → System auto-selects this order first
Step 4: Assigns best available picker
Step 5: Picker sees "URGENT" badge → Picks first
Step 6: Packing → Dispatch → Delivery (same flow, but expedited)

The priority system ensures urgent orders are always first in queue.
```

### Handling a Short Stock (Step by Step)

```
Step 1: Picker goes to bin → Finds only 7 of 10 needed
Step 2: Picks 7 → Taps "Report Issue" → Selects "Short Stock"
Step 3: System auto-creates backorder for remaining 3
Step 4: Supervisor sees backorder alert on dashboard
Step 5: When new stock arrives via GRN → System alerts for backorder
Step 6: Picker picks remaining 3 → Backorder fulfilled ✅
```
