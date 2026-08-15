package grn

import "strings"

type partBoxQty struct {
	PartNo   string
	BoxNo    string
	Expected float64
	Scanned  float64
}

type partBoxRecon struct {
	BoxNo    string  `json:"box_no"`
	Expected float64 `json:"expected_qty"`
	Scanned  float64 `json:"scanned_qty"`
	OK       bool    `json:"ok"`
	Status   string  `json:"status"`
}

type partRecon struct {
	PartNo   string         `json:"part_no"`
	Expected float64        `json:"expected_qty"`
	Scanned  float64        `json:"scanned_qty"`
	OK       bool           `json:"ok"`
	Boxes    []partBoxRecon `json:"boxes"`
}

func boxReconStatus(expected, scanned float64) (ok bool, status string) {
	if expected > 0 && scanned == expected {
		return true, "ok"
	}
	if expected > 0 && scanned > expected {
		return false, "excess"
	}
	if scanned > 0 && expected > 0 && scanned < expected {
		return false, "shortage"
	}
	if expected > 0 && scanned == 0 {
		return false, "pending"
	}
	return false, "pending"
}

// rollupPartReconciliation groups box lines by part so the same SKU in
// multiple boxes can be verified independently and totalled (spec §13).
func rollupPartReconciliation(lines []partBoxQty) []partRecon {
	order := []string{}
	grouped := map[string][]partBoxQty{}
	for _, ln := range lines {
		part := strings.TrimSpace(ln.PartNo)
		if part == "" {
			continue
		}
		if _, ok := grouped[part]; !ok {
			order = append(order, part)
		}
		grouped[part] = append(grouped[part], ln)
	}
	out := make([]partRecon, 0, len(order))
	for _, part := range order {
		boxes := grouped[part]
		var exp, scan float64
		boxMaps := make([]partBoxRecon, 0, len(boxes))
		for _, b := range boxes {
			exp += b.Expected
			scan += b.Scanned
			ok, st := boxReconStatus(b.Expected, b.Scanned)
			boxNo := strings.TrimSpace(b.BoxNo)
			if boxNo == "" {
				boxNo = "CONSOLIDATED"
			}
			boxMaps = append(boxMaps, partBoxRecon{
				BoxNo: boxNo, Expected: b.Expected, Scanned: b.Scanned, OK: ok, Status: st,
			})
		}
		ok, _ := boxReconStatus(exp, scan)
		out = append(out, partRecon{
			PartNo: part, Expected: exp, Scanned: scan, OK: ok, Boxes: boxMaps,
		})
	}
	return out
}
