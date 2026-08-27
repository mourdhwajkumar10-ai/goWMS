'use client'

import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Tab = 'boxes' | 'items'

type VerificationHeaderProps = {
  counted: number
  total: number
  po: string
  pl: string
  grn: string
  tab: Tab
  onTabChange: (tab: Tab) => void
}

export function VerificationHeader({
  counted,
  total,
  po,
  pl,
  grn,
  tab,
  onTabChange,
}: VerificationHeaderProps) {
  const pct = Math.round((counted / total) * 100)

  return (
    <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border/70 bg-background/95 px-4 pb-3 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-muted-foreground transition active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Back</span>
          </button>
          <h1 className="truncate text-lg font-semibold tracking-tight">Box verification</h1>
        </div>

        <div className="flex shrink-0 items-baseline gap-1">
          <span className="text-4xl font-semibold leading-none tracking-tight tabular-nums">
            {counted}
          </span>
          <span className="text-xl font-medium leading-none text-muted-foreground tabular-nums">
            /{total}
          </span>
        </div>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`${counted} of ${total} boxes counted, ${pct} percent`}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(pct, 1.5)}%` }}
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-hidden">
        <DocChip label="PO" value={po} />
        <Arrow />
        <DocChip label="PL" value={pl} />
        <Arrow />
        <DocChip label="GRN" value={grn} active />
      </div>

      <div className="flex gap-1 rounded-full bg-muted p-1">
        <Tab label="Boxes" active={tab === 'boxes'} onClick={() => onTabChange('boxes')} />
        <Tab label="Items" active={tab === 'items'} onClick={() => onTabChange('items')} />
      </div>
    </header>
  )
}

function DocChip({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-2.5 py-1.5',
        active ? 'bg-primary text-primary-foreground' : 'bg-card',
      )}
    >
      <span
        className={cn(
          'text-[10px] font-medium uppercase tracking-wider',
          active ? 'opacity-60' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      <span className="truncate font-mono text-xs font-medium">{value}</span>
    </div>
  )
}

function Arrow() {
  return <span className="shrink-0 text-xs text-muted-foreground">&rarr;</span>
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-1 rounded-full py-2 text-sm font-medium transition',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
      )}
    >
      {label}
    </button>
  )
}
