package fulfillment

import (
	"context"
	"time"

	"goWMS/api/modules/shared"
)

// AllocLine is one FEFO slice written to pick_list_items.
type AllocLine struct {
	ItemCode     string
	OrderedQty   float64
	AllocatedQty float64
	LocationID   int
	LocationCode string
	BalanceID    int
	BatchNo      string
	ExpiryDate   *time.Time
	ShortageQty  float64
	Status       string // pending | shortage
}

// AllocateFEFO reserves FEFO slices for a demand line and returns alloc/shortage rows.
func AllocateFEFO(ctx context.Context, tx shared.DBTX, warehouseID int, itemCode string, need float64) ([]AllocLine, error) {
	if need <= 0 {
		return nil, nil
	}
	cands, err := shared.ListFEFOCandidates(ctx, tx, warehouseID, itemCode, true)
	if err != nil {
		return nil, err
	}
	remaining := need
	var out []AllocLine
	for _, cand := range cands {
		if remaining <= 0 {
			break
		}
		take := cand.Available
		if take > remaining {
			take = remaining
		}
		if err := shared.ReserveBalance(ctx, tx, cand.BalanceID, take); err != nil {
			return nil, err
		}
		out = append(out, AllocLine{
			ItemCode:     itemCode,
			OrderedQty:   take,
			AllocatedQty: take,
			LocationID:   cand.LocationID,
			LocationCode: cand.LocationCode,
			BalanceID:    cand.BalanceID,
			BatchNo:      cand.BatchNo,
			ExpiryDate:   cand.ExpiryDate,
			Status:       "pending",
		})
		remaining -= take
	}
	if remaining > 0 {
		out = append(out, AllocLine{
			ItemCode:    itemCode,
			OrderedQty:  remaining,
			ShortageQty: remaining,
			Status:      "shortage",
		})
	}
	return out, nil
}
