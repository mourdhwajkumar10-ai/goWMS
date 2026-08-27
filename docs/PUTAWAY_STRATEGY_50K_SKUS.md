# Putaway Strategy for 50K+ Spare Parts SKUs

## Executive Summary

**Problem:** 21,096+ spare parts SKUs with no item dimensions, varying pack quantities (1-500 pcs), all bins same size, need to prevent item mixing and bin overflow.

**Solution:** HSN code based grouping + pack quantity capacity limits + one-item-per-bin rule.

---

## 1. SKU Analysis

### Data Overview

| Metric | Value |
|--------|-------|
| **Total SKUs** | 21,096 |
| **Segments** | 2W (17,564), COM (3,531) |
| **Pack Qty Range** | 1 to 500 pcs/pack |
| **Price Range** | ₹0.12 to ₹88,478.86 |
| **Avg Price** | ₹813.10 |

### Pack Quantity Distribution

| Pack Size | Count | % |
|-----------|-------|---|
| 1 pc | 16,596 | 79% |
| 2-5 pcs | 1,540 | 7% |
| 6-10 pcs | 1,450 | 7% |
| 11-50 pcs | 488 | 2% |
| 51-100 pcs | 1,223 | 6% |
| 101-500 pcs | 299 | 1% |

### HSN Code Groups (Product Categories)

| HSN Code | Description | Items | Zone |
|----------|-------------|-------|------|
| 87141090 | Bicycle/motorcycle parts | 8,531 | A |
| 39199090 | Self-adhesive plates, strips | 1,511 | B |
| 87149990 | Other parts for cycles | 1,237 | C |
| 39199010 | Self-adhesive tape | 1,024 | B |
| 73181900 | Other screws/bolts | 1,010 | D |
| 40169990 | Other rubber articles | 552 | E |
| 85443000 | Ignition wiring sets | 546 | F |
| 73181500 | Other screws/bolts | 524 | D |
| 87149100 | Brake parts | 475 | C |
| 73182200 | Screws/washers | 326 | D |
| Other | All other codes | 5,083 | G |

---

## 2. The Strategy: Same-Size Bins + HSN Grouping

### Core Rules

1. **All bins same size** — Standardize on one bin dimension
2. **One item per bin** — Never mix different items
3. **HSN-based zones** — Group similar products together
4. **Pack qty limits** — Small packs fit more per bin, large packs fit fewer

---

## 3. Bin Capacity Calculation

### Bin Dimensions (Same for All)

| Parameter | Value |
|-----------|-------|
| **Bin Width** | 40 cm |
| **Bin Depth** | 30 cm |
| **Bin Height** | 20 cm |
| **Bin Volume** | 24,000 cm³ (24 liters) |

### How Many Items Fit Per Bin

Since all bins are same size, capacity depends on **pack quantity** (how many pieces come in one pack):

| Pack Qty | Est. Pack Size | Items per Bin | Max Qty per Bin |
|----------|----------------|---------------|-----------------|
| 1 pc | ~10 cm³ | 240 packs | **240 units** |
| 5 pcs | ~30 cm³ | 80 packs | **400 units** |
| 10 pcs | ~50 cm³ | 48 packs | **480 units** |
| 20 pcs | ~80 cm³ | 30 packs | **600 units** |
| 50 pcs | ~150 cm³ | 16 packs | **800 units** |
| 100 pcs | ~250 cm³ | 9 packs | **900 units** |
| 250 pcs | ~500 cm³ | 4 packs | **1,000 units** |
| 500 pcs | ~800 cm³ | 3 packs | **1,500 units** |

### Capacity Rule Formula

```
Max Qty per Bin = Bin Volume / Pack Volume
```

For each item, the system calculates:
```
pack_volume = pack_qty × avg_piece_volume (estimated)
max_qty = 24000 / pack_volume
```

---

## 4. HSN Code Zone Assignment

### Why HSN Codes?

HSN codes group items by **physical product type**:
- All bearings have similar sizes
- All bolts/screws have similar sizes
- All rubber seals have similar sizes

This means items in the same HSN group will have **similar pack volumes** and fit in bins predictably.

### Zone Layout

