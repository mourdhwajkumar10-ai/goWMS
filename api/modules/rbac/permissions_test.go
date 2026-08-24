package rbac

import (
	"testing"
)

func TestStoreCodesReturnsSortedPermissionCodes(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"receiving_operator": {
			"receiving.scan_item": {},
			"receiving.view":      {},
			"receiving.scan_box":  {},
		},
	}}

	got := store.Codes("receiving_operator")
	want := []string{"receiving.scan_box", "receiving.scan_item", "receiving.view"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestHasPermissionReturnsFalseForUnassignedPermission(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"qi": {"grn.access": {}, "qi.access": {}},
	}}
	// Replace global for test
	old := global
	global = store
	defer func() { global = old }()

	if store.Has("qi", "receiving.approve") {
		t.Fatal("qi should not have receiving.approve")
	}
	if store.Has("qi", "po.create") {
		t.Fatal("qi should not have po.create")
	}
}

func TestHasPermissionReturnsTrueForAssignedPermission(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"receiving_operator": {"receiving.view": {}, "receiving.scan_box": {}},
	}}
	old := global
	global = store
	defer func() { global = old }()

	if !store.Has("receiving_operator", "receiving.view") {
		t.Fatal("receiving_operator should have receiving.view")
	}
	if !store.Has("receiving_operator", "receiving.scan_box") {
		t.Fatal("receiving_operator should have receiving.scan_box")
	}
}

func TestHasPermissionAdminAlwaysPasses(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"admin": {},
	}}

	if !store.Has("admin", "anything.any") {
		t.Fatal("admin should always pass")
	}
	if !store.Has("ADMIN", "anything.any") {
		t.Fatal("ADMIN (case-insensitive) should always pass")
	}
}

func TestHasPermissionEmptyRoleOrPermReturnsFalse(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{}}
	if store.Has("", "grn.access") {
		t.Fatal("empty role should return false")
	}
	if store.Has("qi", "") {
		t.Fatal("empty perm should return false")
	}
}

func TestHasPermissionNilStoreReturnsFalse(t *testing.T) {
	var store *Store
	if store.Has("qi", "grn.access") {
		t.Fatal("nil store should return false")
	}
}

func TestHasPermissionWildcardStar(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"supervisor": {"*": {}},
	}}
	if !store.Has("supervisor", "anything.at.all") {
		t.Fatal("supervisor with * should pass any permission")
	}
}

func TestHasPermissionCaseInsensitiveRole(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"qi": {"grn.access": {}},
	}}

	if !store.Has("QI", "grn.access") {
		t.Fatal("QI (upper) should match qi role")
	}
	if !store.Has("Qi", "grn.access") {
		t.Fatal("Qi (mixed) should match qi role")
	}
}

func TestHasPermissionMissingRole(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"qi": {"grn.access": {}},
	}}

	if store.Has("nonexistent", "grn.access") {
		t.Fatal("nonexistent role should return false")
	}
}

func TestCodesNilStore(t *testing.T) {
	var store *Store
	got := store.Codes("qi")
	if got != nil {
		t.Fatal("nil store Codes should return nil")
	}
}

func TestCodesUnknownRole(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{}}
	got := store.Codes("unknown")
	if got != nil {
		t.Fatalf("unknown role should return nil, got %v", got)
	}
}

func TestReceivingOperatorCanScanButCannotApprove(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"receiving_operator": {
			"receiving.view":      {},
			"receiving.start":     {},
			"receiving.scan_box":  {},
			"receiving.scan_item": {},
			"receiving.reject_item": {},
			"receiving.complete":  {},
			"po.view":             {},
		},
	}}

	if !store.Has("receiving_operator", "receiving.scan_box") {
		t.Fatal("receiving_operator should have receiving.scan_box")
	}
	if !store.Has("receiving_operator", "receiving.scan_item") {
		t.Fatal("receiving_operator should have receiving.scan_item")
	}
	if store.Has("receiving_operator", "receiving.approve") {
		t.Fatal("receiving_operator should NOT have receiving.approve")
	}
}

func TestSupervisorCanApproveReceiving(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"supervisor": {
			"receiving.view":    {},
			"receiving.approve": {},
			"receiving.scan_box":  {},
			"receiving.scan_item": {},
			"reports.view":      {},
		},
	}}

	if !store.Has("supervisor", "receiving.approve") {
		t.Fatal("supervisor should have receiving.approve")
	}
	if !store.Has("supervisor", "receiving.scan_box") {
		t.Fatal("supervisor should have receiving.scan_box")
	}
}

func TestViewerCannotMutateReceiving(t *testing.T) {
	store := &Store{byRole: map[string]map[string]struct{}{
		"viewer": {
			"receiving.view": {},
			"inventory.view": {},
			"reports.view":   {},
			"po.view":        {},
		},
	}}

	if !store.Has("viewer", "receiving.view") {
		t.Fatal("viewer should have receiving.view")
	}
	if store.Has("viewer", "receiving.start") {
		t.Fatal("viewer should NOT have receiving.start")
	}
	if store.Has("viewer", "inventory.adjust") {
		t.Fatal("viewer should NOT have inventory.adjust")
	}
	if store.Has("viewer", "masterdata.manage") {
		t.Fatal("viewer should NOT have masterdata.manage")
	}
}