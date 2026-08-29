import { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { useClientPager, ClientPager } from '../../hooks/useClientPager'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  className?: string
  sortable?: boolean
  width?: string
}

export interface PagerInterface<T> {
  pageItems: T[]
  total: number
  page: number
  pageSize: number
  setPage: (page: number) => void
  setQ: (q: string) => void
  q: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  pager: PagerInterface<T>
  emptyState?: EmptyStateProps
  rowKey: keyof T | ((row: T) => string)
  onRowClick?: (row: T) => void
  className?: string
}

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  message?: string
  action?: { label: string; onClick: () => void; variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link' }
  className?: string
}

// FilterConfig is exported from FilterBar

export function DataTable<T>({ columns, data, pager, emptyState, rowKey, onRowClick, className }: DataTableProps<T>) {
  const getKey = (row: T) => typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey as keyof T])

  if (data.length === 0) {
    return (
      <div className="scan-empty" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div className="scan-empty-icon" style={{ fontSize: 40, opacity: 0.5, marginBottom: 12 }}>
          {emptyState?.icon || '📦'}
        </div>
        <div className="scan-empty-title" style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          {emptyState?.title || 'No data'}
        </div>
        {emptyState?.message && (
          <div className="scan-empty-msg" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {emptyState.message}
          </div>
        )}
        {emptyState?.action && (
          <button
            type="button"
            className="erpnext-btn-primary"
            style={{ marginTop: 16 }}
            onClick={emptyState.action.onClick}
          >
            {emptyState.action.label}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn('table-wrap', className)}>
      <table className="erpnext-table">
        <thead>
          <tr style={{ background: 'var(--panel-2)' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  color: 'var(--muted-foreground)',
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderBottom: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pager.pageItems.map((row) => (
            <tr
              key={getKey(row)}
              style={{
                cursor: onRowClick ? 'pointer' : 'default',
              }}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(col.className)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid oklch(0.912 0.005 250 / 0.6)',
                    whiteSpace: 'nowrap',
                    color: 'var(--foreground)',
                    verticalAlign: 'middle',
                  }}
                >
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
          {pager.pageItems.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}