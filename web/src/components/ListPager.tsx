import type { ReactNode } from 'react'
import type { ClientPager } from '../hooks/useClientPager'

type Props = {
  pager: ClientPager
  placeholder?: string
  className?: string
  /** Optional controls before search (status chips, selects) — stays on same row */
  leading?: ReactNode
}

export default function ListPager({ pager, placeholder = 'Search…', className, leading }: Props) {
  return (
    <div className={`list-pager desk-filter-bar ${className || ''}`}>
      {leading}
      <input
        className="erpnext-input text-sm list-pager-search desk-filter-search"
        value={pager.q}
        onChange={(e) => pager.setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <div className="list-pager-meta desk-filter-meta">
        <span>
          {pager.total === 0 ? '0' : `${pager.from}–${pager.to}`} of {pager.total}
          {' · '}{pager.pageSize} / page
        </span>
        <button
          type="button"
          className="erpnext-btn-secondary text-xs"
          disabled={pager.page <= 1}
          onClick={() => pager.setPage(pager.page - 1)}
        >
          Prev
        </button>
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
          {pager.page} / {pager.pages}
        </span>
        <button
          type="button"
          className="erpnext-btn-secondary text-xs"
          disabled={pager.page >= pager.pages}
          onClick={() => pager.setPage(pager.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}
