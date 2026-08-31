import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'

interface Wh {
  id: number
  code: string
  name: string
}

interface BalanceRow {
  id: number
  item_code: string
  item_name: string
  warehouse_id: number
  warehouse_code: string
  warehouse_name: string
  location_id: number
  location_code: string
  aisle: string
  shelf: string
  level: string
  location_type: string
  batch_no: string
  expiry_date: string | null
  actual_qty: number
  reserved_qty: number
  available_qty: number
  allocation_status: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  total_pages: number
}

interface Summary {
  total_qty: number
  available_qty: number
  reserved_qty: number
  sku_count: number
  location_count: number
}

interface BalancesResponse {
  data: BalanceRow[]
  summary: Summary
  pagination: Pagination
}

function statusBadge(status: string) {
  const s = (status || '').toLowerCase()
  if (s === 'available') return 'erpnext-badge-green'
  if (s === 'partial') return 'erpnext-badge-yellow'
  if (s === 'fully_allocated') return 'erpnext-badge-blue'
  if (s === 'unallocatable') return 'erpnext-badge-red'
  return 'erpnext-badge-yellow'
}

function statusLabel(status: string) {
  return (status || '—').replace(/_/g, ' ')
}

function fmtQty(n: number) {
  if (Number.isInteger(n)) return String(n)
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

export default function Inventory() {
  const [warehouses, setWarehouses] = useState<Wh[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [location, setLocation] = useState('')
  const [includeZero, setIncludeZero] = useState(false)

  const [rows, setRows] = useState<BalanceRow[]>([])
  const [summary, setSummary] = useState<Summary>({
    total_qty: 0, available_qty: 0, reserved_qty: 0, sku_count: 0, location_count: 0,
  })
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, total_pages: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.warehouseList().then(r => {
      if (r.ok) {
        const list = r.data ?? []
        setWarehouses(list)
        if (list.length === 1) setWarehouseId(String(list[0].id))
      }
    })
  }, [])

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    let q = `/inventory/balances?page=${page}&limit=50`
    if (warehouseId) q += `&warehouse_id=${warehouseId}`
    if (itemCode.trim()) q += `&item_code=${encodeURIComponent(itemCode.trim())}`
    if (location.trim()) q += `&location=${encodeURIComponent(location.trim())}`
    if (includeZero) q += `&include_zero=1`
    const r = await api.get<BalancesResponse>(q)
    if (r.ok && r.data) {
      setRows(r.data.data ?? [])
      setSummary(r.data.summary ?? {
        total_qty: 0, available_qty: 0, reserved_qty: 0, sku_count: 0, location_count: 0,
      })
      setPagination(r.data.pagination ?? { page: 1, limit: 50, total: 0, total_pages: 0 })
    } else {
      setRows([])
    }
    setLoading(false)
  }, [warehouseId, itemCode, location, includeZero])

  useEffect(() => { void load(1) }, [load])

  const handleSearch = () => { void load(1) }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.total_pages) return
    void load(newPage)
  }

  const pageStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const pageEnd = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="desk-page inventory-page">
      <div className="page-head desk-page-head">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-sub">Home › Inventory › Stock balances — browse by warehouse, location, and item</p>
        </div>
      </div>

      <div className="inv-summary">
        <div className="inv-stat">
          <span className="inv-stat-label">On hand</span>
          <span className="inv-stat-value">{fmtQty(summary.total_qty)}</span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-label">Available</span>
          <span className="inv-stat-value">{fmtQty(summary.available_qty)}</span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-label">Reserved</span>
          <span className="inv-stat-value">{fmtQty(summary.reserved_qty)}</span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-label">SKUs</span>
          <span className="inv-stat-value">{summary.sku_count}</span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-label">Locations</span>
          <span className="inv-stat-value">{summary.location_count}</span>
        </div>
      </div>

      <div className="erpnext-card desk-list-card">
        <div className="desk-filter-bar inv-filter-bar">
          <div className="desk-field-inline">
            <label className="erpnext-label">Warehouse</label>
            <select
              className="erpnext-input"
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              aria-label="Filter by warehouse"
            >
              <option value="">All warehouses</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </select>
          </div>
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
            <label className="erpnext-label">Location</label>
            <input
              className="erpnext-input"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Bin / location"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <label className="inv-zero-toggle">
            <input
              type="checkbox"
              checked={includeZero}
              onChange={e => setIncludeZero(e.target.checked)}
            />
            <span>Show zero</span>
          </label>
          <button type="button" className="erpnext-btn-primary inv-search-btn" onClick={handleSearch}>
            Search
          </button>
          <div className="list-pager-meta desk-filter-meta">
            <span>
              {pagination.total === 0
                ? '0 of 0'
                : `${pageStart}–${pageEnd} of ${pagination.total}`}
              {' · '}{pagination.limit} / page
            </span>
            <button
              type="button"
              className="erpnext-btn-secondary text-xs"
              disabled={pagination.page <= 1 || loading}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              Prev
            </button>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {pagination.page} / {Math.max(1, pagination.total_pages)}
            </span>
            <button
              type="button"
              className="erpnext-btn-secondary text-xs"
              disabled={pagination.page >= pagination.total_pages || pagination.total_pages === 0 || loading}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>

        <div className="table-wrap desk-table-scroll">
          <table className="erpnext-table text-sm desk-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Location</th>
                <th>Warehouse</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th className="text-right">On hand</th>
                <th className="text-right">Reserved</th>
                <th className="text-right">Available</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-dim" style={{ padding: 32, textAlign: 'center' }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-dim" style={{ padding: 32, textAlign: 'center' }}>
                    No inventory matches these filters
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <div className="font-medium">{row.item_code}</div>
                      {row.item_name ? (
                        <div className="text-dim" style={{ fontSize: 12 }}>{row.item_name}</div>
                      ) : null}
                    </td>
                    <td>
                      <div className="font-medium">{row.location_code}</div>
                      <div className="text-dim" style={{ fontSize: 11 }}>
                        {(row.location_type || 'storage').replace(/_/g, ' ')}
                      </div>
                    </td>
                    <td className="desk-cell-ellipsis" title={`${row.warehouse_code} — ${row.warehouse_name}`}>
                      {row.warehouse_code}
                    </td>
                    <td>{row.batch_no || '—'}</td>
                    <td className="whitespace-nowrap">{row.expiry_date || '—'}</td>
                    <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtQty(row.actual_qty)}</td>
                    <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtQty(row.reserved_qty)}</td>
                    <td className="text-right font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtQty(row.available_qty)}</td>
                    <td>
                      <span className={`erpnext-badge ${statusBadge(row.allocation_status)}`}>
                        {statusLabel(row.allocation_status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .inventory-page .desk-list-card {
          padding: 0 !important;
          overflow: hidden;
        }
        .inv-summary {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .inv-stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 110px;
          padding: 10px 14px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .inv-stat-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--muted-foreground);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .inv-stat-value {
          font-size: 18px;
          font-weight: 650;
          color: var(--foreground);
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
        }
        .inv-filter-bar {
          padding: 12px;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin: 0;
          border-radius: 0;
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }
        .inv-filter-bar .desk-field-inline {
          align-items: center;
          gap: 8px;
        }
        .inv-filter-bar .desk-field-inline > label,
        .inv-filter-bar .desk-field-inline .erpnext-label {
          line-height: 1;
          display: inline-flex;
          align-items: center;
          height: 32px;
        }
        .inv-filter-bar .erpnext-input {
          border: 1px solid var(--border) !important;
          border-radius: 6px !important;
          background: var(--card) !important;
          height: 32px !important;
          min-height: 32px !important;
          padding: 0 10px !important;
          font-size: 13px;
          box-sizing: border-box;
          box-shadow: none !important;
        }
        .inv-filter-bar select.erpnext-input {
          min-width: 180px;
          max-width: 260px;
        }
        .inv-zero-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 32px;
          font-size: 13px;
          color: var(--foreground);
          cursor: pointer;
          user-select: none;
        }
        .inv-search-btn {
          height: 32px !important;
          min-height: 32px !important;
          padding: 0 14px !important;
          font-size: 13px !important;
          font-weight: 600;
          border-radius: 8px !important;
        }
        .inventory-page .desk-table-scroll {
          flex: 1 1 auto;
          min-height: 0;
          max-height: calc(100dvh - var(--desk-header-offset, 120px) - 220px);
        }
      `}</style>
    </div>
  )
}
