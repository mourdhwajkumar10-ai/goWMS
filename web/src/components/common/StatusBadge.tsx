const TONE_BY_STATUS: Record<string, string> = {
  active: 'erpnext-badge-green',
  enabled: 'erpnext-badge-green',
  completed: 'erpnext-badge-green',
  item_verified: 'erpnext-badge-green',
  box_verified: 'erpnext-badge-blue',
  submitted: 'erpnext-badge-green',
  accepted: 'erpnext-badge-green',
  ok: 'erpnext-badge-green',
  paid: 'erpnext-badge-green',

  pending: 'erpnext-badge-yellow',
  received: 'erpnext-badge-blue',
  exception: 'erpnext-badge-red',
  draft: 'erpnext-badge-yellow',
  disabled: 'erpnext-badge-yellow',
  inactive: 'erpnext-badge-yellow',
  review: 'erpnext-badge-yellow',
  hold: 'erpnext-badge-yellow',

  rejected: 'erpnext-badge-red',
  failed: 'erpnext-badge-red',
  cancelled: 'erpnext-badge-red',
  expired: 'erpnext-badge-red',
  error: 'erpnext-badge-red',

  scheduled: 'erpnext-badge-blue',
  confirmed: 'erpnext-badge-blue',
  open: 'erpnext-badge-blue',
  new: 'erpnext-badge-blue',
}

export type StatusTone = 'green' | 'yellow' | 'red' | 'blue'

interface StatusBadgeProps {
  /** Status value used for both the label and automatic tone detection. */
  status?: string
  /** Optional display label overriding the raw status text. */
  label?: string
  /** Force a tone instead of deriving it from the status text. */
  tone?: StatusTone
}

const TONE_CLASS: Record<StatusTone, string> = {
  green: 'erpnext-badge-green',
  yellow: 'erpnext-badge-yellow',
  red: 'erpnext-badge-red',
  blue: 'erpnext-badge-blue',
}

export function StatusBadge({ status, label, tone }: StatusBadgeProps) {
  const text = label ?? status ?? '—'
  const key = (status ?? '').trim().toLowerCase()
  const toneClass = tone
    ? TONE_CLASS[tone]
    : TONE_BY_STATUS[key] ?? 'erpnext-badge-blue'
  return <span className={`erpnext-badge ${toneClass}`}>{text}</span>
}

export default StatusBadge
