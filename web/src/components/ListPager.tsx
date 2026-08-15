import type { ClientPager } from '../hooks/useClientPager'

type Props = {
  pager: ClientPager
  placeholder?: string
  className?: string
}

export default function ListPager({ pager, placeholder = 'Search…', className }: Props) {
  return (
    <div className={`list-pager ${className || ''}`}>
      <input
        className="erpnext-input text-sm list-pager-search"
        value={pager.q}
        onChange={(e) => pager.setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <div className="list-pager-meta">
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
