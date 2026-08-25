import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'

interface ShortcutCardProps {
  to: string
  title: string
  description: string
  Icon: React.ComponentType<any>
  className?: string
}

export function ShortcutCard({ to, title, description, Icon, className }: ShortcutCardProps) {
  return (
    <Link
      to={to}
      className={cn('card', className)}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        minHeight: 128,
        padding: 24,
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 12,
          background: 'var(--secondary)',
          color: 'var(--muted-foreground)',
          flexShrink: 0,
        }}
      >
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <span>
        <span style={{ display: 'block', fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--heading-color)' }}>{title}</span>
        <span style={{ display: 'block', marginTop: 8, fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)' }}>{description}</span>
      </span>
    </Link>
  )
}

export function ShortcutGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid cols-3">{children}</div>
}
