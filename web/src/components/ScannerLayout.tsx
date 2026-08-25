import { useState, useCallback, type ReactNode, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { getRole } from '../services/api'
import { goBackOrHome, homePathForSession } from '../utils/roleAccess'

export interface ScannerToast {
  id: number
  text: string
  type: 'ok' | 'warn' | 'err'
}

export type ScannerTab = { label: string; active?: boolean; onClick: () => void }
export type ScannerDoc = { label: string; value: string; active?: boolean }

interface ScannerLayoutProps {
  title: string
  stat?: string
  statOf?: string
  meta?: string
  liveBadge?: string
  warnBadge?: string
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
  flash?: 'ok' | 'err' | null
  noBack?: boolean
  /** C: progress dots / bar */
  progressCurrent?: number
  progressTotal?: number
  progressVariant?: 'dots' | 'bar'
  /** C: PO → PL → GRN chips */
  docs?: ScannerDoc[]
  /** C: Boxes / Items pill tabs */
  tabs?: ScannerTab[]
  eyebrow?: string
  hideHeader?: boolean
}

export function useScannerToasts() {
  const [toasts, setToasts] = useState<ScannerToast[]>([])
  const toast = useCallback((text: string, type: 'ok' | 'warn' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(p => [...p.slice(-2), { id, text, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2200)
  }, [])
  return { toasts, toast }
}

export default function ScannerLayout({
  title, stat, statOf, meta, liveBadge, warnBadge,
  onBack, children, footer, flash, noBack,
  progressCurrent, progressTotal, progressVariant = 'dots', docs, tabs, eyebrow, hideHeader,
}: ScannerLayoutProps) {
  const navigate = useNavigate()
  // Derive progress from stat/statOf when explicit props not passed
  const toNum = (v: string | undefined) => {
    if (v == null) return undefined
    const n = Number(String(v).replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }
  const derivedCurrent = progressCurrent ?? toNum(stat)
  const derivedTotal = progressTotal ?? toNum(statOf)
  const hasProgress = derivedCurrent != null && derivedTotal != null && Number.isFinite(derivedCurrent) && Number.isFinite(derivedTotal) && derivedTotal > 0
  const pct = hasProgress ? Math.round((derivedCurrent! / derivedTotal!) * 100) : 0
  return (
    <div className="scanner-root">
      {/* Header — C ScanHeader + VerificationHeader language */}
      {!hideHeader && (
        <div className="scanner-header">
          {eyebrow && <span className="scan-eyebrow">{eyebrow}</span>}
          <div className="scanner-header-top">
            {!noBack && (
              <button
                type="button"
                className="scanner-header-back"
                onClick={onBack ?? (() => goBackOrHome(navigate, homePathForSession(getRole())))}
                aria-label="Back"
              >
                <ArrowLeft size={16} strokeWidth={2} />
              </button>
            )}
          <div className="scanner-header-stats" style={{ flex: 1 }}>
            {stat != null ? (
              <>
                <span className="scanner-header-big">{stat}</span>
                {statOf != null && <span className="scanner-header-small">{statOf}</span>}
              </>
            ) : (
              <span className="scanner-header-big" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>
                {title}
              </span>
            )}
          </div>
          {meta && <span className="scanner-header-meta">{meta}</span>}
          {liveBadge && <span className="scanner-header-badge live">{liveBadge}</span>}
          {warnBadge && <span className="scanner-header-badge warn">{warnBadge}</span>}
        </div>
        {hasProgress && progressVariant === 'dots' && (
          <div className="scan-progress-dots" role="img" aria-label={`${derivedCurrent} of ${derivedTotal} scanned`}>
            {Array.from({ length: derivedTotal! }).map((_, i) => (
              <span key={i} className={`scan-progress-dot ${i < derivedCurrent! ? 'done' : i === derivedCurrent! ? 'current' : ''}`} />
            ))}
          </div>
        )}
        {hasProgress && progressVariant === 'bar' && (
          <div className="scan-progress-bar" role="img" aria-label={`${derivedCurrent} of ${derivedTotal} boxes counted, ${pct} percent`}>
            <div className="scan-progress-fill" style={{ width: `${Math.max(pct, 1.5)}%` }} />
          </div>
        )}
          {docs && docs.length > 0 && (
            <div className="scan-doc-row">
              {docs.map((d, idx) => (
                <Fragment key={d.label}>
                  <div className={`scan-doc-chip ${d.active ? 'active' : ''}`}>
                    <span className="scan-doc-chip-label">{d.label}</span>
                    <span className="scan-doc-chip-value">{d.value}</span>
                  </div>
                  {idx < docs.length - 1 && <ArrowRight size={12} strokeWidth={2} className="scan-doc-arrow" />}
                </Fragment>
              ))}
            </div>
          )}
          {tabs && tabs.length > 0 && (
            <div className="scan-tabs">
              {tabs.map(t => (
                <button key={t.label} type="button" className={`scan-tab ${t.active ? 'active' : ''}`} onClick={t.onClick} aria-pressed={t.active}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--sm-gap, 12px)' }}>
        {children}
      </div>

      {/* Footer */}
      {footer && <div className="scanner-footer">{footer}</div>}

      {/* Flash overlay */}
      {flash && <div className={`scan-flash show ${flash}`} />}
    </div>
  )
}

export function ScannerToastBar({ toasts }: { toasts: ScannerToast[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="scan-toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`scan-toast ${t.type}`}>{t.text}</div>
      ))}
    </div>
  )
}