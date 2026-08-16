package po

import "strings"

type poCreateItem struct {
	ItemCode  string
	ItemName  string
	Qty       float64
	Rate      float64
	Amount    float64
	Warehouse string
	UOM       string
	BatchNo   string
}

// mergeDuplicatePOItems collapses repeated SKUs into one line and adds qty.
// Same item_code (case-insensitive) never becomes a second row.
func mergeDuplicatePOItems(items []poCreateItem) []poCreateItem {
	out := make([]poCreateItem, 0, len(items))
	idx := map[string]int{}
	for _, it := range items {
		code := strings.TrimSpace(it.ItemCode)
		if code == "" {
			continue
		}
		it.ItemCode = code
		if it.Amount == 0 {
			it.Amount = it.Qty * it.Rate
		}
		key := strings.ToUpper(code)
		if i, ok := idx[key]; ok {
			out[i].Qty += it.Qty
			if out[i].Rate == 0 && it.Rate != 0 {
				out[i].Rate = it.Rate
			}
			out[i].Amount = out[i].Qty * out[i].Rate
			if strings.TrimSpace(out[i].ItemName) == "" {
				out[i].ItemName = it.ItemName
			}
			if strings.TrimSpace(out[i].Warehouse) == "" {
				out[i].Warehouse = it.Warehouse
			}
			if strings.TrimSpace(out[i].UOM) == "" {
				out[i].UOM = it.UOM
			}
			if strings.TrimSpace(out[i].BatchNo) == "" {
				out[i].BatchNo = it.BatchNo
			}
			continue
		}
		idx[key] = len(out)
		out = append(out, it)
	}
	return out
}
