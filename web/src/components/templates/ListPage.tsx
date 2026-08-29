import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
}

interface ListPageAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'primary' | 'secondary'
}

interface ListPageProps<T> {
  title: string
  description?: string
  columns: Column<T>[]
  data: T[]
  pager?: any
  search?: { placeholder?: string; value?: string; onChange?: (q: string) => void }
  filters?: any[]
  toolbar?: React.ReactNode
  actions?: ListPageAction[]
  emptyState?: { icon?: string; title: string; message?: string }
  onRowClick?: (row: T) => void
  children?: React.ReactNode
  detailPanel?: React.ReactNode
  className?: string
}

function rowKey(row: any, index: number): string {
  const id = row?.id ?? row?.ID ?? row?.code
  return id !== undefined && id !== null ? String(id) : `row-${index}`
}

/**
 * Shared desk list-page template: header with title/description/actions,
 * optional client-side search, and a consistent erpnext-style table.
 */
export function ListPage<T>({
  title,
  description,
  columns,
  data,
  pager,
  search,
  toolbar,
  actions,
  emptyState,
  onRowClick,
  children,
  detailPanel,
  className,
}: ListPageProps<T>) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data
    return data.filter((row: any) =>
      columns.some(col => {
        const raw = row?.[col.key]
        const text = raw === undefined || raw === null ? '' : String(raw)
        return text.toLowerCase().includes(q)
      })
    )
  }, [data, columns, query])

  const onSearch = (q: string) => {
    setQuery(q)
    search?.onChange?.(q)
  }

  const btnClass = (variant?: ListPageAction['variant']) =>
    variant === 'secondary' ? 'erpnext-btn-secondary' : 'erpnext-btn-primary'

  return (
    <div className="desk-page space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-sub">{description}</p>}
        </div>
        {actions && actions.length > 0 && (
          <div className="page-actions flex gap-2">
            {actions.map((a, i) => (
              <button key={i} onClick={a.onClick} className={btnClass(a.variant)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {toolbar && <div className="erpnext-card px-4 py-3">{toolbar}</div>}

      {search && (
        <div className="erpnext-card px-4 py-3">
          <input
            className="erpnext-input"
            style={{ maxWidth: 360 }}
            value={search.value ?? query}
            onChange={e => onSearch(e.target.value)}
            placeholder={search.placeholder || 'Search…'}
          />
        </div>
      )}

      {children && <div style={{ marginTop: 12 }}>{children}</div>}

      <div className="erpnext-card">
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                {columns.map(col => (
                  <th key={col.key}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={rowKey(row, i)} onClick={() => onRowClick?.(row)} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                  {columns.map(col => (
                    <td key={col.key}>
                      {col.render
                        ? col.render(row)
                        : (() => {
                            const raw = (row as any)?.[col.key]
                            return raw === undefined || raw === null || raw === '' ? '—' : String(raw)
                          })()}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="text-center py-10" style={{ color: 'var(--text-dim)' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{emptyState?.icon || '📭'}</div>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{emptyState?.title || 'Nothing here yet'}</div>
                    {emptyState?.message && <div style={{ marginTop: 4 }}>{emptyState.message}</div>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailPanel && <div style={{ marginTop: 12 }}>{detailPanel}</div>}
    </div>
  )
}

export default ListPage
