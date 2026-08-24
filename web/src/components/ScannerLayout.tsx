import { useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export interface ScannerToast {
  id: number
  text: string
  type: 'ok' | 'warn' | 'err'
}

interface ScannerLayoutProps {
  title: string
  /** Big number shown in header, e.g. "3" */
  stat?: string
  /** Small denominator next to stat, e.g. "/ 12" */
  statOf?: string
  /** Monospace label under stats, e.g. "PO-882910-B" */
  meta?: string
  liveBadge?: string
  warnBadge?: string
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
  flash?: 'ok' | 'err' | null
  /** If true, hide the back button */
  noBack?: boolean
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
}: ScannerLayoutProps) {
  const navigate = useNavigate()
  return (
    <div className="scanner-root">
      {/* Header */}
      <div className="scanner-header">
        {!noBack && (
          <button
            className="scanner-header-back"
            onClick={onBack ?? (() => navigate(-1))}
            aria-label="Back"
          >
            ←
          </button>
        )}
        <div className="scanner-header-stats" style={{ flex: 1 }}>
          {stat != null && (
            <>
              <span className="scanner-header-big">{stat}</span>
              {statOf != null && (
                <span className="scanner-header-small">{statOf}</span>
              )}
            </>
          )}
          {stat == null && (
            <span className="scanner-header-big" style={{ fontSize: 18, fontWeight: 600 }}>
              {title}
            </span>
          )}
        </div>
        {meta && <span className="scanner-header-meta">{meta}</span>}
        {liveBadge && <span className="scanner-header-badge live">{liveBadge}</span>}
        {warnBadge && <span className="scanner-header-badge warn">{warnBadge}</span>}
      </div>

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