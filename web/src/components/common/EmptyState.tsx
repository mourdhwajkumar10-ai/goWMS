import { ReactNode } from 'react'
import { Button } from '../ui/Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  message?: string
  action?: {
    label: string
    onClick: () => void
    variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
  }
  className?: string
}

export function EmptyState({ icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div className={`scan-empty ${className || ''}`}>
      <div className="scan-empty-icon">
        {icon || <span style={{ fontSize: 40, opacity: 0.5 }}>📦</span>}
      </div>
      <div className="scan-empty-title">{title}</div>
      {message && <div className="scan-empty-msg">{message}</div>}
      {action && (
        <Button variant={action.variant || 'default'} onClick={action.onClick} className="mt-3">
          {action.label}
        </Button>
      )}
    </div>
  )
}