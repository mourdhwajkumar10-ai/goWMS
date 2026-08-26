package countersale

import (
	"context"
	"testing"

	"goWMS/api/internal/testdb"
)

// TestRenderInvoicePDFAgainstRealInvoiceRow generates a PDF from an actual
// sales_invoices/sales_invoice_items row (same shape issueGSTInvoice writes)
// and asserts a well-formed, non-trivial PDF comes out.
func TestRenderInvoicePDFAgainstRealInvoiceRow(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	if _, err := tx.Exec(ctx, `
		ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS hsn_no varchar(32)`); err != nil {
		t.Fatalf("ensure hsn_no: %v", err)
	}

	var invID int
	invName := "SI-PDF-TEST-0001"
	if err := tx.QueryRow(ctx, `
		INSERT INTO sales_invoices
		  (name, customer_name, status, grand_total, posting_date,
		   customer_gstin, place_of_supply, net_total, total_taxes,
		   payment_mode, against_sales_order, warehouse_id)
		VALUES ($1,'Walk-in','Submitted',118,CURRENT_DATE,'27ABCDE1234F1Z5','Maharashtra',100,18,'Cash',$2,$3)
		RETURNING id`, invName, f.SalesOrderNo, f.WarehouseID).Scan(&invID); err != nil {
		t.Fatalf("insert invoice: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO sales_invoice_items
		  (sales_invoice_id, item_code, item_name, qty, rate, amount, hsn_no, gst_percentage, tax_amount)
		VALUES ($1,$2,$2,10,10,100,'8471',18,18)`, invID, f.ItemCode); err != nil {
		t.Fatalf("insert invoice item: %v", err)
	}

	rows, err := tx.Query(ctx, `
		SELECT item_code, item_name, qty, rate, amount, COALESCE(hsn_no,''), COALESCE(gst_percentage,0), COALESCE(tax_amount,0)
		FROM sales_invoice_items WHERE sales_invoice_id=$1 ORDER BY id`, invID)
	if err != nil {
		t.Fatalf("query lines: %v", err)
	}
	defer rows.Close()
	var lines []invoicePDFLine
	for rows.Next() {
		var l invoicePDFLine
		if err := rows.Scan(&l.ItemCode, &l.ItemName, &l.Qty, &l.Rate, &l.Amount, &l.HSN, &l.GSTPct, &l.TaxAmount); err != nil {
			t.Fatalf("scan line: %v", err)
		}
		lines = append(lines, l)
	}
	if len(lines) != 1 {
		t.Fatalf("expected 1 invoice line, got %d", len(lines))
	}

	data := &invoicePDFData{
		Name: invName, CustomerName: "Walk-in", CustomerGSTIN: "27ABCDE1234F1Z5",
		PlaceOfSupply: "Maharashtra", PaymentMode: "Cash", PostingDate: "2026-08-26",
		WarehouseName: f.WarehouseName, AgainstSO: f.SalesOrderNo,
		NetTotal: 100, TotalTaxes: 18, GrandTotal: 118, Lines: lines,
	}
	pdfBytes, err := renderInvoicePDF(data)
	if err != nil {
		t.Fatalf("renderInvoicePDF: %v", err)
	}
	if len(pdfBytes) < 500 {
		t.Fatalf("PDF suspiciously small: %d bytes", len(pdfBytes))
	}
	if string(pdfBytes[:5]) != "%PDF-" {
		t.Fatalf("output does not start with %%PDF- header: %q", string(pdfBytes[:5]))
	}
}
