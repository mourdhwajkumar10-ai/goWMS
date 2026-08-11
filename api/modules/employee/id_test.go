package employee

import "testing"

func TestPad4AndPrefix(t *testing.T) {
	if got := pad4("Rahul"); got != "RAHU" {
		t.Fatalf("pad4 Rahul: %s", got)
	}
	if got := pad4("Sharma"); got != "SHAR" {
		t.Fatalf("pad4 Sharma: %s", got)
	}
	if got := pad4("Jo"); got != "JOXX" {
		t.Fatalf("pad4 Jo: %s", got)
	}
	if got := namePrefix("Rahul", "Sharma"); got != "RAHUSHAR" {
		t.Fatalf("prefix: %s", got)
	}
}

func TestNamePrefixShortNames(t *testing.T) {
	if got := namePrefix("Ann", "Li"); got != "ANNXLIXX" {
		t.Fatalf("prefix Ann Li: %s want ANNXLIXX", got)
	}
}
