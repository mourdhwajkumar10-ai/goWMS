export interface ReceivingChoice {
  id: number
  name: string
  supplier_name: string
  status: string
  grand_total: number
  schedule_date?: string
  item_count: number
  total_qty: number
  received_qty?: number
  open_sessions?: number
  resume_session_id?: number | null
}

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function mergeReceivingChoices(
  purchaseOrders: Array<Record<string, any>>,
  sessions: Array<Record<string, any>>,
): ReceivingChoice[] {
  const byPO = new Map<string, ReceivingChoice>()

  for (const po of purchaseOrders) {
    const name = String(po.name ?? po.po_no ?? '').trim()
    if (!name) continue
    byPO.set(normalizeName(name), {
      id: Number(po.id) || 0,
      name,
      supplier_name: String(po.supplier_name ?? po.supplier ?? ''),
      status: String(po.status ?? ''),
      grand_total: Number(po.grand_total) || 0,
      schedule_date: String(po.schedule_date ?? ''),
      item_count: Number(po.item_count ?? po.total_items) || 0,
      total_qty: Number(po.total_qty) || 0,
      received_qty: Number(po.received_qty) || 0,
      open_sessions: Number(po.open_sessions) || 0,
      resume_session_id: po.resume_session_id == null ? null : Number(po.resume_session_id),
    })
  }

  for (const session of sessions) {
    const poName = String(session.po_no ?? session.purchase_receipt_no ?? '').trim()
    const sessionName = String(session.name ?? session.session_no ?? `Session ${session.id ?? ''}`).trim()
    const displayName = poName || sessionName
    if (!displayName) continue
    const key = normalizeName(poName || `session:${session.id ?? displayName}`)
    const existing = byPO.get(key)
    if (existing) {
      existing.resume_session_id = Number(session.id) || existing.resume_session_id
      existing.open_sessions = Math.max(existing.open_sessions || 0, 1)
      continue
    }
    byPO.set(key, {
      id: 0,
      name: displayName,
      supplier_name: String(session.supplier_name ?? session.supplier ?? ''),
      status: String(session.status ?? 'open'),
      grand_total: 0,
      schedule_date: '',
      item_count: Number(session.total_items ?? session.item_count) || 0,
      total_qty: Number(session.total_qty) || 0,
      received_qty: Number(session.received_qty) || 0,
      open_sessions: 1,
      resume_session_id: Number(session.id) || null,
    })
  }

  return Array.from(byPO.values())
}

export type CameraState =
  | 'starting'
  | 'ready'
  | 'permission_denied'
  | 'no_camera'
  | 'busy'
  | 'unsupported'
  | 'manual'

export function cameraErrorMessage(name?: string): string {
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission denied. Allow camera access in browser settings and try again.'
    case 'NotFoundError':
      return 'No camera found on this device.'
    case 'SecurityError':
    case 'InsecureContext':
      return 'Camera requires a secure HTTPS connection.'
    case 'NotReadableError':
      return 'Camera is busy or unavailable. Close other camera apps and try again.'
    case 'NotSupportedError':
    case 'NoMediaDevices':
      return 'This browser cannot access the camera. Use current Chrome or Safari.'
    default:
      return 'Could not start the camera. Type the code instead.'
  }
}
