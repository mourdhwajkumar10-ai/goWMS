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
    <div className="desk-page">
      <div className="desk-head">
        <h1>Putaway Logs</h1>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16,
        padding: 16, background: 'var(--pw-bg, #fff)', borderRadius: 12, border: '1px solid var(--pw-border, #e5e7eb)'
      }}>
        <div style={{ flex: '1 1 140px' }}>
          <label className="erpnext-label" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Item Code</label>
          <input
            className="erpnext-input"
            value={itemCode}
            onChange={e => setItemCode(e.target.value)}
            placeholder="Search item..."
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label className="erpnext-label" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>User ID</label>
          <input
            className="erpnext-input"
            type="number"
            value={userId || ''}
            onChange={e => setUserId(Number(e.target.value) || 0)}
            placeholder="User ID"
          />
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label className="erpnext-label" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date From</label>
          <input
            className="erpnext-input"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label className="erpnext-label" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date To</label>
          <input
            className="erpnext-input"
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label className="erpnext-label" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Exception</label>
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
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <ButtonPress className="erpnext-btn-primary" onClick={handleSearch}>
            Search
          </ButtonPress>
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--pw-bg, #fff)', borderRadius: 12, border: '1px solid var(--pw-border, #e5e7eb)',
        overflow: 'hidden', marginBottom: 16
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--pw-border, #e5e7eb)' }}>
              {['Log #', 'Item', 'Qty', 'From', 'To', 'By', 'When', 'Exception'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 12px', fontWeight: 600,
                  color: 'var(--pw-text-dim, #6b7280)', fontSize: 11, textTransform: 'uppercase',
                  letterSpacing: '0.5px', background: 'var(--pw-bg-2, #f9fafb)'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--pw-text-dim, #6b7280)' }}>
                  Loading...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--pw-text-dim, #6b7280)' }}>
                  No putaway logs found
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  style={{
                    cursor: 'pointer', borderBottom: '1px solid var(--pw-border, #e5e7eb)',
                    transition: 'background 100ms'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--pw-bg-2, #f9fafb)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{log.log_no}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{log.item_code}</div>
                    {log.item_name && <div style={{ fontSize: 11, color: 'var(--pw-text-dim, #6b7280)' }}>{log.item_name}</div>}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{log.quantity}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {formatLocation(log.source_location_code, log.source_aisle, log.source_shelf, log.source_level)}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {formatLocation(log.target_location_code, log.target_aisle, log.target_shelf, log.target_level)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{log.placed_by || '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--pw-text-dim, #6b7280)', whiteSpace: 'nowrap' }}>
                    {log.placed_at ? new Date(log.placed_at).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {log.is_override && (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                        background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 600
                      }}>Override</span>
                    )}
                    {log.exception_reason && (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 10, marginLeft: 4,
                        background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 600
                      }}>{log.exception_reason}</span>
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
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 16
        }}>
          <ButtonPress
            className="erpnext-btn-secondary"
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
          >
            ← Prev
          </ButtonPress>
          <span style={{ fontSize: 13, color: 'var(--pw-text-dim, #6b7280)' }}>
            Page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
          </span>
          <ButtonPress
            className="erpnext-btn-secondary"
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page >= pagination.total_pages}
          >
            Next →
          </ButtonPress>
        </div>
      )}

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
              background: '#fff', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
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
        fontSize: 14, fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit',
        color: highlight ? '#dc2626' : 'var(--pw-text, #111827)',
        textAlign: 'right', maxWidth: '60%'
      }}>{value}</span>
    </div>
  )
}
