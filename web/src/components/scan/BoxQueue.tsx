import { useState } from 'react'
import { Check, Search } from 'lucide-react'
import { useLoadMore } from '../../hooks/useLoadMore'

export type BoxStatus = 'pending' | 'counted' | 'damaged' | 'flagged'
export type Box = { id: string; items: number; units: number; scannedUnits?: number; status: BoxStatus }

type Props = {
  boxes: Box[]
  onDamaged: (id: string) => void
  query?: string
  onQueryChange?: (value: string) => void
  onViewAll?: () => void
}

export default function BoxQueue({ boxes, onDamaged, query: controlledQuery, onQueryChange, onViewAll }: Props) {
  const [internalQuery, setInternalQuery] = useState('')
  const isControlled = controlledQuery !== undefined && onQueryChange !== undefined
  const query = isControlled ? controlledQuery! : internalQuery
  const setQuery = isControlled ? onQueryChange! : setInternalQuery
  const pending = boxes.filter((b) => b.status === 'pending')
  const filtered = query ? pending.filter((b) => b.id.toLowerCase().includes(query.toLowerCase())) : pending
  const more = useLoadMore(filtered, 10, `${query}|${filtered.length}`)

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 4 }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Next boxes <span style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>{pending.length}</span>
        </h2>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 40,
            minWidth: 0,
            flex: '1 1 auto',
            maxWidth: 152,
            padding: '0 12px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted-foreground)' }} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter"
            aria-label="Filter box ID"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              background: 'transparent',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }}
          />
        </div>
      </div>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
        {more.visible.map((box, i) => (
          <li
            key={box.id}
            className={`scan-row ${i === 0 ? 'ring-accent' : ''}`}
            style={{ padding: '12px 16px' }}
          >
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {box.id}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
                {box.items} {box.items === 1 ? 'item' : 'items'} · {box.units} units
              </span>
            </div>
            {i === 0 ? (
              <span
                style={{
                  flexShrink: 0,
                  borderRadius: 9999,
                  background: 'oklch(0.7 0.16 155 / 0.12)',
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                }}
              >
                Scanning
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onDamaged(box.id)}
                className="scan-btn scan-btn-outline"
                style={{ width: 'auto', minHeight: 32, padding: '4px 12px', fontSize: 12 }}
              >
                Damaged
              </button>
            )}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="scan-row" style={{ justifyContent: 'center', padding: 32, color: 'var(--muted-foreground)', fontSize: 14 }}>
            <Check className="h-4 w-4" style={{ color: 'var(--accent)', marginRight: 8 }} aria-hidden="true" />
            {query ? 'No match' : 'All boxes counted'}
          </li>
        )}
      </ul>
      {more.hasMore && (
        <button type="button" className="scan-btn scan-btn-outline" onClick={more.loadMore}>
          Load more ({more.remaining} left)
        </button>
      )}
      {onViewAll && filtered.length > 0 && (
        <button
          type="button"
          onClick={onViewAll}
          style={{ padding: 8, fontSize: 14, fontWeight: 500, color: 'var(--muted-foreground)', border: 0, background: 'transparent' }}
        >
          View all {filtered.length} boxes
        </button>
      )}
    </section>
  )
}
