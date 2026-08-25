import * as React from 'react'
import { cn } from '../../lib/utils'

type Variant = 'default' | 'green' | 'blue' | 'yellow' | 'red' | 'amber'

const variantClass: Record<Variant, string> = {
  default: 'erpnext-badge-yellow',
  green: 'erpnext-badge-green',
  blue: 'erpnext-badge-blue',
  yellow: 'erpnext-badge-yellow',
  red: 'erpnext-badge-red',
  amber: 'badge amber',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
  dot?: boolean
}

export function Badge({ className, variant = 'default', dot = true, ...props }: BadgeProps) {
  return <span className={cn('erpnext-badge', variantClass[variant], className)} {...props} />
}

// Helper to map status string → badge variant (replaces 39 duplicated statusBadge functions)
export function statusToVariant(status?: string): Variant {
  const s = (status || '').toLowerCase()
  if (['completed', 'closed', 'full_match', 'submitted', 'available', 'accepted'].includes(s)) return 'green'
  if (['exception_pending', 'stuck', 'shortage', 'damage', 'rejected', 'excess'].includes(s)) return 'red'
  if (['receiving', 'open', 'ready_to_receive', 'in_transit'].includes(s)) return 'green'
  if (['draft', 'pending', 'shortage'].includes(s)) return 'yellow'
  return 'blue'
}
