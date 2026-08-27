import { cn } from '@/lib/utils'

type ScanHeaderProps = {
  current: number
  total: number
  order: string
}

export function ScanHeader({ current, total, order }: ScanHeaderProps) {
  return (
    <header className="flex flex-col gap-3 px-1">
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-semibold leading-none tracking-tight tabular-nums">
            {current}
          </span>
          <span className="text-2xl font-medium leading-none text-muted-foreground tabular-nums">
            / {total}
          </span>
        </div>
        <span className="font-mono text-sm text-muted-foreground">{order}</span>
      </div>

      <div className="flex items-center gap-1.5" role="img" aria-label={`${current} of ${total} boxes scanned`}>
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              i < current ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
      </div>
    </header>
  )
}
