import { ReactNode } from 'react'
import ListPager from '../ListPager'
import { useClientPager, ClientPager } from '../../hooks/useClientPager'

export interface FilterConfig {
  key: string
  label: string
  type: 'select' | 'date' | 'daterange'
  options?: { value: string; label: string }[]
  value?: string
  onChange: (key: string, value: string) => void
}

export interface FilterBarProps {
  search: { placeholder: string; value: string; onChange: (q: string) => void }
  filters?: FilterConfig[]
  leading?: ReactNode
  className?: string
}

export function FilterBar({ search, filters = [], leading, className }: FilterBarProps) {
  return (
    <div className={`list-pager desk-filter-bar ${className || ''}`}>
      {leading}
      <input
        className="erpnext-input text-sm list-pager-search desk-filter-search"
        value={search.value}
        onChange={(e) => search.onChange(e.target.value)}
        placeholder={search.placeholder}
        aria-label={search.placeholder}
      />
      {filters.map((filter) => (
        <div key={filter.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '12px', color: 'var(--text-dim)', marginRight: 4 }}>{filter.label}</label>
          {filter.type === 'select' && (
            <select
              className="erpnext-input"
              value={filter.value || ''}
              onChange={(e) => filter.onChange(filter.key, e.target.value)}
              style={{ minWidth: 140, maxWidth: 180, flex: '0 0 auto', minHeight: 34, padding: '6px 10px', fontSize: '13px' }}
            >
              <option value="">All</option>
              {filter.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          {filter.type === 'date' && (
            <input
              type="date"
              className="erpnext-input"
              value={filter.value || ''}
              onChange={(e) => filter.onChange(filter.key, e.target.value)}
              style={{ minWidth: 140, maxWidth: 180, flex: '0 0 auto', minHeight: 34, padding: '6px 10px', fontSize: '13px' }}
            />
          )}
        </div>
      ))}
      <ListPager
        pager={null as any} // Will be replaced by parent
        placeholder={search.placeholder}
      />
    </div>
  )
}

// Re-export ListPager for consumers
export { ListPager }