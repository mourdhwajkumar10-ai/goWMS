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
