'use client'

import { Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BoxStatus = 'pending' | 'counted' | 'damaged' | 'flagged'

export type Box = {
  id: string
  items: number
  units: number
  status: BoxStatus
}

type BoxQueueProps = {
  boxes: Box[]
  query: string
  onQueryChange: (value: string) => void
  onDamaged: (id: string) => void
}

const VISIBLE = 4

export function BoxQueue({ boxes, query, onQueryChange, onDamaged }: BoxQueueProps) {
  const pending = boxes.filter((b) => b.status === 'pending')
  const filtered = query ? pending.filter((b) => b.id.includes(query)) : pending

  return (
    <section className="flex flex-col gap-3 px-4 pb-4">
      <div className="flex items-center justify-between gap-3 pt-1">
        <h2 className="text-sm font-medium text-muted-foreground">
          Next boxes
          <span className="ml-1.5 tabular-nums">{pending.length}</span>
        </h2>
        <div className="flex h-10 min-w-0 flex-1 max-w-[9.5rem] items-center gap-2 rounded-xl bg-card px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Filter"
            aria-label="Filter box ID"
            className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {filtered.slice(0, VISIBLE).map((box, i) => (
          <li
            key={box.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border border-border/70 bg-card px-4 py-3',
              i === 0 && 'ring-2 ring-accent/35',
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-mono text-sm font-medium">{box.id}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {box.items} {box.items === 1 ? 'item' : 'items'} &middot; {box.units} units
              </span>
            </div>

            {i === 0 ? (
              <span className="shrink-0 rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-accent">
                Scanning
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onDamaged(box.id)}
                className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-destructive transition active:scale-95"
              >
                Damaged
              </button>
            )}
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="flex items-center justify-center gap-2 rounded-lg border border-border/70 bg-card py-8 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-accent" aria-hidden="true" />
            {query ? 'No match' : 'All boxes counted'}
          </li>
        )}
      </ul>

      {filtered.length > VISIBLE && (
        <button
          type="button"
          className="rounded-xl py-2 text-sm font-medium text-muted-foreground transition active:scale-[0.98]"
        >
          View all {filtered.length} boxes
        </button>
      )}
    </section>
  )
}
