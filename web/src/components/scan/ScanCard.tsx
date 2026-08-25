import { useState, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import ScanViewport, { type ScanState } from './ScanViewport'
import ScanVerdict from './ScanVerdict'

type Props = {
  state: ScanState
  code?: string
  reason?: string
  onMarkDamaged: () => void
  canMarkDamaged: boolean
  onRestart: () => void
  onManualEntry: (code: string) => void
  /** @deprecated Ignored — use `viewport` with CameraScanner */
  imageSrc?: string
  /** Live camera (CameraScanner) — required for RF scanning; without it a clear text fallback is shown */
  viewport?: ReactNode
  placeholder?: string
  showMarkDamaged?: boolean
  markDamagedLabel?: string
}

export default function ScanCard({
  state,
  code,
  reason,
  onMarkDamaged,
  canMarkDamaged,
  onRestart,
  onManualEntry,
  viewport,
  placeholder = 'Type box number',
  showMarkDamaged = true,
  markDamagedLabel = 'Mark damaged',
}: Props) {
  const [value, setValue] = useState('')
  function submit() {
    if (!value.trim()) return
    onManualEntry(value.trim())
    setValue('')
  }
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {viewport ?? <ScanViewport state={state} />}
      <ScanVerdict state={state} code={code} reason={reason} />
      <div style={{ display: 'flex', gap: 8 }}>
        {showMarkDamaged && (
          <button
            type="button"
            onClick={onMarkDamaged}
            disabled={!canMarkDamaged}
            className="scan-btn scan-btn-outline"
            style={{ flex: 1, minHeight: 48, color: 'var(--destructive)', borderColor: 'oklch(0.912 0.005 250 / 0.7)' }}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {markDamagedLabel}
          </button>
        )}
        <button type="button" onClick={onRestart} className="scan-icon-btn" aria-label="Restart scanner">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="scan-count-input"
          style={{ flex: 1, minHeight: 48, fontSize: 15, textAlign: 'left' }}
        />
        <button type="button" onClick={submit} className="scan-btn scan-btn-primary" style={{ width: 'auto', padding: '0 20px' }}>
          Enter
        </button>
      </div>
    </section>
  )
}
