import type { ReactNode } from 'react'
import { MapPin, Package } from 'lucide-react'
import ScanCard from './ScanCard'
import type { ScanState } from './ScanViewport'

type Verdict = 'idle' | 'ok' | 'error' | 'blocked'

function mapVerdict(verdict: Verdict): ScanState {
  if (verdict === 'ok') return 'accepted'
  if (verdict === 'error' || verdict === 'blocked') return 'rejected'
  return 'idle'
}

type Props = {
  title: string
  subtitle?: string
  progressLabel?: string
  expectedHint?: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  /** Preferred for wedge/camera — avoids stale state on submit */
  onScan?: (code: string) => void
  qty?: number
  onQtyChange?: (n: number) => void
  showQty?: boolean
  verdict?: Verdict
  reason?: string
  footer?: ReactNode
  icon?: 'location' | 'item'
  cameraKey?: number | string
  idlePrompt?: string
  placeholder?: string
}

export default function ScanPrompt({
  title,
  subtitle,
  progressLabel,
  expectedHint,
  value,
  onChange,
  onSubmit,
  onScan,
  qty,
  onQtyChange,
  showQty,
  verdict = 'idle',
  reason,
  footer,
  icon = 'item',
  cameraKey = 0,
  idlePrompt,
  placeholder,
}: Props) {
  const Icon = icon === 'location' ? MapPin : Package
  const scanPlaceholder = placeholder ?? (icon === 'location' ? 'Scan location…' : 'Scan item…')

  function handleScan(code: string) {
    onChange(code)
    if (showQty) return
    if (onScan) onScan(code)
    else onSubmit()
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {progressLabel && (
        <div className="scan-section-title" style={{ opacity: 0.75 }}>{progressLabel}</div>
      )}
      <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={22} strokeWidth={1.8} />
          <div>
            <div className="scan-select-card-title">{title}</div>
            {subtitle && <div className="scan-select-card-sub">{subtitle}</div>}
          </div>
        </div>
        {expectedHint && (
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, letterSpacing: 0.5 }}>
            {expectedHint}
          </div>
        )}
      </div>

      <ScanCard
        state={mapVerdict(verdict)}
        code={value}
        reason={reason}
        onManualEntry={handleScan}
        onMarkDamaged={() => {}}
        canMarkDamaged={false}
        showMarkDamaged={false}
        onRestart={() => onChange('')}
        placeholder={scanPlaceholder}
        cameraKey={cameraKey}
        readyTitle={title}
        readySubtitle={subtitle}
        idlePrompt={idlePrompt ?? (icon === 'location' ? 'Scan location label' : 'Hold over the label')}
        showActionRow={false}
      />

      {showQty && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="scan-count-input"
            style={{ width: 88 }}
            type="number"
            min={1}
            value={qty ?? 1}
            onChange={e => onQtyChange?.(Math.max(1, Number(e.target.value) || 1))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSubmit() } }}
          />
          <button type="button" className="scan-btn scan-btn-primary" style={{ flex: 1 }} onClick={onSubmit}>
            Confirm
          </button>
        </div>
      )}

      {footer}
    </section>
  )
}
