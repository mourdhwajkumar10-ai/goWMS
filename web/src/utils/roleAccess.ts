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
