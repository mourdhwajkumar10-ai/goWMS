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
  /** Linked GRN session number when a packing list / receiving session exists */
  session_no?: string
  packing_list_no?: string
  total_boxes?: number
}

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

const CLOSED_SESSION = new Set(['closed', 'completed', 'cancelled'])

function isOpenSession(status: unknown): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return !s || !CLOSED_SESSION.has(s)
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
      session_no: String(po.session_no ?? '').trim() || undefined,
      packing_list_no: String(po.packing_list_no ?? '').trim() || undefined,
      total_boxes: Number(po.boxes_total ?? po.total_boxes) || 0,
    })
  }

  for (const session of sessions) {
    if (!isOpenSession(session.status)) continue
    const poName = String(session.po_no ?? session.purchase_receipt_no ?? '').trim()
    const sessionName = String(session.name ?? session.session_no ?? `Session ${session.id ?? ''}`).trim()
    const packingListNo = String(session.packing_list_no ?? '').trim()
    const displayName = poName || sessionName
    if (!displayName) continue
    const key = normalizeName(poName || `session:${session.id ?? displayName}`)
    const existing = byPO.get(key)
    const boxes = Number(session.total_boxes ?? session.boxes_total) || 0
    const items = Number(session.total_items ?? session.item_count) || 0
    const qty = Number(session.total_qty) || 0
    const sid = Number(session.id) || null
    if (existing) {
      if (sid) existing.resume_session_id = sid
      existing.open_sessions = Math.max(existing.open_sessions || 0, 1)
      if (sessionName) existing.session_no = sessionName
      if (packingListNo) existing.packing_list_no = packingListNo
      if (boxes > 0) existing.total_boxes = boxes
      if (items > 0) existing.item_count = items
      if (qty > 0) existing.total_qty = qty
      if (!existing.supplier_name) {
        existing.supplier_name = String(session.supplier_name ?? session.supplier ?? '')
      }
      continue
    }
    byPO.set(key, {
      id: Number(session.purchase_order_id) || 0,
      name: displayName,
      supplier_name: String(session.supplier_name ?? session.supplier ?? ''),
      status: String(session.status ?? 'open'),
      grand_total: 0,
      schedule_date: '',
      item_count: items,
      total_qty: qty,
      received_qty: Number(session.received_qty) || 0,
      open_sessions: 1,
      resume_session_id: sid,
      session_no: sessionName || undefined,
      packing_list_no: packingListNo || undefined,
      total_boxes: boxes,
    })
  }

  return Array.from(byPO.values())
}

/** Match floor search against PO / GRN / PL / supplier. */
export function receivingChoiceMatches(choice: ReceivingChoice, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [
    choice.name,
    choice.session_no,
    choice.packing_list_no,
    choice.supplier_name,
    choice.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
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
