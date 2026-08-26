import type { ReactNode } from 'react'
import { MapPin, Package, ScanLine } from 'lucide-react'

type Props = {
  title: string
  subtitle?: string
  progressLabel?: string
  expectedHint?: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  qty?: number
  onQtyChange?: (n: number) => void
  showQty?: boolean
  verdict?: 'idle' | 'ok' | 'error' | 'blocked'
  reason?: string
  viewport?: ReactNode
  footer?: ReactNode
  icon?: 'location' | 'item'
}

export default function ScanPrompt({
  title,
  subtitle,
  progressLabel,
  expectedHint,
  value,
  onChange,
  onSubmit,
  qty,
  onQtyChange,
  showQty,
  verdict = 'idle',
  reason,
  viewport,
  footer,
  icon = 'item',
}: Props) {
  const Icon = icon === 'location' ? MapPin : Package
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

      {viewport}

      {verdict !== 'idle' && (
        <div
          className="scan-section-card"
          style={{
            borderColor: verdict === 'ok' ? 'var(--success, #2e7d32)' : 'var(--danger, #c62828)',
            color: verdict === 'ok' ? 'var(--success, #2e7d32)' : 'var(--danger, #c62828)',
          }}
        >
          {verdict === 'ok' ? 'OK' : reason || 'Blocked'}
        </div>
      )}

      <div className="scan-bottom-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div className="scan-input-chip">
          <ScanLine size={16} strokeWidth={1.8} />
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSubmit() } }}
            placeholder={icon === 'location' ? 'Scan location…' : 'Scan item…'}
            autoComplete="off"
            autoFocus
          />
        </div>
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
        {!showQty && (
          <button type="button" className="scan-btn scan-btn-primary" onClick={onSubmit}>
            Confirm scan
          </button>
        )}
      </div>
      {footer}
    </section>
  )
}
