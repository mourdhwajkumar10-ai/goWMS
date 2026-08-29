import { cn } from '../../lib/utils'

interface ProgressBarProps {
  percent: number
  animate?: boolean
  variant?: 'dots' | 'bar'
  className?: string
}

export function ProgressBar({ percent, animate = true, variant = 'bar', className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, percent))

  if (variant === 'dots') {
    // For dots variant, we'd use ProgressDots instead
    return null
  }

  return (
    <div className={cn('scan-progress-bar', className)} role="img" aria-label={`${Math.round(pct)} percent`}>
      <div
        className={cn('scan-progress-fill', animate && 'animate-verdict')}
        style={{ width: `${Math.max(pct, 1.5)}%` }}
      />
    </div>
  )
}