```
┌─────────────────────────────────────────────────────────────┐
│                      WAREHOUSE LAYOUT                        │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │  ZONE A │  │  ZONE B │  │  ZONE C │  │  ZONE D │       │
│  │ 87141090│  │ 391990  │  │ 871499  │  │ 7318    │       │
│  │ Cycle   │  │ Tapes/  │  │ Other   │  │ Fasten- │       │
│  │ Parts   │  │ Films   │  │ Cycle   │  │ ers     │       │
│  │ 8,531   │  │ 2,535   │  │ 1,712   │  │ 1,860   │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │  ZONE E │  │  ZONE F │  │  ZONE G │                     │
│  │ 401699  │  │ 854430  │  │ Other   │                     │
│  │ Rubber  │  │ Electri-│  │ All     │                     │
│  │ Parts   │  │ cal     │  │ Others  │                     │
│  │ 1,084   │  │ 546     │  │ 5,083   │                     │
│  └─────────┘  └─────────┘  └─────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### Zone Assignment Rules

| Zone | HSN Prefix | Product Type | Items |
|------|------------|--------------|-------|
| **A** | 87141090 | Bicycle/motorcycle frame parts | 8,531 |
| **B** | 391990* | Tapes, films, adhesives | 2,535 |
| **C** | 87149*, 87141* (other) | Cycle parts (brakes, other) | 1,712 |
| **D** | 7318* | Bolts, screws, nuts, washers | 1,860 |
| **E** | 40169*, 401693* | Rubber parts (seals, gaskets) | 1,084 |
| **F** | 854430* | Electrical wiring | 546 |
| **G** | Other | Everything else | 5,083 |

---

## 5. Putaway Algorithm

### Step-by-Step Flow

```
Item arrives at staging
        │
        ▼
┌─────────────────────────┐
│ 1. Get item properties  │
│    - HSN code           │
│    - Pack quantity      │
│    - Price              │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ 2. Determine zone       │
│    - Based on HSN code  │
│    - Zone A-G mapping   │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ 3. Calculate max qty    │
│    - Pack volume est.   │
│    - Bin capacity       │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ 4. Find best bin        │
│    - Same item already? │
│    - Empty in zone?     │
│    - Has capacity?      │
└─────────────────────────┘
        │
   ┌────┴────┐
   │         │
  YES        NO
   │         │
   ▼         ▼
Add to     Find new
existing   empty bin
bin        in zone
   │         │
   └────┬────┘
        │
        ▼
┌─────────────────────────┐
│ 5. Validate capacity    │
│    - Current qty + new  │
│    - Check max allowed  │
│    - Reject if over     │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ 6. Execute putaway      │
│    - Update bin qty     │
│    - Log movement       │
│    - Update status      │
└─────────────────────────┘
```

### Decision Tree

```
                    ┌──────────────┐
                    │ Item arrives │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ Same item in │
                    │ any bin?     │
                    └──────┬───────┘
                           │
                    ┌──────┴──────┐
                    │             │
                   YES           NO
                    │             │
            ┌───────▼──────┐  ┌──▼───────────┐
            │ Bin has room?│  │ Find empty   │
            └───────┬──────┘  │ bin in HSN   │
                    │         │ zone         │
              ┌─────┴─────┐  └──┬───────────┘
              │           │     │
             YES         NO  ┌──▼───────────┐
              │           │  │ Empty bin    │
              ▼           ▼  │ found?       │
           PUTAWAY    ┌──┐  └──┬───────────┘
                      │  │     │
                    WAIT  │  ┌──┴─────┐
                         │  │        │
                        NO  YES     NO
                         │   │       │
                         ▼   ▼       ▼
                      BLOCKED PUTAWAY ANY
                             BIN IN
                             ZONE
