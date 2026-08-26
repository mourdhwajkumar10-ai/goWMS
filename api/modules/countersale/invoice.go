package countersale

import (
	"context"
	"fmt"

	"goWMS/api/modules/shared"
)

type invoiceInput struct {
	SalesOrderNo  string
	CustomerName  string
	CustomerGSTIN string
	PlaceOfSupply string
	PaymentMode   string
	WarehouseID   *int
	PickListID    int
}

type invoiceResult struct {
	ID         int     `json:"id"`
	Name       string  `json:"name"`
	NetTotal   float64 `json:"net_total"`
	TotalTaxes float64 `json:"total_taxes"`
	GrandTotal float64 `json:"grand_total"`
}

func issueGSTInvoice(ctx context.Context, tx shared.DBTX, in invoiceInput) (*invoiceResult, error) {
	var soID int
	err := tx.QueryRow(ctx, `SELECT id FROM sales_orders WHERE name=$1`, in.SalesOrderNo).Scan(&soID)
	if err != nil {
		return nil, fmt.Errorf("sales order: %w", err)
	}

	rows, err := tx.Query(ctx, `
		SELECT soi.item_code, COALESCE(soi.item_name, soi.item_code),
		       COALESCE(soi.qty,0), COALESCE(soi.rate,0), COALESCE(soi.amount,0),
		       COALESCE(soi.discount_percentage,0),
		       COALESCE(i.hsn_no,''), COALESCE(i.gst_percentage,0), COALESCE(i.mrp,0)
		FROM sales_order_items soi
		LEFT JOIN items i ON i.code = soi.item_code
		WHERE soi.sales_order_id=$1`, soID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type line struct {
		Code, Name, HSN string
		Qty, Rate, Amt, Disc, GST, MRP float64
	}
	var lines []line
	var net, tax float64
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.Code, &l.Name, &l.Qty, &l.Rate, &l.Amt, &l.Disc, &l.HSN, &l.GST, &l.MRP); err != nil {
			return nil, err
		}
		// Prefer picked qty when available on the pick list.
		var picked float64
		_ = tx.QueryRow(ctx, `
			SELECT COALESCE(SUM(picked_qty),0) FROM pick_list_items
			WHERE pick_list_id=$1 AND item_code=$2`, in.PickListID, l.Code).Scan(&picked)
		if picked > 0 && picked+0.0001 < l.Qty {
			l.Qty = picked
			l.Amt = l.Rate * l.Qty
		}
		if l.Qty <= 0 {
			continue
		}
		lTax := l.Amt * l.GST / 100
		lines = append(lines, l)
		net += l.Amt
		tax += lTax
	}
	if len(lines) == 0 {
		return nil, fmt.Errorf("no invoice lines")
	}

	var invName string
	if err := tx.QueryRow(ctx, `
		SELECT 'SI-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('sales_invoice_no_seq')::TEXT,5,'0')`).
		Scan(&invName); err != nil {
		return nil, err
	}
	grand := net + tax
	var invID int
	err = tx.QueryRow(ctx, `
		INSERT INTO sales_invoices
		  (name, customer_name, status, grand_total, posting_date,
		   customer_gstin, place_of_supply, net_total, total_taxes,
		   payment_mode, against_sales_order, warehouse_id)
		VALUES ($1,$2,'Submitted',$3,CURRENT_DATE,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id`,
		invName, in.CustomerName, grand,
		nullEmpty(in.CustomerGSTIN), nullEmpty(in.PlaceOfSupply),
		net, tax, in.PaymentMode, in.SalesOrderNo, in.WarehouseID).Scan(&invID)
	if err != nil {
		return nil, err
	}

	for _, l := range lines {
		taxAmt := l.Amt * l.GST / 100
		_, err = tx.Exec(ctx, `
			INSERT INTO sales_invoice_items
			  (sales_invoice_id, item_code, item_name, qty, rate, amount,
			   price_list_rate, discount_percentage, net_rate, net_amount,
			   hsn_no, gst_percentage, tax_amount)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$5,$6,$9,$10,$11)`,
			invID, l.Code, l.Name, l.Qty, l.Rate, l.Amt,
			l.MRP, l.Disc, l.HSN, l.GST, taxAmt)
		if err != nil {
			return nil, err
		}
	}

	return &invoiceResult{
		ID: invID, Name: invName, NetTotal: net, TotalTaxes: tax, GrandTotal: grand,
	}, nil
}

func nullEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
