package shared

import (
	"strconv"
	"strings"
	"time"
)

// ISO weekday: Monday=1 … Sunday=7. Empty days means "not configured".
func OutsideReceivingHours(t time.Time, openHHMM, closeHHMM, daysCSV string) bool {
	daysCSV = strings.TrimSpace(daysCSV)
	openHHMM = strings.TrimSpace(openHHMM)
	closeHHMM = strings.TrimSpace(closeHHMM)
	if daysCSV == "" || openHHMM == "" || closeHHMM == "" {
		return false
	}
	iso := int(t.Weekday())
	if iso == 0 {
		iso = 7
	}
	allowed := false
	for _, p := range strings.Split(daysCSV, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err == nil && n == iso {
			allowed = true
			break
		}
	}
	if !allowed {
		return true
	}
	openM, okO := parseHHMM(openHHMM)
	closeM, okC := parseHHMM(closeHHMM)
	if !okO || !okC {
		return false
	}
	nowM := t.Hour()*60 + t.Minute()
	if openM == closeM {
		return false
	}
	if openM < closeM {
		return nowM < openM || nowM >= closeM
	}
	// Overnight window, e.g. 22:00–06:00.
	return nowM < openM && nowM >= closeM
}

func parseHHMM(s string) (int, bool) {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, ' '); i >= 0 {
		s = s[:i]
	}
	parts := strings.Split(s, ":")
	if len(parts) < 2 {
		return 0, false
	}
	h, errH := strconv.Atoi(parts[0])
	m, errM := strconv.Atoi(parts[1])
	if errH != nil || errM != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

func NamesMatch(a, b string) bool {
	na := strings.ToLower(strings.TrimSpace(a))
	nb := strings.ToLower(strings.TrimSpace(b))
	if na == "" || nb == "" {
		return false
	}
	return na == nb
}