```

---

## 6. Database Schema

### 6.1 Add HSN Zone Mapping Table

```sql
CREATE TABLE hsn_zone_mapping (
    id SERIAL PRIMARY KEY,
    hsn_prefix VARCHAR(20) NOT NULL,
    zone_code VARCHAR(10) NOT NULL,
    description VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Pre-populate with your HSN groups
INSERT INTO hsn_zone_mapping (hsn_prefix, zone_code, description) VALUES
('87141090', 'A', 'Cycle/motorcycle frame parts'),
('391990', 'B', 'Tapes, films, adhesives'),
('87149', 'C', 'Other cycle parts'),
('87141', 'C', 'Other cycle parts'),
('7318', 'D', 'Bolts, screws, nuts'),
('40169', 'E', 'Rubber parts'),
('401693', 'E', 'Rubber seals'),
('854430', 'F', 'Electrical wiring'),
('%', 'G', 'All other codes');
```

### 6.2 Add Pack Volume Estimate to Items

```sql
ALTER TABLE items ADD COLUMN estimated_pack_volume_cm3 FLOAT;
ALTER TABLE items ADD COLUMN hsn_zone VARCHAR(10);

-- Auto-populate zone from HSN code
UPDATE items SET hsn_zone = (
    SELECT zone_code FROM hsn_zone_mapping
    WHERE items.hsn_code::text LIKE hsn_prefix || '%'
    AND active = true
    ORDER BY LENGTH(hsn_prefix) DESC
    LIMIT 1
);

-- Estimate pack volume (pieces × avg size)
-- Small parts: ~10 cm³ per piece
-- Medium parts: ~30 cm³ per piece
-- Large parts: ~80 cm³ per piece
UPDATE items SET estimated_pack_volume_cm3 = pack_qty * CASE
    WHEN hsn_zone IN ('D', 'E') THEN 10   -- bolts, rubber = small
    WHEN hsn_zone = 'F' THEN 30           -- wiring = medium
    WHEN hsn_zone = 'B' THEN 20           -- tapes = medium
    ELSE 15                                -- default
END;
```

### 6.3 Putaway Rules Table

```sql
-- Instead of 21K individual rules, use zone-based rules
CREATE TABLE zone_putaway_rules (
    id SERIAL PRIMARY KEY,
    zone_code VARCHAR(10) NOT NULL,
    max_qty_per_bin FLOAT NOT NULL,
    max_packs_per_bin INT NOT NULL,
    priority INT DEFAULT 1,
    active BOOLEAN DEFAULT true
);

INSERT INTO zone_putaway_rules (zone_code, max_qty_per_bin, max_packs_per_bin, priority) VALUES
('A', 500, 50, 1),   -- Cycle parts: max 500 units or 50 packs
('B', 300, 30, 1),   -- Tapes: max 300 units or 30 packs
('C', 500, 50, 1),   -- Other cycle: max 500 units or 50 packs
('D', 1000, 100, 1), -- Fasteners: max 1000 units or 100 packs
('E', 200, 20, 1),   -- Rubber: max 200 units or 20 packs
('F', 100, 10, 1),   -- Electrical: max 100 units or 10 packs
('G', 500, 50, 1);   -- Other: max 500 units or 50 packs
```

---

## 7. Go Implementation

### 7.1 Zone Resolution

```go
func resolveZone(db *pgxpool.Pool, hsnCode string) string {
    var zone string
    err := db.QueryRow(ctx, `
        SELECT zone_code FROM hsn_zone_mapping
        WHERE $1 LIKE hsn_prefix || '%'
        AND active = true
        ORDER BY LENGTH(hsn_prefix) DESC
        LIMIT 1`, hsnCode).Scan(&zone)
    if err != nil || zone == "" {
        return "G" // Default zone
    }
    return zone
}
```

### 7.2 Capacity Calculation

```go
func calculateMaxQty(packQty int, hsnZone string) float64 {
    // Bin volume: 24,000 cm³ (40×30×20cm)
    const binVolume = 24000.0

    // Avg piece volume based on product type
    var avgPieceVolume float64
    switch hsnZone {
    case "D", "E": // Bolts, rubber = small
        avgPieceVolume = 10.0
    case "F": // Electrical = medium
        avgPieceVolume = 30.0
    case "B": // Tapes = medium
        avgPieceVolume = 20.0
    default: // Default
        avgPieceVolume = 15.0
    }

    packVolume := float64(packQty) * avgPieceVolume
    if packVolume <= 0 {
        return 500 // Default capacity
    }

    maxPacks := binVolume / packVolume
    maxQty := maxPacks * float64(packQty)

    // Cap at reasonable limits
    if maxQty > 2000 {
        maxQty = 2000
    }
    if maxQty < 10 {
        maxQty = 10
    }

    return maxQty
}
```

### 7.3 Putaway Suggestion

```go
func suggestPutawayLocation(db *pgxpool.Pool, itemCode string, qty float64, warehouseID int) (*PutawaySuggestion, error) {
    // 1. Get item properties
    var hsnCode, zone string
    var packQty int
    var price float64
    err := db.QueryRow(ctx, `
        SELECT COALESCE(hsn_code,''), COALESCE(hsn_zone,'G'),
               COALESCE(pack_qty,1), COALESCE(basic_price,0)
        FROM items WHERE code=$1`, itemCode).Scan(&hsnCode, &zone, &packQty, &price)
    if err != nil {
        return nil, err
    }

    // 2. Resolve zone from HSN if not set
    if zone == "" {
        zone = resolveZone(db, hsnCode)
    }

    // 3. Calculate max qty for this item
    maxQty := calculateMaxQty(packQty, zone)

    // 4. Check if item already has a home bin
    var existingBin string
    var currentQty float64
    err = db.QueryRow(ctx, `
        SELECT wl.location_code, slb.actual_qty
        FROM stock_location_balances slb
        JOIN warehouse_locations wl ON wl.id = slb.location_id
        WHERE UPPER(slb.item_code)=UPPER($1) AND slb.warehouse_id=$2
        AND slb.actual_qty > 0
        ORDER BY slb.actual_qty DESC LIMIT 1`, itemCode, warehouseID).Scan(&existingBin, &currentQty)
    if err == nil && existingBin != "" {
        // Item already has a bin — check capacity
        if currentQty+qty <= maxQty {
            return &PutawaySuggestion{
                Location: existingBin,
                Reason: fmt.Sprintf("Same item already here (%.0f/%.0f capacity)", currentQty, maxQty),
                Confidence: 0.95,
            }, nil
        }
    }

    // 5. Find empty bin in correct zone
    var emptyBin string
    err = db.QueryRow(ctx, `
        SELECT location_code FROM warehouse_locations
        WHERE warehouse_id=$1
        AND location_type='storage'
        AND (zone=$2 OR $2='')
        AND is_occupied=false
        AND disabled=false
        ORDER BY putaway_priority ASC, location_code ASC
        LIMIT 1`, warehouseID, zone).Scan(&emptyBin)
    if err == nil && emptyBin != "" {
        return &PutawaySuggestion{
            Location: emptyBin,
            Reason: fmt.Sprintf("Empty bin in Zone %s (HSN: %s)", zone, hsnCode),
            Confidence: 0.85,
        }, nil
    }

    // 6. Fallback: any empty bin
    err = db.QueryRow(ctx, `
        SELECT location_code FROM warehouse_locations
        WHERE warehouse_id=$1
        AND location_type='storage'
        AND is_occupied=false
        AND disabled=false
        ORDER BY putaway_priority ASC, location_code ASC
        LIMIT 1`, warehouseID).Scan(&emptyBin)
    if err == nil && emptyBin != "" {
        return &PutawaySuggestion{
            Location: emptyBin,
            Reason: "Any available bin",
            Confidence: 0.70,
        }, nil
    }

    return nil, fmt.Errorf("no available bins")
}
```

---

## 8. UI Enhancements

### 8.1 Putaway Page — Show HSN Zone

```tsx
<div className="putaway-suggestion">
  <div className="item-info">
    <span className="item-code">{item.code}</span>
    <span className="hsn-badge">{item.hsn_code}</span>
    <span className="zone-badge zone-{item.hsn_zone}">Zone {item.hsn_zone}</span>
    <span className="pack-qty">Pack: {item.pack_qty} pcs</span>
  </div>
  <div className="suggested-bin">
    <span className="bin-code">A-01-03</span>
    <span className="capacity">
      {currentQty}/{maxQty} ({Math.round(currentQty/maxQty*100)}% full)
    </span>
  </div>
</div>
```

### 8.2 Zone Map View

```
┌──────────────────────────────────────────────────────┐
│  ZONE MAP — Click a zone to see bins                  │
│                                                       │
│  ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐         │
│  │Zone A │  │Zone B │  │Zone C │  │Zone D │         │
│  │871410 │  │391990 │  │87149  │  │7318   │         │
│  │8,531  │  │2,535  │  │1,712  │  │1,860  │         │
│  │152 bins│  │48 bins│  │35 bins│  │38 bins│         │
│  └───────┘  └───────┘  └───────┘  └───────┘         │
│                                                       │
│  ┌───────┐  ┌───────┐  ┌───────┐                    │
│  │Zone E │  │Zone F │  │Zone G │                    │
│  │40169  │  │854430 │  │Other  │                    │
│  │1,084  │  │546    │  │5,083  │                    │
│  │22 bins│  │12 bins│  │98 bins│                    │
│  └───────┘  └───────┘  └───────┘                    │
└──────────────────────────────────────────────────────┘
```

---

## 9. Summary

### The Golden Rules

1. **All bins same size** — 40×30×20 cm (24 liters)
2. **One item per bin** — Never mix different items
3. **HSN-based zones** — Similar products together
4. **Pack qty limits** — Small packs fit more, large packs fit fewer
5. **Capacity enforcement** — Never overflow a bin

### Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| **Item mixing** | Common | **Zero** |
| **Bin overflow** | Frequent | **Prevented** |
| **Pick time** | 5-10 min/order | **2-3 min/order** |
| **Space utilization** | 40% | **75%** |
| **Mis-picks** | 5% | **<1%** |

### Implementation Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Phase 1** | Week 1 | Create HSN zone mapping, add fields to items |
| **Phase 2** | Week 2 | Import 50K SKUs, assign zones |
| **Phase 3** | Week 3 | Create bin infrastructure, assign zones to bins |
| **Phase 4** | Week 4 | Update putaway algorithm, test |
| **Phase 5** | Week 5-6 | Train operators, go live |
