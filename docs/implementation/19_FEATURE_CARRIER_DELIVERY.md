# Feature 19 — Carrier & Delivery Management

**Spec References:** SPEC_03_OUTBOUND.md §6, goWMS_Outbound_Analysis.md §9
**Status:** NOT DONE (loose columns in delivery_notes, no carrier entity)
**Priority:** MEDIUM

---

## Current State

### What Exists
- `delivery_notes` table has: transporter, driver, lr_no, lr_date, vehicle_no (loose columns)
- `delivery_trips` table has: vehicle_no, driver_name (no carrier FK)
- `suppliers` table has `is_transporter` boolean flag
- No dedicated carrier/transporter entity
- No delivery note auto-generation
- No POD (proof of delivery) UI

### Problem
- Transporter info is scattered across tables (no single source of truth)
- Can't manage carriers独立ly (which vehicles, which routes, which rates)
- No way to assign carrier to trip
- No delivery note generation from trip

---

## Design

### Carrier Entity
A carrier is a **supplier with `is_transporter=true`** + additional carrier-specific fields. No separate table — extend suppliers.

### Carrier Fields (on suppliers table)

| Field | Type | Description |
|-------|------|-------------|
| carrier_code | varchar(50) | Carrier identifier |
| vehicle_types | text[] | ['truck', 'tempo', 'bike', 'container'] |
| max_capacity_kg | numeric(10,2) | Max weight per trip |
| max_capacity_cbm | numeric(10,2) | Max volume per trip |
| service_areas | text[] | ['Aurangabad', 'Pune', 'Mumbai'] |
| rate_per_km | numeric(8,2) | Optional: pricing |
| rate_per_kg | numeric(8,2) | Optional: pricing |

### Trip-Carrier Link

```sql
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS carrier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS estimated_delivery TIMESTAMPTZ;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS actual_delivery TIMESTAMPTZ;
```

### Delivery Note Auto-Generation

When trip is completed:
1. For each delivery_stop → create delivery_notes record
2. Link to original sales order
3. Copy items from loaded boxes
4. Auto-generate DN number: DN-YYYY-NNNNN
5. Include carrier, vehicle, driver, LR number

---

## API Endpoints

```
# Carrier Management (extends suppliers)
GET    /api/carriers                          -- list suppliers where is_transporter=true
GET    /api/carriers/:id                      -- carrier detail with vehicles
POST   /api/carriers                          -- create carrier (supplier + transporter fields)
PUT    /api/carriers/:id                      -- update carrier

# Trip Enhancement
PATCH  /api/dispatch/trip/:id                 -- add carrier_id, delivery_date, route
POST   /api/dispatch/trip/:id/complete        -- also generates delivery notes

# Delivery Notes
GET    /api/delivery-notes                    -- list
GET    /api/delivery-notes/:id                -- detail with items
GET    /api/delivery-notes/:id/print          -- PDF generation
POST   /api/delivery-notes/:id/confirm        -- POD confirmation (received_by, signature, photo)
```

---

## Frontend

### Carrier Page (new or extend Suppliers.tsx)

```
┌─ Carriers ────────────────────────────────────────────────────────┐
│                                                                     │
│  [+ New Carrier]  Filter: [All Areas ▾] [All Vehicle Types ▾]     │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Code    │ Name          │ Vehicle Types  │ Areas      │ Status│  │
│  ├─────────┼───────────────┼────────────────┼────────────┼───────┤  │
│  │ CAR-001 │ BlueDart      │ Truck, Tempo   │ MH, KA     │ Active│  │
│  │ CAR-002 │ DTDC          │ Bike, Tempo    │ INTRA-CITY │ Active│  │
│  │ CAR-003 │ Self-Dispatch │ —              │ —          │ Active│  │
│  └─────────┴───────────────┴────────────────┴────────────┴───────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Trip Form (updated Dispatch.tsx)

```
┌─ Create Trip ──────────────────────────────────────────────────────┐
│                                                                     │
│  Vehicle No: [MH-20-1234     ]                                     │
│  Driver:     [Ramesh         ]                                     │
│  Phone:      [9876543210     ]                                     │
│                                                                     │
│  Carrier:    [BlueDart ▾]         (optional — for outsourced)      │
│  Route:      [Aurangabad → Pune  ]                                 │
│  Delivery:   [12/08/2026         ]                                 │
│                                                                     │
│  [Create Trip]                                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Delivery Notes Page (new)

