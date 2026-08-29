package shared

import (
	"regexp"
	"strings"
)

// CanonicalBoxNo extracts the box number from a raw QR scan.
// Box QRs are of the form "BOXNO~part~mrp" e.g.
//   S209085-8072331-2004~52JF1941~1213
//   0044832599-E0008~1
//   0044830675-E0012~1
// Only the segment before the first "~" (and also "|" or whitespace) is the
// box identifier. Everything after "~" (part_code, qty, mrp) is ignored.
func CanonicalBoxNo(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	// Split on ~ first - the canonical separator for box QRs
	if idx := strings.Index(s, "~"); idx != -1 {
		s = s[:idx]
	}
	// Also handle pipe or newline separated variants
	if idx := strings.Index(s, "|"); idx != -1 {
		s = s[:idx]
	}
	// Trim any trailing whitespace/newlines and uppercase for case-insensitive match
	s = strings.TrimSpace(s)
	// Remove any embedded spaces/newlines inside (e.g. "S209085- 8072331-2004")
	s = strings.NewReplacer(" ", "", "\n", "", "\r", "", "\t", "").Replace(s)
	s = strings.ToUpper(s)
	return s
}

// BoxNoRegexFallback attempts to extract a box-like token from a raw scan
// when the canonical box number is not found directly. This handles damaged
// labels or QRs where the box number is embedded in a longer string.
// Returns the first match of known box patterns.
var (
	// S-prefixed wave boxes: S209085-8072331-2004
	reBoxS = regexp.MustCompile(`(?i)\bS\d{5,}-\d{4,}-\d{3,}\b`)
	// Numeric E/C boxes: 0044832599-E0008, 004460646-2004, 0044830675-E0012
	reBoxE = regexp.MustCompile(`\b\d{7,10}-[A-Z]\d{3,4}\b`)
	// Generic fallback: any token that looks like BOXNO with hyphen (at least 8 chars, contains hyphen)
	reBoxGeneric = regexp.MustCompile(`\b[A-Z0-9]{5,}-[A-Z0-9]{3,}\b`)
)

// ExtractBoxCandidates returns canonical plus any regex-extracted fallbacks.
// The caller can try each candidate in order against the DB.
func ExtractBoxCandidates(raw string) []string {
	canonical := CanonicalBoxNo(raw)
	seen := map[string]bool{}
	var out []string
	add := func(v string) {
		v = strings.ToUpper(strings.TrimSpace(v))
		if v == "" || seen[v] {
			return
		}
		seen[v] = true
		out = append(out, v)
	}
	if canonical != "" {
		add(canonical)
	}
	// Try regex fallbacks on the raw string
	rawUpper := strings.ToUpper(raw)
	for _, re := range []*regexp.Regexp{reBoxS, reBoxE, reBoxGeneric} {
		for _, m := range re.FindAllString(rawUpper, -1) {
			add(m)
		}
	}
	// Also try without leading S (e.g. QR has S209085-... but DB has 209085-...)
	if strings.HasPrefix(canonical, "S") && len(canonical) > 1 {
		add(strings.TrimPrefix(canonical, "S"))
	}
	return out
}

// CanonicalBoxNoJS is the JS equivalent regex for frontend use.
// Exported as comment for reference: raw.split('~')[0].trim().toUpperCase()
