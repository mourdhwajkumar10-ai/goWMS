import { cn } from '../../lib/utils'

interface ProgressDotsProps {
  current: number
  total: number
  className?: string
}

export function ProgressDots({ current, total, className }: ProgressDotsProps) {
  if (total <= 0) return null

  return (
    <div className={cn('scan-progress-dots', className)} role="img" aria-label={`${current} of ${total} scanned`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'scan-progress-dot',
            i < current && 'done',
            i === current && 'current'
          )}
        />
      ))}
    </div>
  )
}