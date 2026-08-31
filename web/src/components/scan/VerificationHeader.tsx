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
    <header className="scan-verification-header">
      <div className="scan-verification-header-top">
        <div className="scan-verification-header-title-wrap">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="scan-verification-back"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <h1 className="scan-verification-title">{title}</h1>
        </div>
        <div className="scan-verification-counter">
          <span className="scan-verification-counted">{counted}</span>
          <span className="scan-verification-total">/{total}</span>
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
