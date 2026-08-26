package countersale

// GST invoice PDF download — blocker #4: counter sale had no receipt/print
// option. Generates a compact A5 tax-invoice PDF directly from the
// sales_invoices/sales_invoice_items rows written by issueGSTInvoice.

import (
	"bytes"
	"fmt"
	"strconv"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jung-kurt/gofpdf"
)

type invoicePDFLine struct {
	ItemCode, ItemName, HSN string
	Qty, Rate, Amount, GSTPct, TaxAmount float64
}

type invoicePDFData struct {
	Name, CustomerName, CustomerGSTIN, PlaceOfSupply, PaymentMode, PostingDate, WarehouseName, AgainstSO string
	NetTotal, TotalTaxes, GrandTotal float64
	Lines []invoicePDFLine
}

func downloadInvoicePDF(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")
		if name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "invoice name required")
		}
		data, err := loadInvoicePDFData(c, db, name)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, err.Error())
		}
		pdfBytes, err := renderInvoicePDF(data)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		c.Set("Content-Type", "application/pdf")
		c.Set("Content-Disposition", `attachment; filename="`+data.Name+`.pdf"`)
		return c.Send(pdfBytes)
	}
}

func loadInvoicePDFData(c *fiber.Ctx, db *pgxpool.Pool, name string) (*invoicePDFData, error) {
	var d invoicePDFData
	var whID *int
	err := db.QueryRow(c.Context(), `
		SELECT name, customer_name, COALESCE(customer_gstin,''), COALESCE(place_of_supply,''),
		       COALESCE(payment_mode,''), posting_date::text, COALESCE(net_total,0),
		       COALESCE(total_taxes,0), COALESCE(grand_total,0), warehouse_id, COALESCE(against_sales_order,'')
		FROM sales_invoices WHERE name=$1`, name).
		Scan(&d.Name, &d.CustomerName, &d.CustomerGSTIN, &d.PlaceOfSupply,
			&d.PaymentMode, &d.PostingDate, &d.NetTotal, &d.TotalTaxes, &d.GrandTotal, &whID, &d.AgainstSO)
	if err != nil {
		return nil, fmt.Errorf("invoice %s not found", name)
	}
	if whID != nil {
		_ = db.QueryRow(c.Context(), `SELECT COALESCE(name, code) FROM warehouses WHERE id=$1`, *whID).Scan(&d.WarehouseName)
	}

	rows, err := db.Query(c.Context(), `
		SELECT item_code, item_name, qty, rate, amount, COALESCE(hsn_no,''), COALESCE(gst_percentage,0), COALESCE(tax_amount,0)
		FROM sales_invoice_items WHERE sales_invoice_id = (SELECT id FROM sales_invoices WHERE name=$1)
		ORDER BY id`, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var l invoicePDFLine
		if err := rows.Scan(&l.ItemCode, &l.ItemName, &l.Qty, &l.Rate, &l.Amount, &l.HSN, &l.GSTPct, &l.TaxAmount); err != nil {
			return nil, err
		}
		d.Lines = append(d.Lines, l)
	}
	return &d, nil
}

func renderInvoicePDF(d *invoicePDFData) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A5", "")
	pdf.SetMargins(10, 10, 10)
	pdf.AddPage()

	pdf.SetFont("Helvetica", "B", 14)
	title := d.WarehouseName
	if title == "" {
		title = "goWMS"
	}
	pdf.CellFormat(0, 8, title, "", 1, "C", false, 0, "")
	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(0, 6, "TAX INVOICE", "", 1, "C", false, 0, "")
	pdf.Ln(2)

	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(95, 5, "Invoice: "+d.Name, "", 0, "L", false, 0, "")
	pdf.CellFormat(0, 5, "Date: "+d.PostingDate, "", 1, "R", false, 0, "")
	pdf.CellFormat(95, 5, "Customer: "+d.CustomerName, "", 0, "L", false, 0, "")
	pdf.CellFormat(0, 5, "Payment: "+d.PaymentMode, "", 1, "R", false, 0, "")
	if d.CustomerGSTIN != "" {
		pdf.CellFormat(95, 5, "GSTIN: "+d.CustomerGSTIN, "", 0, "L", false, 0, "")
	} else {
		pdf.CellFormat(95, 5, "", "", 0, "L", false, 0, "")
	}
	if d.PlaceOfSupply != "" {
		pdf.CellFormat(0, 5, "Place of supply: "+d.PlaceOfSupply, "", 1, "R", false, 0, "")
	} else {
		pdf.Ln(5)
	}
	pdf.Ln(2)

	pdf.SetFont("Helvetica", "B", 8)
	pdf.SetFillColor(235, 235, 235)
	widths := []float64{22, 46, 16, 12, 16, 18, 18}
	headers := []string{"Item", "Description", "HSN", "Qty", "Rate", "GST%", "Amount"}
	for i, h := range headers {
		pdf.CellFormat(widths[i], 6, h, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	pdf.SetFont("Helvetica", "", 8)
	for _, l := range d.Lines {
		pdf.CellFormat(widths[0], 6, l.ItemCode, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[1], 6, truncate(l.ItemName, 34), "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[2], 6, l.HSN, "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[3], 6, formatQty(l.Qty), "1", 0, "R", false, 0, "")
		pdf.CellFormat(widths[4], 6, formatMoney(l.Rate), "1", 0, "R", false, 0, "")
		pdf.CellFormat(widths[5], 6, formatQty(l.GSTPct)+"%", "1", 0, "R", false, 0, "")
		pdf.CellFormat(widths[6], 6, formatMoney(l.Amount+l.TaxAmount), "1", 0, "R", false, 0, "")
		pdf.Ln(-1)
	}
	pdf.Ln(3)

	pdf.SetFont("Helvetica", "", 9)
	labelW := float64(108)
	pdf.CellFormat(labelW, 5, "Net total", "", 0, "R", false, 0, "")
	pdf.CellFormat(18, 5, formatMoney(d.NetTotal), "", 1, "R", false, 0, "")
	pdf.CellFormat(labelW, 5, "Total tax (GST)", "", 0, "R", false, 0, "")
	pdf.CellFormat(18, 5, formatMoney(d.TotalTaxes), "", 1, "R", false, 0, "")
	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(labelW, 6, "Grand total", "", 0, "R", false, 0, "")
	pdf.CellFormat(18, 6, formatMoney(d.GrandTotal), "", 1, "R", false, 0, "")

	pdf.Ln(6)
	pdf.SetFont("Helvetica", "I", 7)
	pdf.CellFormat(0, 4, "Computer-generated invoice — no signature required.", "", 1, "C", false, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}

func formatMoney(v float64) string {
	return strconv.FormatFloat(v, 'f', 2, 64)
}

func formatQty(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}
