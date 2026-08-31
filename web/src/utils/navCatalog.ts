import { hasPermission } from './permissions'

export type NavSectionId = 'home' | 'inbound' | 'outbound' | 'inventory' | 'system'

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

export const NAV_SECTION_ORDER: NavSectionId[] = [
  'home',
  'inbound',
  'outbound',
  'inventory',
  'system',
]

/** Floor drawer / launcher omit Home (desk dashboard). */
export const FLOOR_SECTION_ORDER: NavSectionId[] = [
  'inbound',
  'outbound',
  'inventory',
  'system',
]

export const NAV_SECTION_TITLES: Record<NavSectionId, string> = {
  home: 'Home',
  inbound: 'Inbound',
  outbound: 'Outbound',
  inventory: 'Inventory management',
  system: 'System',
}

export type NavSectionGroup = {
  id: NavSectionId
  title: string
  items: NavItemDef[]
}

export function groupNavBySection(
  items: NavItemDef[],
  order: NavSectionId[] = NAV_SECTION_ORDER,
): NavSectionGroup[] {
  return order
    .map((id) => ({
      id,
      title: NAV_SECTION_TITLES[id],
      items: items.filter((item) => item.section === id),
    }))
    .filter((section) => section.items.length > 0)
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

  // ── Inbound ──
  { to: '/receiving-management', label: 'Receiving', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'] },
  { to: '/driver-checkin', label: 'Driver Check-in', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'], floor: true },
  { to: '/receiving', label: 'RF Scanner', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'], floor: true },
  { to: '/exceptions', label: 'Exceptions', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'], floor: true },
  { to: '/follow-up', label: 'Follow-Up Receipts', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'] },
  { to: '/grn-audit', label: 'Random Audit', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'] },
  // Desk wizard at /putaway. Floor uses /putaway-runner (scan-first) — one "Putaway" tile only.
  { to: '/putaway', label: 'Putaway', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/putaway/logs', label: 'Putaway Logs', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/qi', label: 'Quality Inspection', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['receiving.view'], floor: true },
  { to: '/po', label: 'Purchase Order', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['po.view'] },
  { to: '/purchase-invoices', label: 'Purchase Invoice', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['po.view'] },
  { to: '/suppliers', label: 'Supplier', section: 'inbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },

  // ── Outbound ──
  { to: '/pick', label: 'Picking', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/pack', label: 'Packing', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/consolidate', label: 'Consolidate', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true, desk: false },
  { to: '/dispatch', label: 'Dispatch', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/counter-sale', label: 'Counter Sale', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor', 'billing'], permissions: ['counter_sale.access'], floor: true },
  { to: '/wave', label: 'Wave', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/sales-orders', label: 'Sales Order', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['po.view'], floor: true },
  { to: '/delivery-notes', label: 'Delivery Note', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['po.view'] },
  { to: '/backorders', label: 'Backorders', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/shortage-review', label: 'Shortage review', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['picking.override'], floor: true },
  { to: '/returns', label: 'Returns', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/customers', label: 'Customer', section: 'outbound', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },

  // ── Inventory management ──
  { to: '/cycle-count', label: 'Cycle Count', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/stock-scan', label: 'Stock Scan', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'], floor: true },
  { to: '/inventory', label: 'Inventory', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/inventory-health', label: 'Inventory Health', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/transfers', label: 'Transfers', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.adjust'] },
  { to: '/stock-entries', label: 'Stock Entry', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.adjust'] },
  { to: '/stock-reconciliations', label: 'Stock Reconciliation', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.adjust'] },
  { to: '/serial', label: 'Serial No', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/batches', label: 'Batch', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['inventory.view'] },
  { to: '/items', label: 'Item', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },
  { to: '/warehouses', label: 'Warehouse', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },
  { to: '/locations', label: 'Locations', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },
  { to: '/transports', label: 'Transport', section: 'inventory', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },

  // ── System ──
  { to: '/employees', label: 'Employees', section: 'system', rolesFallback: ['admin', 'wm'], permissions: ['users.manage'] },
  { to: '/roles', label: 'Roles', section: 'system', rolesFallback: ['admin'], permissions: ['roles.manage'] },
  { to: '/workflow', label: 'Workflow', section: 'system', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['masterdata.manage'] },
  { to: '/reports', label: 'Reports', section: 'system', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['reports.view'] },
  { to: '/audit-logs', label: 'Transaction Logs', section: 'system', rolesFallback: ['admin', 'wm', 'supervisor'], permissions: ['reports.view'] },

  // ── Floor-only tiles (not in desk sidebar) ──
  { to: '/dock-receiving', label: 'Dock Receiving', section: 'inbound', rolesFallback: '*', permissions: ['receiving.view'], floor: true, desk: false },
  { to: '/item-verifier', label: 'Item Verifier', section: 'inbound', rolesFallback: '*', permissions: ['receiving.view'], floor: true, desk: false },
  { to: '/box-verification', label: 'Box Verification', section: 'inbound', rolesFallback: '*', permissions: ['receiving.view'], floor: true, desk: false },
  { to: '/putaway-runner', label: 'Putaway', section: 'inbound', rolesFallback: '*', permissions: ['inventory.view'], floor: true, desk: false },
  { to: '/quick-count', label: 'Quick Count', section: 'inventory', rolesFallback: '*', permissions: ['inventory.view'], floor: true, desk: false },
  { to: '/stock-peek', label: 'Stock Peek', section: 'inventory', rolesFallback: '*', permissions: ['inventory.view'], floor: true, desk: false },
  { to: '/notifications', label: 'Notifications', section: 'system', rolesFallback: '*', permissions: ['notifications.view'], floor: true, desk: false },
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
  qi: ['/receiving', '/driver-checkin', '/dock-receiving', '/item-verifier', '/box-verification', '/putaway-runner', '/qi', '/exceptions', '/notifications'],
  picker: ['/pick', '/stock-scan', '/cycle-count', '/quick-count', '/notifications'],
  packer: ['/pack', '/consolidate', '/notifications'],
  dispatcher: ['/dispatch', '/notifications'],
  driver: ['/dispatch', '/notifications'],
  billing: ['/counter-sale', '/notifications'],
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
  if (item.desk === false) return false
  if (permissions.includes('*')) {
    // Wildcard still respects floor-role desk allowlists (spec §6).
    if (!isDeskRole(role)) return floorDeskPathsForRole(role).includes(item.to)
    return true
  }
  if (!item.permissions || item.permissions.length === 0) {
    return deskItemVisibleByRole(role, item)
  }
  const permitted = item.permissions.some((p) => hasPermission(p) || permissions.includes(p))
  if (!permitted) return false
  if (!isDeskRole(role)) return floorDeskPathsForRole(role).includes(item.to)
  return true
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
