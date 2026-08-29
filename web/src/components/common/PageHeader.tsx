import { ReactNode } from 'react'
import { Button } from '../ui/Button'

interface Action {
  label: string
  onClick: () => void
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
  icon?: ReactNode
  disabled?: boolean
  className?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  actions?: Action[]
  breadcrumbs?: Array<{ label: string; onClick?: () => void }>
  className?: string
}

export function PageHeader({
  title,
  description,
  actions = [],
  breadcrumbs,
  className
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${className || ''}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-dim)' }}>
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              {b.onClick ? (
                <button
                  type="button"
                  onClick={b.onClick}
                  className="hover:underline"
                  style={{ color: 'var(--text-dim)' }}
                >
                  {b.label}
                </button>
              ) : (
                <span className="font-medium" style={{ color: 'var(--text)' }}>{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{title}</h1>
          {description && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{description}</p>
          )}
        </div>
        {actions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {actions.map((action, i) => (
              <Button
                key={i}
                variant={action.variant || 'default'}
                onClick={action.onClick}
                disabled={action.disabled}
                className={action.className}
              >
                {action.icon && <span className="mr-1">{action.icon}</span>}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}