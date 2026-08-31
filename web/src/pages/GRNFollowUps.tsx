import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

function fmtQty(n: unknown) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (Number.isNaN(v)) return String(n)
  return Number.isInteger(v) ? String(v) : String(v)
}

function fmtWhen(s?: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 19)
  return d.toLocaleString()
}

function statusBadge(status?: string | null) {
  const st = String(status || 'open').toLowerCase()
  const cls =
    st === 'completed' || st === 'closed'
      ? 'erpnext-badge-green'
      : st === 'exception_pending' || st === 'exception'
        ? 'erpnext-badge-red'
        : st === 'receiving' || st === 'open' || st === 'ready_to_receive'
          ? 'erpnext-badge-blue'
          : 'erpnext-badge-yellow'
  return <span className={`erpnext-badge ${cls}`}>{status || 'open'}</span>
}

export default function GRNFollowUps() {
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    api.grnAllFollowUps().then(r => { if (r.ok) setRows(r.data ?? []) })
  }, [])
  const pager = useClientPager(rows)

  const openCount = rows.filter(r => {
    const st = String(r.status || '').toLowerCase()
    return !['completed', 'closed'].includes(st)
  }).length
  const outstandingTotal = rows.reduce((sum, r) => sum + (Number(r.outstanding_qty) || 0), 0)

  return (
    <div className="desk-page fu-page space-y-3">
      <div className="page-head desk-page-head">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h1 className="page-title">Follow-up receipts</h1>
          <p className="page-sub">Home › Inward › Follow-up receipts — later deliveries for short / missing qty</p>
        </div>
        <div className="page-actions">
          <Link to="/exceptions" className="erpnext-btn-secondary fu-head-btn">Open exceptions</Link>
          <Link to="/receiving-management" className="erpnext-btn-primary fu-head-btn">Receiving</Link>
        </div>
      </div>

      <div className="erpnext-card p-4">
        <div className="fu-intro-grid">
          <div>
            <div className="fu-section-title">How follow-ups work</div>
            <p className="fu-section-copy">
              Shortages marked “Supplier will send later” create a child GRN here — open it to receive the remaining qty.
            </p>
          </div>
          <div className="fu-stat-row">
            <div className="fu-stat">
              <span className="fu-stat-label">Follow-ups</span>
              <span className="fu-stat-value">{rows.length}</span>
            </div>
            <div className="fu-stat">
              <span className="fu-stat-label">Still open</span>
              <span className="fu-stat-value">{openCount}</span>
            </div>
            <div className="fu-stat">
              <span className="fu-stat-label">Outstanding</span>
              <span className="fu-stat-value">{fmtQty(outstandingTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="erpnext-card p-4 space-y-3">
        <div className="fu-section-title">Follow-up list</div>
        <div className="fu-toolbar">
          <ListPager pager={pager} placeholder="Search follow-up GRN, supplier…" />
        </div>
        <div className="fu-table-wrap">
          <table className="erpnext-table text-sm fu-table">
            <thead>
              <tr>
                <th>Follow-up GRN</th>
                <th>Original GRN</th>
                <th>Supplier</th>
                <th>Status</th>
                <th className="text-right">Expected</th>
                <th className="text-right">Received</th>
                <th className="text-right">Outstanding</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map(f => {
                const receiveHref = `/receiving?session_id=${f.id}`
                const parentHref = f.parent_grn_id ? `/receiving?session_id=${f.parent_grn_id}` : null
                const outstanding = Number(f.outstanding_qty) || 0
                return (
                  <tr key={f.id}>
                    <td>
                      <Link to={receiveHref} className="fu-link">{f.session_no}</Link>
                      <div className="fu-row-hint">Open to receive remaining qty</div>
                    </td>
                    <td>
                      {parentHref ? (
                        <Link to={parentHref} className="fu-link-muted">
                          {f.parent_session_no || `#${f.parent_grn_id}`}
                        </Link>
                      ) : (
                        <span className="fu-muted">—</span>
                      )}
                    </td>
                    <td className="fu-body">{f.supplier_name || '—'}</td>
                    <td>{statusBadge(f.status)}</td>
                    <td className="text-right fu-qty">{fmtQty(f.expected_qty)}</td>
                    <td className="text-right fu-qty">{fmtQty(f.received_qty)}</td>
                    <td className={`text-right fu-qty${outstanding > 0 ? ' fu-qty-out' : ''}`}>{fmtQty(f.outstanding_qty)}</td>
                    <td className="fu-date whitespace-nowrap">{fmtWhen(f.created_at)}</td>
                  </tr>
                )
              })}
              {pager.total === 0 && (
                <tr>
                  <td colSpan={8} className="fu-empty">
                    <div className="fu-empty-title">No follow-up receipts yet</div>
                    <div className="fu-empty-copy">
                      Resolve a shortage on Exceptions with “Supplier will send later” to create a linked follow-up GRN.
                    </div>
                    <Link to="/exceptions" className="erpnext-btn-primary fu-head-btn" style={{ marginTop: 12, display: 'inline-flex' }}>
                      Open exceptions
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .fu-page .page-head { min-width: 0; max-width: 100%; }
        .fu-page .page-actions { flex-shrink: 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .fu-head-btn {
          height: 40px; min-height: 40px; padding: 0 16px; font-size: 14px; font-weight: 600;
          border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;
          text-decoration: none; box-sizing: border-box;
        }
        .fu-section-title {
          font-size: 15px; font-weight: 600; color: var(--text-color);
          letter-spacing: -0.01em; line-height: 1.3;
        }
        .fu-intro-grid {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px 20px; flex-wrap: nowrap;
        }
        .fu-section-copy {
          font-size: 13px; color: var(--text-dim); margin-top: 4px; line-height: 1.35;
          white-space: nowrap;
        }
        .fu-stat-row {
          display: flex; flex-wrap: nowrap; gap: 8px; flex-shrink: 0;
        }
        .fu-stat {
          border: 1px solid var(--border, #d1d5db); border-radius: 6px;
          background: var(--card, #fff); padding: 6px 10px;
          display: inline-flex; align-items: baseline; gap: 8px;
          min-width: 0;
        }
        .fu-stat-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.03em;
          text-transform: uppercase; color: var(--text-dim); line-height: 1.2;
        }
        .fu-stat-value {
          font-size: 14px; font-weight: 650; letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums; color: var(--text-color); line-height: 1.2;
        }
        .fu-toolbar {
          border: 1px solid var(--border, #d1d5db);
          border-radius: 6px;
          background: var(--card, #fff);
          padding: 6px 8px;
        }
        .fu-toolbar .list-pager,
        .fu-toolbar .desk-filter-bar {
          margin: 0;
          gap: 8px;
        }
        .fu-toolbar .list-pager-search,
        .fu-toolbar .desk-filter-search,
        .fu-toolbar input.erpnext-input {
          height: 32px !important;
          min-height: 32px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          font-size: 13px;
        }
        .fu-toolbar .list-pager-meta .erpnext-btn-secondary,
        .fu-toolbar .list-pager-meta button {
          height: 32px !important;
          min-height: 32px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
        .fu-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border: 1px solid var(--border, #d1d5db);
          border-radius: 6px;
          background: var(--card, #fff);
        }
        .fu-table { min-width: 760px; border-collapse: separate; border-spacing: 0; }
        .fu-table th {
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
          text-transform: uppercase; color: var(--text-dim);
          background: var(--card, #fff);
          border-bottom: 1px solid var(--border, #d1d5db);
        }
        .fu-table td {
          vertical-align: middle;
          border-bottom: 1px solid oklch(0.912 0.005 250 / 0.7);
        }
        .fu-table tbody tr:last-child td { border-bottom: none; }
        .fu-table th + th,
        .fu-table td + td {
          border-left: 1px solid oklch(0.912 0.005 250 / 0.55);
        }
        .fu-link {
          color: var(--accent); font-weight: 600; font-size: 13px;
          text-decoration: none; letter-spacing: -0.01em;
        }
        .fu-link:hover { text-decoration: underline; }
        .fu-link-muted {
          color: var(--text-color); font-weight: 500; font-size: 13px; text-decoration: none;
        }
        .fu-link-muted:hover { color: var(--accent); text-decoration: underline; }
        .fu-row-hint { font-size: 11px; color: var(--text-dim); margin-top: 2px; line-height: 1.35; font-weight: 400; }
        .fu-body { font-size: 13px; color: var(--text-color); font-weight: 500; }
        .fu-muted { color: var(--text-dim); }
        .fu-qty {
          font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
          color: var(--text-color);
        }
        .fu-qty-out { color: var(--red, #b91c1c); }
        .fu-date { font-size: 12px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
        .fu-empty { text-align: center; padding: 40px 20px !important; }
        .fu-empty-title {
          font-size: 15px; font-weight: 600; color: var(--text-color);
          letter-spacing: -0.01em; margin-bottom: 6px;
        }
        .fu-empty-copy {
          font-size: 13px; color: var(--text-dim); line-height: 1.5; max-width: 42ch; margin: 0 auto;
        }
        @media (max-width: 1100px) {
          .fu-intro-grid { flex-wrap: wrap; }
          .fu-section-copy { white-space: normal; }
        }
        @media (max-width: 720px) {
          .fu-intro-grid { align-items: flex-start; }
          .fu-stat-row { width: 100%; flex-wrap: wrap; }
        }
      `}</style>
    </div>
  )
}
