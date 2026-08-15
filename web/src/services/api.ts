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
  total?: number;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    headers["X-Device"] = navigator.userAgent.slice(0, 100);
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await res.json().catch(() => ({})) as ApiResponse<T>;
  if (!res.ok || payload.ok === false) {
    return { ok: false, data: payload.data, error: payload.error || `Request failed (${res.status})` };
  }
  return { ok: true, data: payload.data, total: (payload as { total?: number }).total };
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
  patch,
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
  employeeImport: (data: any) => post<any>("/employees/import", data),
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
  returnsReceive: (id: number, data?: any) => post<any>(`/returns/${id}/receive`, data || {}),
  returnsDecide: (id: number, data: any) => post<any>(`/returns/${id}/decide`, data),
  returnsScrap: (id: number, data: any) => post<any>(`/returns/${id}/scrap`, data),

  // Items
  itemList: (q?: string, opts?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams()
    if (q) p.set("q", q)
    if (opts?.limit != null) p.set("limit", String(opts.limit))
    if (opts?.offset != null) p.set("offset", String(opts.offset))
    const qs = p.toString()
    return get<any[]>(`/masterdata/items${qs ? `?${qs}` : ""}`)
  },
  itemCreate: (data: any) => post<any>("/masterdata/items", data),
  itemUpdate: (id: number, data: any) => patch<any>(`/masterdata/items/${id}`, data),
  itemImport: (data: any) => post<any>("/masterdata/items/import", data),
  itemImportFile: async (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const headers: Record<string, string> = {}
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    if (typeof navigator !== "undefined" && navigator.userAgent) {
      headers["X-Device"] = navigator.userAgent.slice(0, 100)
    }
    const res = await fetch(`${BASE}/masterdata/items/import-file`, { method: "POST", headers, body: fd })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok || payload.ok === false) {
      return { ok: false as const, data: payload.data, error: payload.error || `Import failed (${res.status})` }
    }
    return { ok: true as const, data: payload.data }
  },
  itemGroups: () => get<any[]>("/masterdata/item-groups"),
  itemGroupCreate: (data: any) => post<any>("/masterdata/item-groups", data),
  itemComplete: (data: any) => post<any>("/masterdata/items/complete", data),
  itemCheck: (code: string) => get<any>(`/masterdata/items/check/${encodeURIComponent(code)}`),
  itemInventory: (code: string) => get<any[]>(`/masterdata/items/${encodeURIComponent(code)}/inventory`),
  scanLookup: (code: string, mode: 'auto' | 'item' | 'location' = 'auto') =>
    get<any>(`/masterdata/scan-lookup?code=${encodeURIComponent(code)}&mode=${mode}`),
  stockAdjust: (data: any) => post<any>("/masterdata/stock/adjust", data),

  attachmentList: (entityType: string, entityId: number) =>
    get<any[]>(`/attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${entityId}`),
  attachmentUpload: async (entityType: string, entityId: number, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('entity_type', entityType)
    fd.append('entity_id', String(entityId))
    const headers: Record<string, string> = {}
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      headers['X-Device'] = navigator.userAgent.slice(0, 100)
    }
    const res = await fetch(`${BASE}/attachments/`, { method: 'POST', headers, body: fd })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok || payload.ok === false) {
      return { ok: false as const, data: payload.data, error: payload.error || `Upload failed (${res.status})` }
    }
    return { ok: true as const, data: payload.data }
  },
  attachmentUrl: (id: number) => `${BASE}/attachments/${id}`,

  // Carriers / suppliers
  carriersList: () => get<any[]>("/masterdata/carriers"),
  carrierCreate: (data: any) => post<any>("/masterdata/carriers", data),
  supplierGet: (id: number) => get<any>(`/masterdata/suppliers/${id}`),
  supplierUpdate: (id: number, data: any) => put<any>(`/masterdata/suppliers/${id}`, data),
  transportsList: (q?: string) => get<any[]>(`/masterdata/transports${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  transportCreate: (data: any) => post<any>("/masterdata/transports", data),
  transportUpdate: (id: number, data: any) => put<any>(`/masterdata/transports/${id}`, data),

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
  grnUpdate: (id: number, data: any) => patch<any>(`/grn/session/${id}`, data),
  grnAdvance: (id: number, status: string) => post<any>(`/grn/session/${id}/advance`, { status }),
  grnBoxSummary: (id: number) => get<any>(`/grn/session/${id}/box-summary`),
  grnCompleteBoxReceiving: (id: number) => post<any>(`/grn/session/${id}/complete-box-receiving`, {}),
  grnEvents: (id: number) => get<any[]>(`/grn/session/${id}/events`),
  grnExceptions: (id: number) => get<any[]>(`/grn/session/${id}/exceptions`),
  grnAddInvoice: (id: number, data: any) => post<any>(`/grn/session/${id}/invoices`, data),
  grnInvoices: (id: number) => get<any[]>(`/grn/session/${id}/invoices`),
  grnAttachPOD: (id: number, attachmentId: number) =>
    post<any>(`/grn/session/${id}/pod`, { attachment_id: attachmentId }),
  grnOpenBox: (id: number, data: { carton_no?: string; carton_id?: number }) =>
    post<any>(`/grn/session/${id}/open-box`, data),
  grnActiveBox: (id: number) => get<any>(`/grn/session/${id}/active-box`),
  grnVerifyItem: (id: number, data: {
    item_code: string; qty?: number; carton_id?: number
    variant?: string; expected_variant?: string
    revision?: string; expected_revision?: string
    serial_no?: string; substitute?: boolean
  }) =>
    post<any>(`/grn/session/${id}/verify-item`, data),
  grnReportDiscrepancy: (id: number, data: Record<string, unknown>) =>
    post<any>(`/grn/session/${id}/discrepancy`, data),
  grnCloseBox: (id: number, data: { carton_id: number; reason?: string }) =>
    post<any>(`/grn/session/${id}/close-box`, data),
  grnResolveException: (exceptionId: number, data: { resolution: string; status?: string; create_followup?: boolean }) =>
    post<any>(`/grn/exceptions/${exceptionId}/resolve`, data),
  grnStartAudit: (id: number, sampleSize?: number) =>
    post<any>(`/grn/session/${id}/audit/start`, { sample_size: sampleSize ?? 5 }),
  grnAudits: (id: number) => get<any[]>(`/grn/session/${id}/audits`),
  grnCheckAuditItem: (itemId: number, data: { physical_qty: number; notes?: string }) =>
    post<any>(`/grn/audit-items/${itemId}/check`, data),
  grnCompleteAudit: (sessionId: number, auditId: number) =>
    post<any>(`/grn/session/${sessionId}/audit/${auditId}/complete`, {}),
  grnCreateFollowUp: (id: number) => post<any>(`/grn/session/${id}/follow-up`, {}),
  grnFollowUps: (id: number) => get<any[]>(`/grn/session/${id}/follow-ups`),
  grnSeedInvoiceExpected: (id: number, lines: any[]) =>
    post<any>(`/grn/session/${id}/invoice-expected`, { lines }),
  grnInvoiceExpected: (id: number) => get<any[]>(`/grn/session/${id}/invoice-expected`),
  grnItemSummary: (id: number) => get<any>(`/grn/session/${id}/item-summary`),
  grnDocCompare: (id: number) => get<any>(`/grn/session/${id}/doc-compare`),
  grnAttachCOA: (id: number, attachmentId: number) =>
    post<any>(`/grn/session/${id}/coa`, { attachment_id: attachmentId }),
  grnAttachEvidence: (exceptionId: number, attachmentId: number) =>
    post<any>(`/grn/exceptions/${exceptionId}/evidence`, { attachment_id: attachmentId }),
  grnScanSupplier: (id: number, barcode: string) =>
    post<any>(`/grn/session/${id}/supplier-scan`, { barcode }),
  grnCompleteVerification: (id: number) => post<any>(`/grn/session/${id}/complete-verification`, {}),
  grnFinalize: (id: number, force?: boolean) =>
    post<any>(`/grn/session/${id}/finalize`, { force: !!force }),
  grnAllExceptions: (status = 'open') =>
    get<any[]>(`/grn/exceptions?status=${encodeURIComponent(status)}`),
  grnAllFollowUps: () => get<any[]>('/grn/follow-ups'),
  grnAllAudits: () => get<any[]>('/grn/audits'),
  grnPresence: (id: number) => post<any>(`/grn/session/${id}/presence`, {}),
  grnListPresence: (id: number) => get<any>(`/grn/session/${id}/presence`),
  grnScanCarton: (data: any) => post<any>("/grn/carton", data),
  grnScanLine: (data: any) => post<any>("/grn/line", data),
  grnClose: (data: any) => post<any>("/grn/close", data),
  grnPutaway: (data: any) => post<any>("/grn/putaway", data),
  grnCompletePutaway: (id: number) => post<any>(`/grn/session/${id}/complete-putaway`, {}),
  grnCreateException: (id: number, data: any) => post<any>(`/grn/session/${id}/exceptions`, data),
  grnSupportingDoc: (id: number, attachmentId: number) =>
    post<any>(`/grn/session/${id}/supporting-doc`, { attachment_id: attachmentId }),

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
  qiSaveReadings: (id: number, readings: any[]) => post<any>(`/qi/${id}/readings`, { readings }),

  // Serial
  serialList: (itemCode?: string) => get<any[]>(`/serial/list${itemCode ? `?item_code=${encodeURIComponent(itemCode)}` : ''}`),

  // Putaway
  putawayRules: () => get<any[]>("/putaway/rules"),
  putawayCreate: (data: any) => post<any>("/putaway/", data),
  putawaySuggest: (itemCode: string, qty?: number, warehouseId?: number, preferred?: { aisle?: string; bay?: string; excludeLocationIds?: number[] }) => {
    let q = `/putaway/suggest?item_code=${encodeURIComponent(itemCode)}&qty=${qty ?? 1}`
    if (warehouseId) q += `&warehouse_id=${warehouseId}`
    if (preferred?.aisle) q += `&preferred_aisle=${encodeURIComponent(preferred.aisle)}`
    if (preferred?.bay) q += `&preferred_bay=${encodeURIComponent(preferred.bay)}`
    if (preferred?.excludeLocationIds?.length) q += `&exclude_location_ids=${preferred.excludeLocationIds.join(',')}`
    return get<any>(q)
  },
  putawayQueue: () => get<any[]>("/putaway/queue"),
  putawayFitException: (data: {
    item_code: string
    rejected_location?: string
    rejected_location_id?: number
    reason: 'too_small' | 'too_large'
    requested_qty?: number
    fits_qty?: number
    override_location?: string
    notes?: string
  }) => post<any>("/putaway/fit-exception", data),

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
  supplierByBarcode: (code: string) => get<any>(`/masterdata/suppliers/by-barcode/${encodeURIComponent(code)}`),

  // Warehouses
  warehouseList: () => get<any[]>("/masterdata/warehouses"),
  warehouseCreate: (data: any) => post<any>("/masterdata/warehouses", data),
  warehouseUpdate: (id: number, data: any) => patch<any>(`/masterdata/warehouses/${id}`, data),
  warehouseLocations: (id: number) => get<any[]>(`/masterdata/warehouses/${id}/locations`),
  locationCreate: (warehouseId: number, data: any) => post<any>(`/masterdata/warehouses/${warehouseId}/locations`, data),
  locationBulk: (warehouseId: number, data: any) => post<any>(`/masterdata/warehouses/${warehouseId}/locations/bulk`, data),
  locationInventory: (id: number) => get<any[]>(`/masterdata/locations/${id}/inventory`),
  locationUpdate: (id: number, data: any) => patch<any>(`/masterdata/locations/${id}`, data),
  locationQRLabel: (id: number) => get<any>(`/masterdata/locations/${id}/qr-label`),
  locationQRLabels: (warehouseId: number, data: { location_ids?: number[]; aisle?: string; bay?: string }) =>
    post<{ labels: any[]; count: number }>(`/masterdata/warehouses/${warehouseId}/locations/qr-labels`, data),

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
