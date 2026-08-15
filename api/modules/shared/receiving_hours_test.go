package shared

import (
	"testing"
	"time"
)

func TestOutsideReceivingHours(t *testing.T) {
	// Wednesday 10:00 inside Mon-Fri 06:00-18:00
	wed := time.Date(2026, 8, 12, 10, 0, 0, 0, time.Local)
	if OutsideReceivingHours(wed, "06:00", "18:00", "1,2,3,4,5") {
		t.Fatal("10:00 Wednesday should be inside hours")
	}
	late := time.Date(2026, 8, 12, 19, 0, 0, 0, time.Local)
	if !OutsideReceivingHours(late, "06:00", "18:00", "1,2,3,4,5") {
		t.Fatal("19:00 Wednesday should be outside hours")
	}
	sat := time.Date(2026, 8, 15, 10, 0, 0, 0, time.Local)
	if !OutsideReceivingHours(sat, "06:00", "18:00", "1,2,3,4,5") {
		t.Fatal("Saturday should be outside Mon-Fri")
	}
	if OutsideReceivingHours(wed, "", "18:00", "1,2,3,4,5") {
		t.Fatal("empty open means not configured")
	}
	overnight := time.Date(2026, 8, 12, 23, 0, 0, 0, time.Local)
	if OutsideReceivingHours(overnight, "22:00", "06:00", "1,2,3,4,5") {
		t.Fatal("23:00 should be inside 22:00–06:00")
	}
	tooEarly := time.Date(2026, 8, 12, 7, 0, 0, 0, time.Local)
	if !OutsideReceivingHours(tooEarly, "22:00", "06:00", "1,2,3,4,5") {
		t.Fatal("07:00 should be outside 22:00–06:00")
	}
}

func TestNamesMatch(t *testing.T) {
	if !NamesMatch(" Hero MotoCorp ", "hero motocorp") {
		t.Fatal("expected match")
	}
	if NamesMatch("Hero", "Honda") {
		t.Fatal("expected mismatch")
	}
}
