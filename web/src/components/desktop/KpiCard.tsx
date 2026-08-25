import { cn } from '../../lib/utils'

interface KpiCardProps {
  label: string
  value: string | number
  tone?: '' | 'accent' | 'green' | 'amber' | 'red'
  className?: string
}

export function KpiCard({ label, value, tone = '', className }: KpiCardProps) {
  return (
    <div className={cn('card kpi', tone, className)}>
      <span className="value">{value}</span>
      <span className="label">{label}</span>
    </div>
  )
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid cols-3">{children}</div>
}
