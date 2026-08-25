# SPEC 01 — Warehouse Setup & Masters

> **For coding agent.** This spec covers warehouse structure, items, employees, roles, and all master data configuration. Designed for simplicity — a warehouse person with minimal tech skills should be able to set up and operate this.

---

## ASSUMPTIONS

1. **Business:** Spare parts warehouse, ₹20 Cr annual turnover, 2,000-5,000 SKUs
2. **Supplier:** Receives from OEMs (e.g., Bajaj Auto, TVS, Hero) — parts arrive in supplier boxes
3. **Customer:** Dealers (e.g., Nirvana Auto Agency), workshops, retail
4. **Users:** 5-15 warehouse staff (Supervisor, Pickers, Packers, Receiving staff)
5. **Devices:** Desktop + mobile/tablet (barcode scanner optional, phone camera works)
6. **Warehouse size:** 5,000-15,000 sq ft, 1-3 warehouses
7. **Box is a primary tracking unit** — supplier ships in boxes, warehouse stores in bins
8. **Parts have Part Code (supplier's) and internal SKU** — may differ
9. **No ERP integration assumed** — standalone WMS (API endpoints provided for future integration)
10. **Batch tracking is optional** — enabled per item (some parts like filters need it, bolts don't)
11. **Serial tracking is optional** — for high-value items only (engines, ECUs)
12. **Weight is tracked** — supplier packing list includes weight per part
13. **Currency:** INR
14. **Timezone:** IST (Asia/Kolkata)
15. **All dates stored as ISO 8601**, displayed as DD/MM/YYYY

---

## 1. WAREHOUSE STRUCTURE

### 1.1 Hierarchy

```
Warehouse
  └── Zone (optional)
       └── Aisle
            └── Bay
                 └── Rack
                      └── Level
                           └── Bin
```

**Simplified for small warehouses:**
```
Warehouse → Aisle → Bin
```

The system must support **both** — full hierarchy for large warehouses, flat structure for small ones. User configures what they need.

### 1.2 Warehouse Setup UI

```
┌─ Warehouse Setup ──────────────────────────────────────────────────────┐
│                                                                         │
│  🏭 My Warehouse                                           [+ New]     │
│                                                                         │
│  Name: Nirvana Main Warehouse                                          │
│  Code: WH-01                                                           │
│  Address: Plot 12, Waluj MIDC, Aurangabad                              │
│  Type: Main                                                            │
│  Status: Active                                                        │
│                                                                         │
│  ┌─ Structure Levels (configure what you need) ────────────────────┐   │
│  │                                                                  │   │
│  │  ☑ Aisle    Naming: [Numeric ▾]  Prefix: [A]   Range: [1-10]   │   │
│  │  ☑ Bay      Naming: [Numeric ▾]  Prefix: [B]   Range: [1-5]    │   │
│  │  ☐ Rack     Naming: [Numeric ▾]  Prefix: [R]   Range: [1-__]   │   │
│  │  ☑ Level    Naming: [Alpha ▾]    Prefix: [L]   Range: [A-D]    │   │
│  │  ☑ Bin      Naming: [Numeric ▾]  Prefix: [ ]   Range: [1-20]   │   │
│  │                                                                  │   │
│  │  Preview: A1-B2-LA-05 → Aisle 1, Bay 2, Level A, Bin 5         │   │
│  │                                                                  │   │
│  │  [Auto-Generate All Locations]                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Location Naming Rules ─────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  Naming Style: [ ▾ ]                                            │   │
│  │    • Numeric: 1, 2, 3, 4 ...                                    │   │
│  │    • Alpha: A, B, C, D ...                                      │   │
│  │    • Alphanumeric: 1A, 1B, 2A, 2B ...                           │   │
│  │    • Custom: [user types pattern]                                │   │
│  │                                                                  │   │
│  │  Separator: [ - ▾ ]  (options: - / . none)                     │   │
│  │                                                                  │   │
│  │  Example outputs:                                                │   │
│  │    A-01-B2-05  or  A01B205  or  A01-B2-LA-05                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [Save]  [Cancel]                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Location Naming — Configurable Options

| Level | Naming Options | Example |
|-------|---------------|---------|
| Aisle | Numeric (1,2,3), Alpha (A,B,C), Custom | A-01, Aisle-1 |
| Bay | Numeric (1,2,3), Alpha (A,B,C), Alphanumeric (1A,1B) | B-01, Bay-A |
| Rack | Numeric (1,2,3), Alpha (A,B,C) | R-01 |
| Level | Numeric (1,2,3), Alpha (A,B,C), Floor-based (G,1,2) | L-A, Level-1 |
| Bin | Numeric (1,2,3...), Alphanumeric (1A,1B) | 01, Bin-01 |

**Configurable per warehouse.** User can choose different naming for each level.

### 1.4 Bulk Location Generator

When user clicks "Auto-Generate All Locations":
1. System creates all combinations of selected levels
2. Shows preview table before confirming
3. User can exclude specific locations (e.g., "no Bay 3 in Aisle 5")
4. Generates location codes with chosen naming convention

```
┌─ Generated Locations Preview ──────────────────────────────────────┐
│                                                                     │
│  Warehouse: WH-01  |  Total: 200 locations                        │
│                                                                     │
│  ☑ A1-B1-LA-01    ☑ A1-B1-LA-02    ☑ A1-B1-LA-03    ...         │
│  ☑ A1-B1-LB-01    ☑ A1-B1-LB-02    ☑ A1-B1-LB-03    ...         │
│  ☑ A1-B2-LA-01    ☑ A1-B2-LA-02    ☐ A1-B2-LA-03  ← unchecked  │
│  ...                                                                │
│                                                                     │
│  [Select All] [Deselect All] [Confirm & Create]                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.5 Location Properties

Each bin/location has:

| Field | Type | Description |
|-------|------|-------------|
| `code` | text | Auto-generated from naming rules |
| `warehouse_id` | FK | Parent warehouse |
| `zone` | text | Optional zone label (Fast-Moving, Bulk, Hazmat) |
| `aisle` | text | Aisle identifier |
| `bay` | text | Bay identifier |
| `rack` | text | Rack identifier (optional) |
| `level` | text | Level identifier |
| `bin` | text | Bin number |
| `type` | enum | `pick_face`, `storage`, `staging`, `dock`, `returns` |
| `max_weight_kg` | decimal | Weight capacity |
| `max_volume_cbm` | decimal | Volume capacity |
| `max_sku_count` | int | How many different SKUs can share this bin |
| `status` | enum | `active`, `full`, `damaged`, `blocked` |
| `barcode` | text | Barcode/QR code for scanning |
| `notes` | text | Free text |

### 1.6 Zone Types (Pre-defined, User Can Add)

| Zone | Color | Purpose | Default Location Type |
|------|-------|---------|----------------------|
| Fast-Moving | 🟢 Green | High turnover items | Pick Face |
| Slow-Moving | 🟡 Yellow | Low turnover items | Storage |
| Bulk | 🔵 Blue | Large/heavy items | Storage |
| Returns | 🟠 Orange | Returned goods | Returns |
| Damaged | 🔴 Red | Damaged goods | Returns |
| Staging | ⚪ White | Outbound staging | Staging |
| Dock | ⚫ Grey | Loading/unloading | Dock |

---

## 2. ITEM MASTER

### 2.1 Item Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sku` | text | Yes | Internal SKU code (auto-generated or manual) |
| `part_code` | text | Yes | Supplier/manufacturer part code |
| `name` | text | Yes | Item name |
| `description` | text | No | Detailed description |
| `category` | FK | Yes | Item category |
| `brand` | text | No | Manufacturer brand |
| `uom` | enum | Yes | Unit of measure: `pcs`, `set`, `kg`, `ltr`, `mtr` |
| `pack_mode` | enum | Yes | `loose` (individual), `packed` (box/set) |
| `control_mode` | enum | Yes | `item` (track by qty), `batch` (track by batch), `serial` (track by serial) |
| `weight_kg` | decimal | No | Unit weight |
| `length_cm` | decimal | No | Dimensions for storage planning |
| `width_cm` | decimal | No | |
| `height_cm` | decimal | No | |
| `min_stock` | int | No | Reorder point |
| `max_stock` | int | No | Max capacity |
| `reorder_qty` | int | No | Standard reorder quantity |
| `shelf_life_days` | int | No | For expiry tracking |
| `hsn_code` | text | No | GST HSN code |
| `cost_price` | decimal | No | Purchase cost |
| `sell_price` | decimal | No | Selling price |
| `tax_rate` | decimal | No | GST percentage |
| `barcode` | text | No | Item barcode (EAN/UPC/custom) |
| `image` | file | No | Item photo |
| `status` | enum | Yes | `active`, `inactive`, `discontinued` |
| `created_at` | datetime | Auto | |
| `updated_at` | datetime | Auto | |

### 2.2 Item Category

Hierarchical, user-configurable:

```
Spare Parts
  ├── Engine
  │     ├── Piston
  │     ├── Cylinder Block
  │     └── Gasket
  ├── Brake System
  │     ├── Brake Pad
  │     ├── Disc
  │     └── Caliper
  ├── Electrical
  │     ├── Headlamp
  │     ├── Battery
  │     └── Wiring Harness
  ├── Body Parts
  │     ├── Fairing
  │     ├── Tank
  │     └── Seat
  └── Consumables
        ├── Oil
        ├── Filter
        └── Lubricant
```

### 2.3 Item Import

Support CSV/Excel import matching the supplier packing list format:

```
Supplier Column → WMS Field
──────────────────────────
Part Code       → part_code
Part Name       → name
Qty             → (used in GRN, not item master)
Weight          → weight_kg
```

### 2.4 Item UI

```
┌─ Items ─────────────────────────────────────────────────────────────────┐
│                                                                          │
│  [+ New Item]  [📥 Import]  [📤 Export]                                │
│                                                                          │
│  Search: [🔍 Search by code, name, brand...]                            │
│  Filter: [Category ▾] [Brand ▾] [Status ▾] [Control ▾]                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Code       │ Name              │ Category  │ Stock │ Status      │   │
│  ├────────────┼───────────────────┼───────────┼───────┼─────────────┤   │
│  │ BRAKE-PAD  │ Brake Pad Set     │ Brake     │  120  │ 🟢 Active   │   │
│  │ FILTER-OIL │ Oil Filter        │ Consumable│   45  │ 🟢 Active   │   │
│  │ PISTON-K1  │ Block Piston K1   │ Engine    │    0  │ 🔴 Low      │   │
│  │ HEADLAMP   │ Headlamp Assembly │ Electrical│    8  │ 🟢 Active   │   │
│  └────────────┴───────────────────┴───────────┴───────┴─────────────┘   │
│                                                                          │
│  Showing 1-4 of 247 items                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. EMPLOYEE & ROLE SETUP

### 3.1 Roles (Pre-defined)

| Role | Permissions | Typical User |
|------|------------|--------------|
| **Admin** | Full access, settings, user management | Owner/Manager |
| **Supervisor** | All operations, reports, approve/reject | Warehouse Supervisor |
| **Receiver** | GRN, Putaway, Quality Check | Receiving staff |
| **Picker** | Pick lists, scan items | Picker |
| **Packer** | Packing, box management | Packer |
| **Dispatcher** | Dispatch, trips, delivery notes | Dispatch operator |
| **Viewer** | Read-only access, reports | Auditor, Management |

### 3.2 Employee Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `emp_id` | text | Yes | Employee code |
| `name` | text | Yes | Full name |
| `phone` | text | Yes | Mobile number |
| `email` | text | No | Email address |
| `role` | enum | Yes | Role from above list |
| `warehouse_id` | FK | Yes | Assigned warehouse |
| `pin` | text | Yes | 4-6 digit PIN for quick login |
| `barcode` | text | No | Employee badge barcode |
| `status` | enum | Yes | `active`, `inactive` |
| `photo` | file | No | Employee photo |
| `created_at` | datetime | Auto | |

### 3.3 Login System

**Two-factor approach:**
1. **Desktop:** Username + Password (Admin/Supervisor)
2. **Floor:** Employee PIN (4-6 digits) — fast login on shared devices
3. **Scan:** Scan employee badge barcode → auto-login

```
┌─ Employee Login ──────────────────────────────────────────────────────┐
│                                                                        │
│                        goWMS                                           │
│                   Warehouse Desk                                       │
│                                                                        │
│                  ┌─────────────┐                                       │
│                  │  📷 Scan    │  ← Scan badge barcode                │
│                  │   Badge     │                                       │
│                  └─────────────┘                                       │
│                                                                        │
│                  ── OR ──                                              │
│                                                                        │
│                  ┌─────────────┐                                       │
│                  │  1  2  3    │                                       │
│                  │  4  5  6    │  ← Enter PIN                         │
│                  │  7  8  9    │                                       │
│                  │     0  ⌫    │                                       │
│                  └─────────────┘                                       │
│                                                                        │
│                  [Admin Login →]  ← Username+password for admin       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Employee Setup UI

```
┌─ Employees ─────────────────────────────────────────────────────────────┐
│                                                                          │
│  [+ New Employee]  [📥 Import]                                         │
│                                                                          │
│  Warehouse: [All Warehouses ▾]                                         │
│  Role: [All Roles ▾]                                                   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ ID     │ Name          │ Phone       │ Role       │ WH    │ Status│   │
│  ├────────┼───────────────┼─────────────┼────────────┼───────┼───────┤   │
│  │ EMP-01 │ Rahul Kumar   │ 9876543210  │ Picker     │ WH-01 │ 🟢    │   │
│  │ EMP-02 │ Suresh Patil  │ 9876543211  │ Packer     │ WH-01 │ 🟢    │   │
│  │ EMP-03 │ Amit Sharma   │ 9876543212  │ Receiver   │ WH-01 │ 🟢    │   │
│  │ EMP-04 │ Priya Desai   │ 9876543213  │ Supervisor │ WH-01 │ 🟢    │   │
│  └────────┴───────────────┴─────────────┴────────────┴───────┴───────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. CUSTOMER MASTER

### 4.1 Customer Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | text | Yes | Customer code |
| `name` | text | Yes | Business name |
| `type` | enum | Yes | `dealer`, `workshop`, `retail`, `internal`, `key_account` |
| `contact_person` | text | No | Primary contact |
| `phone` | text | Yes | Phone number |
| `email` | text | No | Email |
| `address` | text | Yes | Full address |
| `city` | text | Yes | |
| `state` | text | Yes | For GST |
| `pincode` | text | Yes | |
| `gstin` | text | No | GST number |
| `credit_limit` | decimal | No | Credit limit in INR |
| `payment_terms` | enum | No | `prepaid`, `cod`, `net_15`, `net_30`, `net_45` |
| `priority` | int | No | Default order priority (1-10) |
| `status` | enum | Yes | `active`, `inactive`, `blocked` |
| `notes` | text | No | |

---

## 5. SUPPLIER MASTER

### 5.1 Supplier Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | text | Yes | Supplier code |
| `name` | text | Yes | Business name |
| `contact_person` | text | No | |
| `phone` | text | Yes | |
| `email` | text | No | |
| `address` | text | Yes | |
| `gstin` | text | No | |
| `payment_terms` | enum | No | |
| `lead_time_days` | int | No | Typical delivery lead time |
| `status` | enum | Yes | `active`, `inactive` |

---

## 6. DATABASE SCHEMA (Warehouse Setup)

```sql
-- Warehouses
CREATE TABLE warehouses (
    id UUID PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    type TEXT DEFAULT 'main',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Location Structure Config
CREATE TABLE warehouse_structure (
    id UUID PRIMARY KEY,
    warehouse_id UUID REFERENCES warehouses(id),
    level_name TEXT NOT NULL,  -- 'aisle', 'bay', 'rack', 'level', 'bin'
    level_order INT NOT NULL,
    naming_style TEXT DEFAULT 'numeric',  -- 'numeric', 'alpha', 'alphanumeric', 'custom'
    prefix TEXT,
    range_start TEXT,
    range_end TEXT,
    separator TEXT DEFAULT '-',
    enabled BOOLEAN DEFAULT true
);

-- Locations (Bins)
CREATE TABLE locations (
    id UUID PRIMARY KEY,
    warehouse_id UUID REFERENCES warehouses(id),
    code TEXT NOT NULL,
    zone TEXT,
    aisle TEXT,
    bay TEXT,
    rack TEXT,
    level TEXT,
    bin TEXT,
    type TEXT DEFAULT 'pick_face',
    max_weight_kg DECIMAL,
    max_volume_cbm DECIMAL,
    max_sku_count INT DEFAULT 1,
    status TEXT DEFAULT 'active',
    barcode TEXT,
    notes TEXT,
    UNIQUE(warehouse_id, code)
);

-- Item Categories (hierarchical)
CREATE TABLE categories (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES categories(id),
    level INT DEFAULT 0,
    sort_order INT DEFAULT 0
);

-- Items
CREATE TABLE items (
    id UUID PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    part_code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(id),
    brand TEXT,
    uom TEXT DEFAULT 'pcs',
    pack_mode TEXT DEFAULT 'loose',
    control_mode TEXT DEFAULT 'item',
    weight_kg DECIMAL,
    length_cm DECIMAL,
    width_cm DECIMAL,
    height_cm DECIMAL,
    min_stock INT DEFAULT 0,
    max_stock INT,
    reorder_qty INT,
    shelf_life_days INT,
    hsn_code TEXT,
    cost_price DECIMAL,
    sell_price DECIMAL,
    tax_rate DECIMAL,
    barcode TEXT,
    image_url TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'dealer',
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    gstin TEXT,
    credit_limit DECIMAL,
    payment_terms TEXT,
    priority INT DEFAULT 4,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers
CREATE TABLE suppliers (
    id UUID PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    gstin TEXT,
    payment_terms TEXT,
    lead_time_days INT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees
CREATE TABLE employees (
    id UUID PRIMARY KEY,
    emp_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL,
    warehouse_id UUID REFERENCES warehouses(id),
    pin_hash TEXT,
    barcode TEXT,
    photo_url TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roles & Permissions
CREATE TABLE roles (
    id UUID PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    permissions JSONB NOT NULL,
    description TEXT
);
```

---

## 7. API ENDPOINTS (Warehouse Setup)

```
# Warehouses
GET    /api/warehouses
POST   /api/warehouses
PUT    /api/warehouses/{id}
DELETE /api/warehouses/{id}
POST   /api/warehouses/{id}/generate-locations

# Locations
GET    /api/locations?warehouse_id=&zone=&type=
POST   /api/locations
PUT    /api/locations/{id}
DELETE /api/locations/{id}
POST   /api/locations/bulk-create

# Items
GET    /api/items?search=&category=&status=
POST   /api/items
PUT    /api/items/{id}
DELETE /api/items/{id}
POST   /api/items/import
GET    /api/items/export

# Categories
GET    /api/categories
POST   /api/categories
PUT    /api/categories/{id}

# Customers
GET    /api/customers
POST   /api/customers
PUT    /api/customers/{id}

# Suppliers
GET    /api/suppliers
POST   /api/suppliers
PUT    /api/suppliers/{id}

# Employees
GET    /api/employees?warehouse_id=&role=
POST   /api/employees
PUT    /api/employees/{id}
POST   /api/employees/{id}/reset-pin

# Auth
POST   /api/auth/login          # username + password
POST   /api/auth/pin-login      # employee PIN
POST   /api/auth/scan-login     # barcode scan
POST   /api/auth/logout
```

---

## 8. SIMPLIFIED FLOW (For Warehouse Person)

### Setting Up a New Warehouse (Step by Step)

```
Step 1: Go to Settings → Warehouses → + New
Step 2: Enter name, address
Step 3: Choose structure (Aisle + Bin for small, Aisle + Bay + Level + Bin for large)
Step 4: Set naming (e.g., Aisle = A1,A2... Bin = 01,02...)
Step 5: Click "Generate Locations" → Review → Confirm
Step 6: Assign zones (drag bins to Fast-Moving, Slow-Moving, etc.)

Done! Warehouse structure is ready.
```

### Adding Items (Step by Step)

```
Step 1: Go to Masters → Items → + New
Step 2: Enter Part Code (from supplier), Name
Step 3: Choose Category, Brand
Step 4: Set Pack Mode (loose/packed), Control Mode (item/batch/serial)
Step 5: Enter weight, dimensions
Step 6: Set min/max stock levels
Step 7: Save

OR: Import from Excel (match columns → upload → done)
```

### Adding Employees (Step by Step)

```
Step 1: Go to Settings → Employees → + New
Step 2: Enter name, phone
Step 3: Assign role (Picker/Packer/Receiver/etc.)
Step 4: Assign warehouse
Step 5: Set 4-digit PIN
Step 6: Print badge (optional — with barcode)

Done! Employee can now log in with PIN.
```
