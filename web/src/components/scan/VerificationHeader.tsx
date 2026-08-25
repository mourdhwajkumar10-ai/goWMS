import { ArrowLeft } from 'lucide-react'

export type Tab = 'boxes' | 'items'

type Props = {
  counted: number
  total: number
  po: string
  pl: string
  grn: string
  tab: Tab
  onTabChange: (tab: Tab) => void
  onBack?: () => void
  title?: string
  itemsDisabled?: boolean
}

export default function VerificationHeader({
  counted,
  total,
  po,
  pl,
  grn,
  tab,
  onTabChange,
  onBack,
  title = 'Box verification',
  itemsDisabled = false,
}: Props) {
  const pct = Math.round((counted / total) * 100)
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderBottom: '1px solid var(--border)',
        background: 'var(--background)',
        padding: '16px 16px 12px',
        margin: '-20px -16px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 9999,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--muted-foreground)',
            }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Back</span>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>{counted}</span>
          <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>/{total}</span>
        </div>
      </div>
      <div className="scan-progress-bar" role="img" aria-label={`${counted} of ${total} boxes counted, ${pct} percent`}>
        <div className="scan-progress-fill" style={{ width: `${Math.max(pct, 1.5)}%` }} />
      </div>
      <div className="scan-doc-row">
        <div className="scan-doc-chip">
          <span className="scan-doc-chip-label">PO</span>
          <span className="scan-doc-chip-value">{po}</span>
        </div>
        <span className="scan-doc-arrow">→</span>
        <div className="scan-doc-chip">
          <span className="scan-doc-chip-label">PL</span>
          <span className="scan-doc-chip-value">{pl}</span>
        </div>
        <span className="scan-doc-arrow">→</span>
        <div className="scan-doc-chip active">
          <span className="scan-doc-chip-label">GRN</span>
          <span className="scan-doc-chip-value">{grn}</span>
        </div>
      </div>
      <div className="scan-tabs">
        <button type="button" className={`scan-tab ${tab === 'boxes' ? 'active' : ''}`} onClick={() => onTabChange('boxes')} aria-pressed={tab === 'boxes'}>
          Boxes
        </button>
        <button
          type="button"
          className={`scan-tab ${tab === 'items' ? 'active' : ''}`}
          onClick={() => onTabChange('items')}
          aria-pressed={tab === 'items'}
          disabled={itemsDisabled}
          style={itemsDisabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          Items
        </button>
      </div>
    </header>
  )
}
