import type { ReactNode } from 'react'

export default function ProblemSheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="erpnext-card w-full max-w-2xl mx-3 mb-3 md:mb-0 max-h-[85dvh] overflow-auto p-5 space-y-4" style={{ background: 'var(--panel)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {subtitle ? <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{subtitle}</p> : null}
          </div>
          <button type="button" className="erpnext-btn-secondary text-xs" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}
