import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ButtonPress from '../components/ButtonPress'

interface LogEntry {
  id: number
  log_no: string
  item_code: string
  item_name: string | null
  quantity: number
  source_location_code: string
  source_aisle: string
  source_shelf: string
  source_level: string
  target_location_code: string
  target_aisle: string
  target_shelf: string
  target_level: string
  placed_by: string
  placed_at: string
  exception_reason: string
  is_override: boolean
}

interface Pagination {
  page: number
  limit: number
  total: number
  total_pages: number
}

interface LogsResponse {
  data: LogEntry[]
  pagination: Pagination
}

export default function PutawayLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, total_pages: 0 })
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)

  // Filters
  const [userId, setUserId] = useState(0)
  const [itemCode, setItemCode] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [exceptionType, setExceptionType] = useState('')

  const loadLogs = useCallback(async (page = 1) => {
    setLoading(true)
    let q = `/putaway/logs?page=${page}&limit=50`
    if (userId > 0) q += `&user_id=${userId}`
    if (itemCode) q += `&item_code=${encodeURIComponent(itemCode)}`
    if (dateFrom) q += `&date_from=${dateFrom}`
    if (dateTo) q += `&date_to=${dateTo}`
    if (exceptionType) q += `&exception_type=${encodeURIComponent(exceptionType)}`
    const r = await api.get<LogsResponse>(q)
    if (r.ok && r.data) {
      setLogs(r.data.data ?? [])
      setPagination(r.data.pagination ?? { page: 1, limit: 50, total: 0, total_pages: 0 })
    }
    setLoading(false)
  }, [userId, itemCode, dateFrom, dateTo, exceptionType])

  useEffect(() => { loadLogs(1) }, [loadLogs])

  const handleSearch = () => { loadLogs(1) }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.total_pages) return
    loadLogs(newPage)
  }

  function formatLocation(code: string, aisle: string, shelf: string, level: string) {
    if (code) return code
    return [aisle, shelf, level].filter(Boolean).join('-') || '—'
  }

  return (
    <div className="desk-page putaway-logs-page">
      <div className="page-head desk-page-head">
        <div>
          <h1 className="page-title">Putaway Logs</h1>
          <p className="page-sub">Home › Inventory › Putaway Logs — filter and review putaway history</p>
        </div>
      </div>

      <div className="erpnext-card desk-list-card">
        <div className="desk-filter-bar pl-filter-bar">
          <div className="desk-field-inline">
            <label className="erpnext-label">Item</label>
            <input
              className="erpnext-input"
              value={itemCode}
              onChange={e => setItemCode(e.target.value)}
              placeholder="Item code"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="desk-field-inline">
            <label className="erpnext-label">User</label>
            <input
              className="erpnext-input"
              type="number"
              value={userId || ''}
              onChange={e => setUserId(Number(e.target.value) || 0)}
              placeholder="ID"
            />
          </div>
          <div className="desk-field-inline">
            <label className="erpnext-label">From</label>
            <input
              className="erpnext-input"
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div className="desk-field-inline">
            <label className="erpnext-label">To</label>
            <input
              className="erpnext-input"
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
          <div className="desk-field-inline">
            <label className="erpnext-label">Exception</label>
            <select
              className="erpnext-input"
              value={exceptionType}
              onChange={e => setExceptionType(e.target.value)}
            >
              <option value="">All</option>
              <option value="bin_full">Bin Full</option>
              <option value="mixed_items">Mixed Items</option>
              <option value="capacity_exceeded">Capacity Exceeded</option>
            </select>
          </div>
          <button type="button" className="erpnext-btn-primary pl-search-btn" onClick={handleSearch}>
            Search
          </button>
        </div>

      {/* Table */}
      <div className="table-wrap desk-table-scroll">
        <table className="erpnext-table text-sm desk-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Log #</th>
              <th>Item</th>
              <th className="text-right">Qty</th>
              <th>From</th>
              <th>To</th>
              <th>By</th>
              <th>When</th>
              <th>Exception</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-dim" style={{ padding: 32, textAlign: 'center' }}>
                  Loading...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-dim" style={{ padding: 32, textAlign: 'center' }}>
                  No putaway logs found
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr
                  key={log.id}
                  className="pl-row"
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="font-medium">{log.log_no}</td>
                  <td>
                    <div className="font-medium">{log.item_code}</div>
                    {log.item_name && <div className="text-dim" style={{ fontSize: 12 }}>{log.item_name}</div>}
                  </td>
                  <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{log.quantity}</td>
                  <td>{formatLocation(log.source_location_code, log.source_aisle, log.source_shelf, log.source_level)}</td>
                  <td>{formatLocation(log.target_location_code, log.target_aisle, log.target_shelf, log.target_level)}</td>
                  <td>{log.placed_by || '—'}</td>
                  <td className="whitespace-nowrap text-dim" style={{ fontSize: 12 }}>
                    {log.placed_at ? new Date(log.placed_at).toLocaleString() : '—'}
                  </td>
                  <td>
                    {log.is_override && (
                      <span className="erpnext-badge erpnext-badge-yellow">Override</span>
                    )}
                    {log.exception_reason && (
                      <span className="erpnext-badge erpnext-badge-red" style={{ marginLeft: log.is_override ? 4 : 0 }}>
                        {log.exception_reason}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="pl-pager">
          <button
            type="button"
            className="erpnext-btn-secondary pl-pager-btn"
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
          >
            Prev
          </button>
          <span className="pl-pager-meta">
            Page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
          </span>
          <button
            type="button"
            className="erpnext-btn-secondary pl-pager-btn"
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page >= pagination.total_pages}
          >
            Next
          </button>
        </div>
      )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{
              background: 'var(--card)',
              color: 'var(--foreground)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              border: '1px solid var(--border)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{selectedLog.log_no}</h2>
              <ButtonPress className="erpnext-btn-secondary" onClick={() => setSelectedLog(null)}>✕</ButtonPress>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DetailRow label="Item" value={`${selectedLog.item_code}${selectedLog.item_name ? ` — ${selectedLog.item_name}` : ''}`} />
              <DetailRow label="Quantity" value={`${selectedLog.quantity}`} />
              <DetailRow label="From" value={formatLocation(selectedLog.source_location_code, selectedLog.source_aisle, selectedLog.source_shelf, selectedLog.source_level)} mono />
              <DetailRow label="To" value={formatLocation(selectedLog.target_location_code, selectedLog.target_aisle, selectedLog.target_shelf, selectedLog.target_level)} mono />
              <DetailRow label="Placed By" value={selectedLog.placed_by || '—'} />
              <DetailRow label="Time" value={selectedLog.placed_at ? new Date(selectedLog.placed_at).toLocaleString() : '—'} />
              {selectedLog.is_override && (
                <DetailRow label="Override" value="Yes — capacity override was used" highlight />
              )}
              {selectedLog.exception_reason && (
                <DetailRow label="Exception" value={selectedLog.exception_reason} highlight />
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        .putaway-logs-page .desk-list-card {
          padding: 0 !important;
          overflow: hidden;
        }
        .pl-filter-bar {
          padding: 12px;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin: 0;
          border-radius: 0;
          border-bottom: 1px solid var(--border, #e5e7eb);
          background: var(--card, #fff);
        }
        .pl-filter-bar .desk-field-inline {
          align-items: center;
          gap: 8px;
        }
        .pl-filter-bar .desk-field-inline > label,
        .pl-filter-bar .desk-field-inline .erpnext-label {
          line-height: 1;
          display: inline-flex;
          align-items: center;
          height: 32px;
        }
        .pl-filter-bar .erpnext-input {
          border: 1px solid var(--border, #d1d5db) !important;
          border-radius: 6px !important;
          background: var(--card, #fff) !important;
          height: 32px !important;
          min-height: 32px !important;
          padding: 0 10px !important;
          font-size: 13px;
          box-sizing: border-box;
          box-shadow: none !important;
        }
        .pl-search-btn {
          height: 32px !important;
          min-height: 32px !important;
          padding: 0 14px !important;
          font-size: 13px !important;
          font-weight: 600;
          border-radius: 8px !important;
          align-self: center;
          margin-left: auto;
        }
        .putaway-logs-page .pl-row {
          cursor: pointer;
        }
        .putaway-logs-page .pl-row:hover {
          background: var(--secondary, #f8fafc);
        }
        .pl-pager {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-top: 1px solid var(--border, #e5e7eb);
        }
        .pl-pager-meta {
          font-size: 13px;
          color: var(--text-muted);
        }
        .pl-pager-btn {
          height: 32px !important;
          min-height: 32px !important;
          padding: 0 12px !important;
          border-radius: 8px !important;
        }
      `}</style>
    </div>
  )
}

function DetailRow({ label, value, mono, highlight }: {
  label: string; value: string; mono?: boolean; highlight?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--pw-border, #e5e7eb)' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--pw-text-dim, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-stack)',
        color: highlight ? '#dc2626' : 'var(--pw-text, #111827)',
        textAlign: 'right', maxWidth: '60%',
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      }}>{value}</span>
    </div>
  )
}
