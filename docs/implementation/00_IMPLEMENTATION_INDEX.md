# goWMS — Implementation Specs Index

**Purpose:** Per-feature implementation plans with gap analysis, conflict checks, and acceptance criteria.

**Order:** Dependency-aware. Each file references features above it.

---

## Feature List

| # | File | Feature | Status | Priority |
|---|------|---------|--------|----------|
| 01 | `01_FEATURE_WAREHOUSE_MASTER.md` | Warehouse structure, locations, zones | DONE | — |
| 02 | `02_FEATURE_ITEM_MASTER.md` | Item master, categories, pack/control modes | DONE | — |
| 03 | `03_FEATURE_EMPLOYEE_ROLES.md` | Employees, roles, PIN login, RBAC | PARTIAL | HIGH |
| 04 | `04_FEATURE_GRN_INBOUND.md` | GRN sessions, box/item receiving | DONE | — |
| 05 | `05_FEATURE_QC_TEMPLATES.md` | QC template definitions, configurable checklists | PARTIAL | MEDIUM |
| 06 | `06_FEATURE_PUTAWAY.md` | Putaway suggestion engine, queue | DONE | — |
| 07 | `07_FEATURE_STOCK_BALANCES.md` | Stock by location, FEFO, ledger | DONE | — |
| 08 | `08_FEATURE_SALES_ORDERS.md` | Sales order CRUD, import, priority queue | PARTIAL | HIGH |
| 09 | `09_FEATURE_PICKING.md` | Pick lists, FEFO allocation, wave picking | PARTIAL | HIGH |
| 10 | `10_FEATURE_PACKING.md` | Box packing, labels, print | PARTIAL | MEDIUM |
| 11 | `11_FEATURE_DISPATCH.md` | Trips, delivery notes, POD | PARTIAL | MEDIUM |
| 12 | `12_FEATURE_BACKORDERS.md` | Auto-creation, fulfillment | PARTIAL | MEDIUM |
| 13 | `13_FEATURE_RETURNS.md` | Return claims, inspection, restock | NOT DONE | LOW |
| 14 | `14_FEATURE_ANALYTICS.md` | Outbound KPIs, dashboards | PARTIAL | LOW |
| 15 | `15_FEATURE_NOTIFICATIONS.md` | Push, email, SMS alerts | PARTIAL | LOW |
| 16 | `16_FEATURE_IMPORT_EXPORT.md` | CSV import for items, SOs, employees | NOT DONE | MEDIUM |

---

## Legend

| Status | Meaning |
|--------|---------|
| DONE | Fully implemented, schema + handler + UI working |
| PARTIAL | Some pieces exist (schema, handler, or UI), gaps remain |
| NOT DONE | Spec exists but no implementation |

---

## Conflict Map

```
01 Warehouse ──┬── 04 GRN (needs locations for staging)
               ├── 06 Putaway (moves stock between locations)
               └── 07 Stock Balances (location-level truth)

02 Item Master ──┬── 04 GRN (unknown SKU triggers master completion)
                 ├── 07 Stock Balances (item_code FK)
                 └── 08 Sales Orders (item reference)

03 Employee/Roles ── ALL modules (auth/RBAC gate)

04 GRN ──┬── 06 Putaway (GRN close triggers putaway)
         ├── 07 Stock Balances (created on GRN close)
         └── 12 Backorders (GRN fulfills pending backorders)

05 QC Templates ──┬── 04 GRN (QC inline in receive flow)
                   └── 13 Returns (QC on returned items)

07 Stock Balances ──┬── 08 Sales Orders (availability check)
                    ├── 09 Picking (FEFO allocation source)
                    ├── 10 Packing (stock consumption)
                    ├── 12 Backorders (stock arrival triggers)
                    └── 13 Returns (restock/adjust)

08 Sales Orders ──┬── 09 Picking (pick lists from SOs)
                  └── 12 Backorders (shortage creates backorders)

09 Picking ──┬── 10 Packing (consumes picked stock)
             └── 12 Backorders (shortage line triggers)

10 Packing ── 11 Dispatch (loads packed boxes)

11 Dispatch ── 13 Returns (references delivery notes)
```

---

## Additional Features (Added After Analysis)

| # | File | Feature | Status | Priority |
|---|------|---------|--------|----------|
| 17 | `17_FEATURE_SUPPLIER_MASTER.md` | Enhanced supplier UI, carrier config | PARTIAL | HIGH |
| 18 | `18_FEATURE_PACKING_LIST_IMPORT.md` | Configurable packing list templates, import | NOT DONE | HIGH |
| 19 | `19_FEATURE_CARRIER_DELIVERY.md` | Carrier management, delivery notes, POD | NOT DONE | MEDIUM |

### Packing List Format (spares_packing_list.xlsx)
- 16 columns, 64 rows, 60 boxes, 22 items
- One row = one part in one box
- Box Number (col 14) is the actual box ID
- Box No.From/To are range markers (ignore, use Box Number)
- Last row is summary (skip)
- Header fields repeat on every row (extract once from first row)
- Different suppliers have different column names → configurable templates needed

### Updated Conflict Map

```
17 Supplier ──┬── 18 Packing List (template linked to supplier)
              └── 19 Carrier (carrier = supplier with is_transporter)

18 Packing List ── 04 GRN (import feeds into GRN session)

19 Carrier ──┬── 11 Dispatch (carrier assigned to trip)
             └── Delivery Notes (carrier info on DN)
```
