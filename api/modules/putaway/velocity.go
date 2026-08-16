package putaway

func velocityShelfBand(velocityTier string) string {
	switch velocityTier {
	case "fast":
		return "middle"
	case "slow":
		return "upper"
	default:
		return "lower"
	}
}

func shelfBandFilter(band string) string {
	switch band {
	case "middle":
		return ` AND (
			lower(wl.level) IN ('middle', 'mid', 'm')
			OR (wl.level ~ '^[0-9]+$' AND wl.level::int BETWEEN 3 AND 4)
		)`
	case "lower":
		return ` AND (
			lower(wl.level) IN ('lower', 'low', 'l', 'bottom')
			OR (wl.level ~ '^[0-9]+$' AND wl.level::int BETWEEN 1 AND 2)
		)`
	case "upper":
		return ` AND (
			lower(wl.level) IN ('upper', 'up', 'u', 'high', 'top')
			OR (wl.level ~ '^[0-9]+$' AND wl.level::int >= 5)
		)`
	default:
		return ""
	}
}
