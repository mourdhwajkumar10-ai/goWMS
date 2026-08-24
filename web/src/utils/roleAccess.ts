/** Desk roles see the full Warehouse Desk. Everyone else is floor. */
export function isDeskRole(role?: string | null) {
  const r = (role || '').toLowerCase()
  return r === 'admin' || r === 'wm' || r === 'supervisor'
}

const FLOOR_NAV: Record<string, string[]> = {
  qi: ['/grn', '/receiving', '/receiving-management', '/exceptions', '/follow-up', '/qi', '/notifications'],
  picker: ['/pick', '/stock-scan', '/cycle-count', '/notifications'],
  packer: ['/pack', '/notifications'],
  dispatcher: ['/dispatch', '/delivery-notes', '/notifications'],
  driver: ['/dispatch', '/delivery-notes', '/notifications'],
  billing: ['/sales-orders', '/delivery-notes', '/customers', '/purchase-invoices', '/notifications'],
}

const FLOOR_HOME: Record<string, string> = {
  qi: '/grn',
  picker: '/pick',
  packer: '/pack',
  dispatcher: '/dispatch',
  driver: '/dispatch',
  billing: '/sales-orders',
}

/** null = show every nav item (desk). Otherwise only these paths. */
export function navPathsForRole(role?: string | null): string[] | null {
  if (isDeskRole(role)) return null
  const r = (role || '').toLowerCase()
  return FLOOR_NAV[r] || ['/grn', '/exceptions', '/notifications']
}

export function homePathForRole(role?: string | null) {
  if (isDeskRole(role)) return '/'
  const r = (role || '').toLowerCase()
  return FLOOR_HOME[r] || '/grn'
}

export function canOpenPath(role: string | null | undefined, path: string) {
  const allowed = navPathsForRole(role)
  if (!allowed) return true
  const p = path.split('?')[0]
  return allowed.some(a => p === a || p.startsWith(`${a}/`))
}

export function deskLabel(role?: string | null) {
  const r = (role || '').toLowerCase()
  if (r === 'qi') return 'Receiving'
  if (r === 'picker') return 'Picking'
  if (r === 'packer') return 'Packing'
  if (r === 'dispatcher' || r === 'driver') return 'Dispatch'
  if (r === 'billing') return 'Billing'
  if (isDeskRole(role)) return 'Warehouse Desk'
  return 'Floor'
}

/** Short label for the floor topbar. */
export function floorLabel(role?: string | null) {
  const r = (role || '').toLowerCase()
  if (r === 'qi') return 'Receiving'
  if (r === 'picker') return 'Picking'
  if (r === 'packer') return 'Packing'
  if (r === 'dispatcher' || r === 'driver') return 'Dispatch'
  if (r === 'billing') return 'Billing'
  return 'Floor'
}

// ── Device-aware page filtering ──

/** All task-execution pages available on handheld devices. */
const HANDHELD_PAGES = [
  '/receiving',
  '/dock-receiving',
  '/item-verifier',
  '/putaway',
  '/putaway-runner',
  '/pick',
  '/pack',
  '/dispatch',
  '/cycle-count',
  '/quick-count',
  '/stock-scan',
  '/stock-peek',
  '/qi',
  '/exceptions',
  '/notifications',
]

/** Per-role subset of handheld pages. Desk roles get all of them on mobile.
 *  Floor roles get only the ones relevant to their job. */
const HANDHELD_BY_ROLE: Record<string, string[]> = {
  qi: ['/receiving', '/dock-receiving', '/item-verifier', '/putaway', '/putaway-runner', '/qi', '/exceptions', '/notifications'],
  picker: ['/pick', '/stock-scan', '/cycle-count', '/quick-count', '/notifications'],
  packer: ['/pack', '/notifications'],
  dispatcher: ['/dispatch', '/notifications'],
  driver: ['/dispatch', '/notifications'],
  billing: ['/notifications'],
}

/** Returns the list of paths the current role+device may navigate to.
 *  Desk roles on desktop see everything (null); desk roles on handheld
 *  see all task pages; floor roles see their narrow subset. */
export function floorPathsForDevice(role?: string | null): string[] {
  const r = (role || '').toLowerCase()
  if (isDeskRole(role)) return HANDHELD_PAGES
  return HANDHELD_BY_ROLE[r] || ['/receiving', '/notifications']
}
