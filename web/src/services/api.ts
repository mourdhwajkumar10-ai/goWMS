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
  register: (username: string, password: string, role: string) =>
    post<null>("/auth/register", { username, password, role }),

  // Health
  health: () => get<{ status: string }>("/health"),

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
  pickScan: (data: any) => post<any>("/picking/scan", data),

  // Packing
  packSessions: () => get<any[]>("/packing/sessions"),
  packCreate: (data: any) => post<any>("/packing/", data),

  // Dispatch
  dispatchTrips: () => get<any[]>("/dispatch/trips"),
  dispatchCreate: (data: any) => post<any>("/dispatch/", data),

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

  // Workflow
  workflowList: () => get<any[]>("/workflow/list"),
  workflowApprove: (id: number) => post<any>(`/workflow/${id}/approve`, {}),
  workflowReject: (id: number) => post<any>(`/workflow/${id}/reject`, {}),

  // Reports
  reportsSummary: () => get<any>("/reports/summary"),
};

export default api;
