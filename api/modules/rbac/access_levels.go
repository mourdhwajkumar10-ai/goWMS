package rbac

import (
	"encoding/json"
	"fmt"
	"strings"
)

// AccessLevel is None / View / Edit for a high-level area.
type AccessLevel string

const (
	AccessNone AccessLevel = "none"
	AccessView AccessLevel = "view"
	AccessEdit AccessLevel = "edit"
)

// AccessProfile is the high-level UX model for a role.
type AccessProfile struct {
	Inbound  AccessLevel `json:"inbound"`
	Outbound AccessLevel `json:"outbound"`
	Admin    AccessLevel `json:"admin"`
}

func NormalizeLevel(s string) AccessLevel {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "view":
		return AccessView
	case "edit":
		return AccessEdit
	default:
		return AccessNone
	}
}

func ParseAccessProfile(raw []byte) AccessProfile {
	var p AccessProfile
	if len(raw) == 0 || string(raw) == "{}" {
		return AccessProfile{Inbound: AccessNone, Outbound: AccessNone, Admin: AccessNone}
	}
	_ = json.Unmarshal(raw, &p)
	p.Inbound = NormalizeLevel(string(p.Inbound))
	p.Outbound = NormalizeLevel(string(p.Outbound))
	p.Admin = NormalizeLevel(string(p.Admin))
	return p
}

func (p AccessProfile) JSON() []byte {
	p.Inbound = NormalizeLevel(string(p.Inbound))
	p.Outbound = NormalizeLevel(string(p.Outbound))
	p.Admin = NormalizeLevel(string(p.Admin))
	b, _ := json.Marshal(p)
	return b
}

func ValidateAccessProfile(p AccessProfile) error {
	for _, l := range []AccessLevel{p.Inbound, p.Outbound, p.Admin} {
		switch NormalizeLevel(string(l)) {
		case AccessNone, AccessView, AccessEdit:
		default:
			return fmt.Errorf("invalid access level: %s", l)
		}
	}
	return nil
}

var inboundEdit = []string{"grn.access", "qi.access", "putaway.access"}
var outboundEdit = []string{
	"sales_orders.access", "picking.access", "packing.access",
	"dispatch.access", "backorders.access", "returns.access",
}
var adminEdit = []string{
	"masters.access", "employees.manage", "roles.manage",
	"analytics.access", "notifications.access", "import_export.access",
}
var adminView = []string{
	"masters.access", "analytics.access", "notifications.access", "import_export.access",
}

// PermissionsForProfile expands high-level area levels into permission codes.
// View grants same module *.access as Edit for inbound/outbound;
// Admin View excludes employees.manage and roles.manage.
func PermissionsForProfile(p AccessProfile) []string {
	p.Inbound = NormalizeLevel(string(p.Inbound))
	p.Outbound = NormalizeLevel(string(p.Outbound))
	p.Admin = NormalizeLevel(string(p.Admin))

	seen := map[string]struct{}{}
	var out []string
	add := func(codes []string) {
		for _, c := range codes {
			if _, ok := seen[c]; ok {
				continue
			}
			seen[c] = struct{}{}
			out = append(out, c)
		}
	}

	switch p.Inbound {
	case AccessView, AccessEdit:
		add(inboundEdit)
	}
	switch p.Outbound {
	case AccessView, AccessEdit:
		add(outboundEdit)
	}
	switch p.Admin {
	case AccessEdit:
		add(adminEdit)
	case AccessView:
		add(adminView)
	}

	// Full bypass only when everything is Edit (admin-equivalent)
	if p.Inbound == AccessEdit && p.Outbound == AccessEdit && p.Admin == AccessEdit {
		add([]string{"*"})
	}
	return out
}

// DefaultProfiles for seed-defaults.
func DefaultProfiles() map[string]AccessProfile {
	return map[string]AccessProfile{
		"admin":      {Inbound: AccessEdit, Outbound: AccessEdit, Admin: AccessEdit},
		"supervisor": {Inbound: AccessEdit, Outbound: AccessEdit, Admin: AccessView},
		"wm":         {Inbound: AccessEdit, Outbound: AccessEdit, Admin: AccessView},
		"picker":     {Inbound: AccessNone, Outbound: AccessEdit, Admin: AccessNone},
		"packer":     {Inbound: AccessNone, Outbound: AccessEdit, Admin: AccessNone},
		"qi":         {Inbound: AccessEdit, Outbound: AccessNone, Admin: AccessNone},
		"dispatcher": {Inbound: AccessNone, Outbound: AccessEdit, Admin: AccessNone},
		"driver":     {Inbound: AccessNone, Outbound: AccessEdit, Admin: AccessNone},
		"billing":    {Inbound: AccessNone, Outbound: AccessEdit, Admin: AccessNone},
	}
}

// DefaultRoleMeta name/description for seed.
func DefaultRoleMeta() map[string]struct{ Name, Desc string } {
	return map[string]struct{ Name, Desc string }{
		"admin":      {"Admin", "Full system access; manage roles and employees"},
		"supervisor": {"Supervisor", "Warehouse supervisor (floor + masters)"},
		"picker":     {"Picker", "Picking operations"},
		"packer":     {"Packer", "Packing operations"},
		"qi":         {"QI", "Quality inspection"},
		"dispatcher": {"Dispatcher", "Dispatch / delivery notes"},
		"wm":         {"Warehouse Manager", "Legacy alias of supervisor"},
		"driver":     {"Driver", "Legacy alias of dispatcher"},
		"billing":    {"Billing", "Sales orders and billing"},
	}
}
