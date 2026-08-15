package masterdata

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBajajPriceListHeaders(t *testing.T) {
	rows := mapsFromTable([][]string{
		{"Sr. No.", "Item Code", "Item Description", "Item Segment", "Basic Price - per unit", "MRP - per unit", "HSN Code", "GST %", "VEH_DLR Set Qty", "Distributor Set Qty"},
		{"1", "01100342", "BEARING BALL", "COM", "101.43", "152", "84821020", "18", "1", "10"},
	})
	if len(rows) != 1 {
		t.Fatalf("rows=%d", len(rows))
	}
	row := rows[0]
	if got := itemCodeFrom(row); got != "01100342" {
		t.Fatalf("code=%q", got)
	}
	if got := itemNameFrom(row); got != "BEARING BALL" {
		t.Fatalf("name=%q", got)
	}
	if got := firstKey(row, "Item Segment"); got != "COM" {
		t.Fatalf("segment=%q", got)
	}
	if got := parseFloatKey(row, "mrp", "MRP - per unit"); got != 152 {
		t.Fatalf("mrp=%v", got)
	}
	// Basic Price is cost price (CP), not unit selling price.
	if got := parseFloatKey(row, "valuation_rate", "cost_price", "cp", "CP", "Basic Price", "Basic Price - per unit", "Basic Price - per"); got != 101.43 {
		t.Fatalf("cost price=%v", got)
	}
	if got := parseFloatKey(row, "standard_rate", "Unit Selling Price", "Selling Price", "Standard Rate"); got != 0 {
		t.Fatalf("selling price should stay blank on this sheet, got %v", got)
	}
	if got := parseFloatKey(row, "min_order_qty", "moq", "MOQ", "VEH_DLR Set Qty"); got != 1 {
		t.Fatalf("moq=%v", got)
	}
	if got := firstKey(row, "hsn", "HSN Code"); got != "84821020" {
		t.Fatalf("hsn=%q", got)
	}
	if got := parseFloatKey(row, "gst", "GST %"); got != 18 {
		t.Fatalf("gst=%v", got)
	}
}

func TestRowsFromPriceListXLSX(t *testing.T) {
	p := filepath.Join("..", "..", "..", "SPARE PARTS PRICE WEF 01-01-2026.xlsx")
	f, err := os.Open(p)
	if err != nil {
		t.Skip(err)
	}
	defer f.Close()
	rows, err := rowsFromXLSX(f)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) < 20000 {
		t.Fatalf("expected ~21k rows, got %d", len(rows))
	}
	if itemCodeFrom(rows[0]) != "01100342" || itemNameFrom(rows[0]) != "BEARING BALL" {
		t.Fatalf("first row code=%q name=%q", itemCodeFrom(rows[0]), itemNameFrom(rows[0]))
	}
	row := rows[0]
	if got := parseFloatKey(row, "mrp", "MRP - per unit"); got != 152 {
		t.Fatalf("xlsx mrp=%v", got)
	}
	if got := parseFloatKey(row, "valuation_rate", "Basic Price - per unit", "Basic Price - per"); got != 101.43 {
		t.Fatalf("xlsx cp=%v", got)
	}
	if got := parseFloatKey(row, "min_order_qty", "MOQ", "VEH_DLR Set Qty"); got != 1 {
		t.Fatalf("xlsx moq=%v", got)
	}
}
