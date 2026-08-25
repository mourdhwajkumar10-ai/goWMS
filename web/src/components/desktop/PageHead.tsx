import * as React from 'react'

interface PageHeadProps {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHead({ eyebrow, title, subtitle, actions }: PageHeadProps) {
  return (
    <div className="page-head desk-page-head">
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function SectionHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="section-head desk-toolbar-row">
      <h2 style={{ margin: 0 }}>{title}</h2>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}
