const BASE = "/api";
const TOKEN_KEY = "gowms_token";
const ROLE_KEY = "gowms_role";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, role: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
}

export function getRole(): string | null {
  return localStorage.getItem(ROLE_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

interface ApiResponse<T> {
  data: T;
  ok: boolean;
  error?: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await res.json().catch(() => ({})) as ApiResponse<T>;
  if (!res.ok || payload.ok === false) {
    return { ok: false, data: payload.data, error: payload.error || `Request failed (${res.status})` };
  }
  return { ok: true, data: payload.data };
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
const put = <T>(path: string, body?: unknown) => request<T>("PUT", path, body);
const patch = <T>(path: string, body?: unknown) => request<T>("PATCH", path, body);
const del = <T>(path: string) => request<T>("DELETE", path);

export const api = {
  get,
  post,
  put,
  del,

  // Auth
  login: (username: string, password: string) =>
    post<{ token: string; role: string }>("/auth/login", { username, password }),
  pinLogin: (data: { badge_code?: string; employee_number?: string; pin: string; warehouse_id?: number }) =>
    post<{ token: string; role: string; employee_name?: string }>("/auth/pin-login", data),
  register: (username: string, password: string, role: string) =>
    post<null>("/auth/register", { username, password, role }),

  // Health
  health: () => get<{ status: string }>("/health"),

  // Sales Orders
  soList: (qs?: string) => get<any[]>(`/sales-orders${qs ? `?${qs}` : ""}`),
  soCreate: (data: any) => post<any>("/sales-orders/", data),
  soGet: (id: number) => get<any>(`/sales-orders/${id}`),
  soUpdate: (id: number, data: any) => put<any>(`/sales-orders/${id}`, data),
  soConfirm: (id: number) => post<any>(`/sales-orders/${id}/confirm`, {}),
  soCancel: (id: number) => post<any>(`/sales-orders/${id}/cancel`, {}),
  soPriority: (id: number, data: any) => post<any>(`/sales-orders/${id}/priority`, data),
  soCreatePick: (id: number) => post<any>(`/sales-orders/${id}/create-pick`, {}),
  soImport: (data: any) => post<any>("/sales-orders/import", data),

  // Packing list import
  packingListTemplates: () => get<any[]>("/packing-list/templates"),
  packingListImport: (data: any) => post<any>("/packing-list/import", data),

  // Employees
  employeeList: () => get<any[]>("/employees/list"),
  employeeCreate: (data: any) => post<any>("/employees/", data),
  employeeNextId: (first: string, last: string) =>
    get<any>(`/employees/next-id?first=${encodeURIComponent(first)}&last=${encodeURIComponent(last)}`),
  employeeSetPin: (id: number, pin: string) => post<any>(`/employees/${id}/pin`, { pin }),
  employeeAssignRole: (id: number, wms_role: string) => put<any>(`/employees/${id}/role`, { wms_role }),

  // Roles / RBAC
  rolesList: () => get<any[]>("/roles/list"),
  rolesSeedDefaults: () => post<any>("/roles/seed-defaults", {}),
  roleGet: (id: number) => get<any>(`/roles/${id}`),
  roleCreate: (data: any) => post<any>("/roles/", data),
  roleUpdate: (id: number, data: any) => put<any>(`/roles/${id}`, data),
  roleDelete: (id: number) => del<any>(`/roles/${id}`),
  roleSetPermissions: (id: number, permissions: string[]) =>
    put<any>(`/roles/${id}/permissions`, { permissions }),
  roleSetAccess: (id: number, access: { inbound: string; outbound: string; admin: string }) =>
    put<any>(`/roles/${id}/access`, access),
  permissionsCatalog: () => get<any[]>("/permissions"),

  // Returns
  returnsList: () => get<any[]>("/returns/list"),
  returnsCreate: (data: any) => post<any>("/returns/", data),
  returnsInspect: (id: number, data: any) => post<any>(`/returns/${id}/inspect`, data),
  returnsRestock: (id: number, data: any) => post<any>(`/returns/${id}/restock`, data),

  // Items
  itemList: (q?: string) => get<any[]>(`/masterdata/items${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  itemCreate: (data: any) => post<any>("/masterdata/items", data),
  itemComplete: (data: any) => post<any>("/masterdata/items/complete", data),
  itemCheck: (code: string) => get<any>(`/masterdata/items/check/${encodeURIComponent(code)}`),
  itemInventory: (code: string) => get<any[]>(`/masterdata/items/${encodeURIComponent(code)}/inventory`),
  stockAdjust: (data: any) => post<any>("/masterdata/stock/adjust", data),

  // PO
  poList: () => get<any[]>("/po/list"),
  poCreate: (data: any) => post<any>("/po/", data),
  poGet: (id: number) => get<any>(`/po/${id}`),
  poSubmit: (id: number) => post<any>(`/po/${id}/submit`, {}),
  poDelete: (id: number) => del<any>(`/po/${id}`),
  poSearch: (q: string) => get<any[]>(`/po/search?q=${encodeURIComponent(q)}`),

  // GRN
  grnSessions: () => get<any[]>("/grn/sessions"),
  grnCreate: (data: any) => post<any>("/grn/", data),
  grnSession: (id: number) => get<any>(`/grn/session/${id}`),
  grnScanCarton: (data: any) => post<any>("/grn/carton", data),
  grnScanLine: (data: any) => post<any>("/grn/line", data),
  grnClose: (data: any) => post<any>("/grn/close", data),
  grnPutaway: (data: any) => post<any>("/grn/putaway", data),

  // Picking
  pickLists: () => get<any[]>("/picking/lists"),
  pickCreate: (data: any) => post<any>("/picking/", data),
  pickGet: (id: number) => get<any>(`/picking/${id}`),
  pickScan: (data: any) => post<any>("/picking/scan", data),
  pickPrint: (id: number) => get<any>(`/picking/${id}/print`),
  pickCancel: (id: number) => post<any>(`/picking/${id}/cancel`, {}),
  pickWave: (data: any) => post<any>("/picking/wave", data),
  pickWaves: () => get<any[]>("/picking/waves"),

  // Packing
  packSessions: () => get<any[]>("/packing/sessions"),
  packCreate: (data: any) => post<any>("/packing/", data),
  packGet: (id: number) => get<any>(`/packing/${id}`),
  packLoad: (id: number) => post<any>(`/packing/${id}/load`, {}),
  packLabel: (id: number) => get<any>(`/packing/${id}/label`),

  // Dispatch
  dispatchTrips: () => get<any[]>("/dispatch/trips"),
  dispatchCreate: (data: any) => post<any>("/dispatch/", data),
  dispatchTrip: (id: number) => get<any>(`/dispatch/trip/${id}`),
  dispatchLoad: (tripId: number, boxId: number) =>
    post<any>(`/dispatch/trip/${tripId}/load`, { box_id: boxId }),
  dispatchGenerateDN: (tripId: number, data?: any) =>
    post<any>(`/dispatch/trip/${tripId}/generate-dn`, data || {}),
  dispatchVisitStop: (tripId: number, stopId: number, data?: any) =>
    post<any>(`/dispatch/trip/${tripId}/stop/${stopId}/visit`, data || {}),
  dispatchCompleteGated: (tripId: number) =>
    post<any>(`/dispatch/trip/${tripId}/complete-gated`, {}),
  dispatchSignature: (data: any) => post<any>("/dispatch/signature", data),

  // Backorder v2
  backorderV2List: () => get<any[]>("/backorder/v2/list"),
  backorderV2Create: (data: any) => post<any>("/backorder/v2/", data),
  backorderAutoFromPick: (pickListId: number) =>
    post<any>(`/backorder/v2/auto-from-pick/${pickListId}`, {}),
  backorderV2Fulfill: (id: number) => post<any>(`/backorder/v2/${id}/fulfill`, {}),

  // QC templates
  qiTemplates: () => get<any[]>("/qi/templates"),
  qiTemplateCreate: (data: any) => post<any>("/qi/templates", data),
  qiFromTemplate: (data: any) => post<any>("/qi/from-template", data),

  // Priority decay
  soDecayPriorities: () => post<any>("/sales-orders/decay-priorities", {}),

  // Exports
  itemsExportUrl: () => "/api/masterdata/items/export",
  employeesExportUrl: () => "/api/employees/export",

  // Quality
  qiList: () => get<any[]>("/qi/list"),
  qiCreate: (data: any) => post<any>("/qi/", data),

  // Serial
  serialList: (itemCode?: string) => get<any[]>(`/serial/list${itemCode ? `?item_code=${encodeURIComponent(itemCode)}` : ''}`),

  // Putaway
  putawayRules: () => get<any[]>("/putaway/rules"),
  putawayCreate: (data: any) => post<any>("/putaway/", data),
  putawaySuggest: (itemCode: string, qty?: number, warehouseId?: number) =>
    get<any>(`/putaway/suggest?item_code=${encodeURIComponent(itemCode)}&qty=${qty ?? 1}${warehouseId ? `&warehouse_id=${warehouseId}` : ''}`),
  putawayQueue: () => get<any[]>("/putaway/queue"),

  // Cycle Count
  cycleCountSheets: () => get<any[]>("/cyclecount/sheets"),
  cycleCountCreate: (data: any) => post<any>("/cyclecount/sheets", data),

  // Inventory health / transfers
  reorderAlerts: () => get<any[]>("/inventory/reorder-alerts"),
  expiryAlerts: (days?: number) => get<any[]>(`/inventory/expiry-alerts?days=${days ?? 90}`),
  refreshAlerts: () => post<any>("/inventory/refresh-alerts", {}),
  transferList: () => get<any[]>("/inventory/transfers"),
  transferCreate: (data: any) => post<any>("/inventory/transfers", data),
  transferShip: (id: number) => post<any>(`/inventory/transfers/${id}/ship`, {}),
  transferReceive: (id: number, data?: any) => post<any>(`/inventory/transfers/${id}/receive`, data || {}),

  // Backorders
  backorderList: () => get<any[]>("/backorder/list"),
  backorderCreate: (data: any) => post<any>("/backorder/", data),

  // Billing
  billingList: () => get<any[]>("/billing/list"),
  billingCreate: (data: any) => post<any>("/billing/", data),

  // Customers
  customerList: () => get<any[]>("/customer/list"),
  customerCreate: (data: any) => post<any>("/customer/", data),

  // Suppliers
  supplierList: () => get<any[]>("/masterdata/suppliers"),
  supplierCreate: (data: any) => post<any>("/masterdata/suppliers", data),

  // Warehouses
  warehouseList: () => get<any[]>("/masterdata/warehouses"),
  warehouseCreate: (data: any) => post<any>("/masterdata/warehouses", data),
  warehouseLocations: (id: number) => get<any[]>(`/masterdata/warehouses/${id}/locations`),
  locationCreate: (warehouseId: number, data: any) => post<any>(`/masterdata/warehouses/${warehouseId}/locations`, data),
  locationBulk: (warehouseId: number, data: any) => post<any>(`/masterdata/warehouses/${warehouseId}/locations/bulk`, data),
  locationInventory: (id: number) => get<any[]>(`/masterdata/locations/${id}/inventory`),
  locationUpdate: (id: number, data: any) => patch<any>(`/masterdata/locations/${id}`, data),

  // Batches
  batchList: () => get<any[]>("/masterdata/batches"),
  batchCreate: (data: any) => post<any>("/masterdata/batches", data),

  // Delivery Notes
  deliveryNoteList: () => get<any[]>("/masterdata/delivery-notes"),

  // Stock Entries
  stockEntryList: () => get<any[]>("/masterdata/stock-entries"),
  stockEntryCreate: (data: any) => post<any>("/masterdata/stock-entries", data),

  // Stock Reconciliations
  stockReconList: () => get<any[]>("/masterdata/stock-reconciliations"),

  // Purchase Invoices
  purchaseInvoiceList: () => get<any[]>("/billing/list"),

  // Notifications
  notificationList: () => get<any[]>("/notifications/list"),
  notificationMarkRead: (id: number) => post<any>(`/notifications/${id}/read`, {}),

  // Comments
  commentList: (entityType: string, entityId: number) => get<any[]>(`/comments/${entityType}/${entityId}`),
  commentCreate: (entityType: string, entityId: number, text: string) =>
    post<any>("/comments/", { entity_type: entityType, entity_id: entityId, text }),

  // Analytics
  dashboard: () => get<any>("/analytics/dashboard"),
  analyticsSummary: () => get<any>("/analytics/summary"),
  outboundKPIs: () => get<any>("/analytics/outbound-kpis"),

  // Workflow
  workflowList: () => get<any[]>("/workflow/list"),
  workflowApprove: (id: number) => post<any>(`/workflow/${id}/approve`, {}),
  workflowReject: (id: number) => post<any>(`/workflow/${id}/reject`, {}),

  // Reports
  reportsSummary: () => get<any>("/reports/summary"),
};

export default api;
