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
    <section className="box-queue-section scan-rf-block">
      <div className="box-queue-head">
        <h2 className="box-queue-title">
          Next boxes
          <span className="box-queue-count">{pending.length}</span>
        </h2>
        <div className="box-queue-filter">
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted-foreground)' }} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter"
            aria-label="Filter box ID"
          />
        </div>
      </div>

      <ul className="box-queue-list">
        {more.visible.map((box, i) => (
          <li
            key={box.id}
            className={`scan-row ${i === 0 ? 'ring-accent' : ''}`}
          >
            <div className="scan-row-info">
              <span className="scan-row-code">{box.id}</span>
              <span className="scan-row-desc">
                {box.items} {box.items === 1 ? 'item' : 'items'} · {box.units} units
              </span>
            </div>
            {i === 0 ? (
              <span className="box-queue-scanning-badge">Scanning</span>
            ) : (
              <button
                type="button"
                onClick={() => onDamaged(box.id)}
                className="box-queue-damaged-btn"
              >
                Damaged
              </button>
            )}
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="scan-row box-queue-empty">
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
        <button type="button" className="box-queue-view-all" onClick={onViewAll}>
          View all {filtered.length} boxes
        </button>
      )}
    </section>
  )
}
