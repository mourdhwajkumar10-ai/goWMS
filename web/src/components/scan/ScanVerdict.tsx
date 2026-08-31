import { Check, RotateCcw, X } from 'lucide-react'
import type { ScanState } from './ScanViewport'

type Props = { state: ScanState; code?: string; reason?: string; idlePrompt?: string }

export default function ScanVerdict({ state, code, reason, idlePrompt = 'Hold over the label' }: Props) {
  if (state === 'idle') {
    return (
      <div className="scan-prompt">
        <span className="scan-prompt-dot" />
        <span className="scan-prompt-text">{idlePrompt}</span>
      </div>
    )
  }
  const tone =
    state === 'accepted'
      ? { cls: 'ok', label: 'Counted', Icon: Check }
      : state === 'rejected'
        ? { cls: 'err', label: 'Rejected', Icon: X }
        : state === 'warning'
          ? { cls: 'warn', label: 'Already counted', Icon: RotateCcw }
          : { cls: 'warn', label: 'Try again', Icon: RotateCcw }
  const { cls, label, Icon } = tone
  return (
    <div className={`scan-verdict ${cls}`} aria-live="assertive">
      <Icon className="scan-verdict-icon" aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="scan-verdict-label">{label}</span>
        <span className="scan-verdict-meta">{state === 'timeout' ? 'No code found' : reason || code || ''}</span>
      </div>
    </div>
  )
}
