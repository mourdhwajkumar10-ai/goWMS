export type OperatorStepKey =
  | 'arrival'
  | 'import'
  | 'scan_boxes'
  | 'box_recap'
  | 'scan_items'
  | 'short_excess'
  | 'done'

export type OperatorStep = {
  key: OperatorStepKey
  title: string
  hint: string
}

export const ALL_OPERATOR_STEPS: OperatorStep[] = [
  { key: 'arrival', title: 'Truck & papers', hint: 'Confirm how this truck arrived' },
  { key: 'import', title: 'Import packing list', hint: 'Load expected boxes and lines' },
  { key: 'scan_boxes', title: 'Scan boxes', hint: 'Scan each carton as it comes off the truck' },
  { key: 'box_recap', title: 'Confirm boxes', hint: 'Check missing or extra cartons' },
  { key: 'scan_items', title: 'Scan items', hint: 'Open a box and scan part labels' },
  { key: 'short_excess', title: 'Confirm shortages', hint: 'Accept shorts/excess or raise a follow-up' },
  { key: 'done', title: 'Complete GRN', hint: 'Supervisor posts stock and closes the receipt' },
]

export type FloorPhase = 'boxes' | 'items' | 'finish'

export const FLOOR_PHASES: { key: FloorPhase; title: string; hint: string }[] = [
  { key: 'boxes', title: '1. Boxes', hint: 'Scan every carton off the truck' },
  { key: 'items', title: '2. Items', hint: 'Open a box and scan what is inside' },
  { key: 'finish', title: '3. Finish', hint: 'Check counts, then complete' },
]

export function floorPhaseFromStep(key: OperatorStepKey): FloorPhase {
  if (key === 'scan_items') return 'items'
  if (key === 'short_excess' || key === 'done') return 'finish'
  return 'boxes'
}

export function stepForFloorPhase(phase: FloorPhase): OperatorStepKey {
  if (phase === 'items') return 'scan_items'
  if (phase === 'finish') return 'short_excess'
  return 'scan_boxes'
}

export type GatePapers = 'packing_list' | 'invoice_only' | 'docs_to_follow'
export type GateProblem = 'none' | 'damaged' | 'wrong_supplier' | 'after_hours'

export const OPEN_GRN_STATUSES = new Set([
  'draft',
  'open',
  'receiving',
  'box_reconciliation',
  'item_verification',
  'exception_pending',
  'item_verification_complete',
  'putaway_pending',
  'putaway_in_progress',
])

export const CLOSED_GRN_STATUSES = new Set(['completed', 'closed'])

export function packingListPresent(session: any, boxSummary: any) {
  return packingListImported(session, boxSummary)
}

/** True only when expected cartons/lines came from a packing list — not merely because boxes were scanned. */
export function packingListImported(session: any, boxSummary: any) {
  const boxes = boxSummary?.boxes || []
  if (boxes.some((b: any) => b.is_expected)) return true
  const cartons = (session?.cartons || []).filter((c: any) => String(c.carton_no || '').toUpperCase() !== 'CONSOLIDATED')
  if (cartons.some((c: any) => c.is_expected)) return true
  if (cartons.some((c: any) => (c.lines || []).some((l: any) =>
    +l.expected_qty > 0 && String(l.verification_method || '') === 'import'
  ))) return true
  return false
}

export function previousStepKey(steps: OperatorStep[], key: OperatorStepKey): OperatorStepKey | null {
  const idx = steps.findIndex(s => s.key === key)
  if (idx <= 0) return null
  return steps[idx - 1].key
}

export function canJumpToStep(steps: OperatorStep[], target: OperatorStepKey, farthest: OperatorStepKey) {
  const t = steps.findIndex(s => s.key === target)
  const f = steps.findIndex(s => s.key === farthest)
  return t >= 0 && t <= Math.max(f, 0)
}

export function fartherStep(steps: OperatorStep[], a: OperatorStepKey | null, b: OperatorStepKey): OperatorStepKey {
  const ia = a ? steps.findIndex(s => s.key === a) : -1
  const ib = steps.findIndex(s => s.key === b)
  if (ib > ia) return b
  return a || b
}

export function visibleOperatorSteps(opts: {
  invoiceOnly: boolean
  docsToFollow: boolean
  packingListImported: boolean
  sessionOpen: boolean
}): OperatorStep[] {
  return ALL_OPERATOR_STEPS.filter(step => {
    if (step.key === 'arrival' && opts.sessionOpen) return false
    if (step.key === 'import' && (opts.invoiceOnly || opts.docsToFollow || opts.packingListImported)) return false
    return true
  })
}

export function deriveStepKey(session: any, opts: {
  invoiceOnly: boolean
  packingListImported: boolean
}): OperatorStepKey {
  const s = String(session?.status || 'receiving').toLowerCase()
  if (!session) return 'arrival'
  if (s === 'draft' || s === 'receiving' || s === 'open' || s === 'box_reconciliation') return 'scan_boxes'
  if (s === 'item_verification') return 'scan_items'
  if (s === 'exception_pending' || s === 'item_verification_complete' || s === 'putaway_pending' || s === 'putaway_in_progress') {
    return 'short_excess'
  }
  if (s === 'completed' || s === 'closed') return 'done'
  return 'scan_boxes'
}

export function stepPosition(steps: OperatorStep[], key: OperatorStepKey) {
  const idx = Math.max(0, steps.findIndex(s => s.key === key))
  return { index: idx, n: idx + 1, total: steps.length, current: steps[idx] || steps[0] }
}

export function openSessionForPO(sessions: any[], poName: string) {
  const want = String(poName || '').trim().toUpperCase()
  if (!want) return null
  const matches = (sessions || []).filter((s: any) => {
    const po = String(s.purchase_receipt_no || '').trim().toUpperCase()
    const st = String(s.status || '').toLowerCase()
    return po === want && OPEN_GRN_STATUSES.has(st) && !CLOSED_GRN_STATUSES.has(st)
  })
  if (!matches.length) return null
  return [...matches].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime()
    const tb = new Date(b.created_at || 0).getTime()
    return tb - ta
  })[0]
}
