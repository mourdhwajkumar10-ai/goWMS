package rbac

import (
	"testing"
)

func TestPermissionsForProfile_AdminEdit(t *testing.T) {
	p := AccessProfile{Inbound: AccessEdit, Outbound: AccessEdit, Admin: AccessEdit}
	perms := PermissionsForProfile(p)
	hasStar := false
	for _, c := range perms {
		if c == "*" {
			hasStar = true
		}
	}
	if !hasStar {
		t.Fatalf("admin all-edit should include *, got %v", perms)
	}
}

func TestPermissionsForProfile_AdminViewExcludesManage(t *testing.T) {
	p := AccessProfile{Inbound: AccessNone, Outbound: AccessNone, Admin: AccessView}
	perms := PermissionsForProfile(p)
	for _, c := range perms {
		if c == "employees.manage" || c == "roles.manage" || c == "*" {
			t.Fatalf("admin view must not include %s: %v", c, perms)
		}
	}
}

func TestPermissionsForProfile_PickerOutbound(t *testing.T) {
	p := DefaultProfiles()["picker"]
	perms := PermissionsForProfile(p)
	want := map[string]bool{"picking.access": false, "packing.access": false}
	for _, c := range perms {
		if _, ok := want[c]; ok {
			want[c] = true
		}
		if c == "grn.access" {
			t.Fatalf("picker should not get inbound grn: %v", perms)
		}
	}
	for code, ok := range want {
		if !ok {
			t.Fatalf("missing %s in %v", code, perms)
		}
	}
}

func TestNormalizeLevel(t *testing.T) {
	if NormalizeLevel("EDIT") != AccessEdit {
		t.Fatal("EDIT")
	}
	if NormalizeLevel("nope") != AccessNone {
		t.Fatal("unknown → none")
	}
}