```
┌─ Delivery Notes ───────────────────────────────────────────────────┐
│                                                                     │
│  Filter: [Status ▾] [Date ▾] [Customer ▾]                         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ DN No       │ SO No    │ Customer     │ Items │ Status    │  │  │
│  ├─────────────┼──────────┼──────────────┼───────┼───────────┤  │  │
│  │ DN-2026-001 │ SO-0005  │ Ganju Auto   │   5   │ Delivered │  │  │
│  │ DN-2026-002 │ SO-0004  │ Raj Parts    │   3   │ In Transit│  │  │
│  └─────────────┴──────────┴──────────────┴───────┴───────────┘  │  │
│                                                                     │
│  Click row → Detail view with items + POD capture                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### POD Confirmation Modal

```
┌─ Confirm Delivery: DN-2026-0001 ────────────────────────────────────┐
│                                                                     │
│  Customer: Ganju Automotives    Status: In Transit                  │
│                                                                     │
│  Received by: [                              ]                      │
│  Phone:       [                              ]                      │
│                                                                     │
│  Condition:  [ All OK ]  [ Partial ]  [ Damaged ]                  │
│                                                                     │
│  Notes: [                                        ]                  │
│                                                                     │
│  📷 Signature: [Capture Signature]    📷 Photo: [Take Photo]       │
│                                                                     │
│  [Cancel]  [Confirm Delivery ✓]                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## DB Migration Plan

```sql
-- 008_supplier_enhancement.sql (continued)

-- Carrier fields on suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS carrier_code varchar(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS vehicle_types text[];
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS max_capacity_kg numeric(10,2);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS max_capacity_cbm numeric(10,2);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS service_areas text[];
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rate_per_km numeric(8,2);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rate_per_kg numeric(8,2);

-- Trip enhancements
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS carrier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS estimated_delivery TIMESTAMPTZ;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS actual_delivery TIMESTAMPTZ;

-- Delivery note enhancements
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS carrier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS vehicle_no VARCHAR(50);
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS driver_name VARCHAR(200);
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS lr_no VARCHAR(100);
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS lr_date DATE;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS received_by_name VARCHAR(200);
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS received_by_phone VARCHAR(20);
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS condition_report TEXT;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS photo_urls TEXT[];
```

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 11 Dispatch | Trip lifecycle | Add carrier/date fields to existing flow |
| 17 Supplier | Carrier = supplier | Extend suppliers table, not separate |
| 10 Packing | Box loaded before DN | DN generated after trip complete |

---

## Acceptance Criteria

- [ ] Create carrier (supplier + transporter fields)
- [ ] List carriers with vehicle types and service areas
- [ ] Assign carrier to trip
- [ ] Add delivery_date and route to trip
- [ ] Auto-generate delivery notes on trip complete
- [ ] Delivery Notes list page
- [ ] DN detail with items
- [ ] POD capture (signature + photo)
- [ ] DN PDF generation (optional)

---

## Implementation Plan

### Phase 1 — Carrier Entity (1 day)
1. Migration: add carrier columns to suppliers
2. Extend supplier handler for carrier CRUD
3. Add carrier section to Suppliers.tsx (or separate Carriers.tsx)

### Phase 2 — Trip Enhancement (1 day)
1. Migration: add carrier_id, delivery_date, route to delivery_trips
2. Update dispatch handler: accept new fields on create
3. Update Dispatch.tsx form

### Phase 3 — Delivery Notes (2 days)
1. Auto-generate DN on trip complete
2. Create delivery notes handler (list, get)
3. Create DeliveryNotes.tsx page
4. Add route + sidebar nav

### Phase 4 — POD (1-2 days)
1. Signature capture component (HTML canvas)
2. Photo capture (navigator.mediaDevices)
3. POD confirmation modal
4. Wire to delivery notes
