package rbac

// Permission is a fixed catalog entry (codes are stable; assignment is per-role in DB).
type Permission struct {
	Code        string `json:"code"`
	Module      string `json:"module"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// Catalog is the authoritative permission list exposed by GET /api/permissions.
var Catalog = []Permission{
	{Code: "*", Module: "system", Name: "Full access", Description: "Bypass all module checks"},

	// Coarse module-level permissions (backward-compatible).
	{Code: "masters.access", Module: "masters", Name: "Masters", Description: "Items, warehouses, locations, batches, serial, inventory"},
	{Code: "grn.access", Module: "grn", Name: "GRN / Inbound", Description: "GRN sessions and packing-list import"},
	{Code: "qi.access", Module: "qi", Name: "Quality Inspection", Description: "QI inspections and templates"},
	{Code: "putaway.access", Module: "putaway", Name: "Putaway", Description: "Putaway queue and rules"},
	{Code: "sales_orders.access", Module: "sales_orders", Name: "Sales Orders", Description: "Sales orders and customers"},
	{Code: "picking.access", Module: "picking", Name: "Picking", Description: "Pick lists and wave pick"},
	{Code: "packing.access", Module: "packing", Name: "Packing", Description: "Pack sessions"},
	{Code: "dispatch.access", Module: "dispatch", Name: "Dispatch", Description: "Dispatch and delivery notes"},
	{Code: "backorders.access", Module: "backorders", Name: "Backorders", Description: "Backorder v1/v2"},
	{Code: "returns.access", Module: "returns", Name: "Returns", Description: "Returns intake"},
	{Code: "employees.manage", Module: "employees", Name: "Manage employees", Description: "Create/update employees, assign roles, set PIN"},
	{Code: "roles.manage", Module: "roles", Name: "Manage roles", Description: "CRUD roles and assign permissions"},
	{Code: "analytics.access", Module: "analytics", Name: "Analytics", Description: "Dashboard KPIs and reports"},
	{Code: "notifications.access", Module: "notifications", Name: "Notifications", Description: "In-app notifications"},
	{Code: "import_export.access", Module: "import_export", Name: "Import / Export", Description: "CSV/XLSX import and export endpoints"},

	// Fine-grained receiving permissions.
	{Code: "receiving.view", Module: "receiving", Name: "View receiving", Description: "View receiving sessions and eligible POs"},
	{Code: "receiving.start", Module: "receiving", Name: "Start receiving", Description: "Start or resume a receiving session"},
	{Code: "receiving.scan_box", Module: "receiving", Name: "Scan box", Description: "Scan and record box receipt"},
	{Code: "receiving.scan_item", Module: "receiving", Name: "Scan item", Description: "Scan and verify an item"},
	{Code: "receiving.reject_item", Module: "receiving", Name: "Reject item", Description: "Reject an item and route to reject location"},
	{Code: "receiving.complete", Module: "receiving", Name: "Complete receiving", Description: "Complete box/session receiving steps"},
	{Code: "receiving.approve", Module: "receiving", Name: "Approve receiving", Description: "Approve a packing list for receiving"},

	// Fine-grained PO permissions.
	{Code: "po.view", Module: "po", Name: "View POs", Description: "View purchase orders"},
	{Code: "po.create", Module: "po", Name: "Create POs", Description: "Create purchase orders"},
	{Code: "po.edit", Module: "po", Name: "Edit POs", Description: "Edit or submit purchase orders"},

	// Fine-grained inventory permissions.
	{Code: "inventory.view", Module: "inventory", Name: "View inventory", Description: "View stock and location balances"},
	{Code: "inventory.adjust", Module: "inventory", Name: "Adjust inventory", Description: "Adjust inventory quantities"},

	// Fine-grained admin permissions.
	{Code: "masterdata.manage", Module: "masterdata", Name: "Manage master data", Description: "Manage items, locations, warehouses, and suppliers"},
	{Code: "reports.view", Module: "reports", Name: "View reports", Description: "View operational reports"},
	{Code: "users.manage", Module: "users", Name: "Manage users", Description: "Manage employees and credentials"},
	{Code: "notifications.view", Module: "notifications", Name: "View notifications", Description: "View and acknowledge notifications"},
}

// ValidCodes returns a set of known permission codes.
func ValidCodes() map[string]struct{} {
	m := make(map[string]struct{}, len(Catalog))
	for _, p := range Catalog {
		m[p.Code] = struct{}{}
	}
	return m
}

// PathPermission maps the first /api segment to a required permission code.
// Unlisted segments are allowed for any authenticated user when RBAC is on
// (comments, attachments, health, auth are handled separately).
var PathPermission = map[string]string{
	"masterdata":      "masters.access",
	"grn":             "grn.access",
	"packing-list":    "grn.access",
	"qi":              "qi.access",
	"putaway":         "putaway.access",
	"putaway-rules":   "putaway.access",
	"sales-orders":    "sales_orders.access",
	"customer":        "sales_orders.access",
	"picking":         "picking.access",
	"packing":         "packing.access",
	"dispatch":        "dispatch.access",
	"backorder":       "backorders.access",
	"returns":         "returns.access",
	"employees":     "employees.manage",
	// roles + permissions: mutations gated by requireManageRoles; GET list open for dropdowns
	"analytics":     "analytics.access",
	"reports":         "analytics.access",
	"notifications":   "notifications.access",
	"inventory":       "masters.access",
	"cycle-count":     "masters.access",
	"cyclecount":      "masters.access",
	"serial":          "masters.access",
	"po":              "masters.access",
	"billing":         "sales_orders.access",
	"workflow":        "masters.access",
	"approval":        "masters.access",
}

// AlwaysAllowSegments are reachable by any authenticated role under RBAC.
var AlwaysAllowSegments = map[string]struct{}{
	"":            {},
	"health":      {},
	"auth":        {},
	"comments":    {},
	"attachments": {},
}
