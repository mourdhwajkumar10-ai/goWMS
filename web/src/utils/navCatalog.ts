import { hasPermission } from './permissions'

export type NavSectionId = 'home' | 'inward' | 'stock' | 'buying' | 'selling' | 'masters' | 'floor'

export type NavItemDef = {
  to: string
  label: string
  section: NavSectionId
  /** If permissions stored, any of these grants visibility. Empty = path-only / role fallback. */
  permissions?: string[]
  /** Roles that see this item when permissions list is empty. `'*'` = all authenticated. */
  rolesFallback: string[] | '*'
  /** Show on floor launcher / floor drawer */
  floor?: boolean
  /** Desk sidebar only — default true when omitted */
  desk?: boolean
}

function isDeskRole(role?: string | null) {
  const r = (role || '').toLowerCase()
  return r === 'admin' || r === 'wm' || r === 'supervisor'
}

function roleMatchesFallback(role: string | null, fallback: string[] | '*'): boolean {
  if (fallback === '*') return true
  const r = (role || '').toLowerCase()
  return fallback.map((x) => x.toLowerCase()).includes(r)
}

/** Desk sidebar + floor tile catalog. Icons stay in layout components. */
export const NAV_CATALOG: NavItemDef[] = [
  // ── Home ──
  { to: '/', label: 'Dashboard', section: 'home', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['reports.view'] },
  { to: '/analytics', label: 'Analytics', section: 'home', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['reports.view'] },

  // ── Inward ──
  { to: '/receiving-management', label: 'Receiving', section: 'inward', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'] },
  { to: '/receiving', label: 'RF Scanner', section: 'inward', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'], floor: true },
  { to: '/exceptions', label: 'Exceptions', section: 'inward', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'], floor: true },
  { to: '/follow-up', label: 'Follow-Up Receipts', section: 'inward', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'] },
  { to: '/grn-audit', label: 'Random Audit', section: 'inward', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'] },
  { to: '/putaway', label: 'Putaway', section: 'inward', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/putaway/logs', label: 'Putaway Logs', section: 'inward', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },

  // ── Stock ──
  { to: '/pick', label: 'Picking', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/pack', label: 'Packing', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/dispatch', label: 'Dispatch', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/cycle-count', label: 'Cycle Count', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/stock-scan', label: 'Stock Scan', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/inventory-health', label: 'Inventory Health', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/transfers', label: 'Transfers', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.adjust'] },
  { to: '/stock-entries', label: 'Stock Entry', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.adjust'] },
  { to: '/stock-reconciliations', label: 'Stock Reconciliation', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.adjust'] },
  { to: '/serial', label: 'Serial No', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/batches', label: 'Batch', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/qi', label: 'Quality Inspection', section: 'stock', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'], floor: true },

  // ── Buying ──
  { to: '/po', label: 'Purchase Order', section: 'buying', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['po.view'] },
  { to: '/purchase-invoices', label: 'Purchase Invoice', section: 'buying', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['po.view'] },
  { to: '/suppliers', label: 'Supplier', section: 'buying', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },

  // ── Selling ──
  { to: '/sales-orders', label: 'Sales Order', section: 'selling', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['po.view'] },
  { to: '/delivery-notes', label: 'Delivery Note', section: 'selling', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['po.view'] },
  { to: '/backorders', label: 'Backorders', section: 'selling', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/returns', label: 'Returns', section: 'selling', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/customers', label: 'Customer', section: 'selling', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },

  // ── Masters ──
  { to: '/items', label: 'Item', section: 'masters', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },
  { to: '/warehouses', label: 'Warehouse', section: 'masters', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },
  { to: '/locations', label: 'Locations', section: 'masters', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },
  { to: '/transports', label: 'Transport', section: 'masters', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },
  { to: '/employees', label: 'Employees', section: 'masters', rolesFallback: ['admin', 'wm'], permissions: ['users.manage'] },
  { to: '/roles', label: 'Roles', section: 'masters', rolesFallback: ['admin'], permissions: ['roles.manage'] },
  { to: '/workflow', label: 'Workflow', section: 'masters', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },
  { to: '/reports', label: 'Reports', section: 'masters', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['reports.view'] },
  { to: '/audit-logs', label: 'Transaction Logs', section: 'masters', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['reports.view'] },

  // ── Floor-only tiles (not in desk sidebar) ──
  { to: '/dock-receiving', label: 'Dock Receiving', section: 'floor', rolesFallback: '*', permissions: ['receiving.view'], floor: true, desk: false },
  { to: '/item-verifier', label: 'Item Verifier', section: 'floor', rolesFallback: '*', permissions: ['receiving.view'], floor: true, desk: false },
  { to: '/box-verification', label: 'Box Verification', section: 'floor', rolesFallback: '*', permissions: ['receiving.view'], floor: true, desk: false },
  { to: '/putaway-runner', label: 'Putaway Runner', section: 'floor', rolesFallback: '*', permissions: ['inventory.view'], floor: true, desk: false },
  { to: '/quick-count', label: 'Quick Count', section: 'floor', rolesFallback: '*', permissions: ['inventory.view'], floor: true, desk: false },
  { to: '/stock-peek', label: 'Stock Peek', section: 'floor', rolesFallback: '*', permissions: ['inventory.view'], floor: true, desk: false },
  { to: '/notifications', label: 'Notifications', section: 'floor', rolesFallback: '*', permissions: ['notifications.view'], floor: true, desk: false },
]

/**
 * Desk-sidebar path allowlists for floor roles (legacy FLOOR_NAV).
 * Desk roles use null (= all desk items) via navPathsForRole.
 */
export const FLOOR_NAV: Record<string, string[]> = {
  qi: ['/grn', '/receiving', '/receiving-management', '/exceptions', '/follow-up', '/qi', '/notifications'],
  picker: ['/pick', '/stock-scan', '/cycle-count', '/notifications'],
  packer: ['/pack', '/notifications'],
  dispatcher: ['/dispatch', '/delivery-notes', '/notifications'],
  driver: ['/dispatch', '/delivery-notes', '/notifications'],
  billing: ['/sales-orders', '/delivery-notes', '/customers', '/purchase-invoices', '/notifications'],
}

/** Per-role subset of handheld / floor pages. Desk roles get all floor:true paths. */
export const HANDHELD_BY_ROLE: Record<string, string[]> = {
  qi: ['/receiving', '/dock-receiving', '/item-verifier', '/putaway', '/putaway-runner', '/qi', '/exceptions', '/notifications'],
  picker: ['/pick', '/stock-scan', '/cycle-count', '/quick-count', '/notifications'],
  packer: ['/pack', '/notifications'],
  dispatcher: ['/dispatch', '/notifications'],
  driver: ['/dispatch', '/notifications'],
  billing: ['/notifications'],
}

/** All task-execution pages available on handheld (catalog floor tiles, stable order). */
export function allHandheldPages(): string[] {
  return NAV_CATALOG.filter((i) => i.floor).map((i) => i.to)
}

export function handheldPathsForRole(role?: string | null): string[] {
  const r = (role || '').toLowerCase()
  if (isDeskRole(role)) return allHandheldPages()
  return HANDHELD_BY_ROLE[r] || ['/receiving', '/notifications']
}

export function floorDeskPathsForRole(role?: string | null): string[] {
  const r = (role || '').toLowerCase()
  return FLOOR_NAV[r] || ['/grn', '/exceptions', '/notifications']
}

function deskItemVisibleByRole(role: string | null, item: NavItemDef): boolean {
  if (item.desk === false) return false
  if (isDeskRole(role)) {
    return roleMatchesFallback(role, item.rolesFallback)
  }
  const allowed = floorDeskPathsForRole(role)
  return allowed.includes(item.to)
}

function itemVisibleByPermissions(item: NavItemDef, permissions: string[], role: string | null): boolean {
  if (permissions.includes('*')) return true
  if (!item.permissions || item.permissions.length === 0) {
    return deskItemVisibleByRole(role, item)
  }
  // Prefer hasPermission (reads storePermissions); also accept direct includes on the arg.
  return item.permissions.some((p) => hasPermission(p) || permissions.includes(p))
}

/** Desk sidebar items for the current role / permission set. */
export function listDeskNavItems(role: string | null, permissions: string[]): NavItemDef[] {
  const deskItems = NAV_CATALOG.filter((i) => i.desk !== false)
  if (permissions.length === 0) {
    return deskItems.filter((i) => deskItemVisibleByRole(role, i))
  }
  return deskItems.filter((i) => itemVisibleByPermissions(i, permissions, role))
}

function floorItemVisibleByRole(role: string | null, item: NavItemDef): boolean {
  if (!item.floor) return false
  const allowed = handheldPathsForRole(role)
  return allowed.includes(item.to)
}

function floorItemVisibleByPermissions(item: NavItemDef, permissions: string[], role: string | null): boolean {
  if (!item.floor) return false
  if (permissions.includes('*')) return true
  if (!item.permissions || item.permissions.length === 0) {
    return floorItemVisibleByRole(role, item)
  }
  const permitted = item.permissions.some((p) => hasPermission(p) || permissions.includes(p))
  if (!permitted) return false
  // Still intersect with role handheld allowlist so pickers don't gain pack via unrelated perms.
  return floorItemVisibleByRole(role, item)
}

/** Floor launcher / drawer tiles for the current role / permission set. */
export function listFloorTiles(role: string | null, permissions: string[]): NavItemDef[] {
  const floorItems = NAV_CATALOG.filter((i) => i.floor)
  if (permissions.length === 0) {
    return floorItems.filter((i) => floorItemVisibleByRole(role, i))
  }
  return floorItems.filter((i) => floorItemVisibleByPermissions(i, permissions, role))
}
