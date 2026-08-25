import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getRole } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import { useLoadMore } from '../hooks/useLoadMore'
import { useRfUi } from '../hooks/useRfUi'
import RfShell from '../components/RfShell'
import '../styles/scanner.css'

export default function GRNExceptions() {
  const rf = useRfUi()
  const [rows, setRows] = useState<any[]>([])
  const [status, setStatus] = useState('open')
  const [resolveText, setResolveText] = useState<Record<number, string>>({})
  const isSupervisor = ['admin', 'wm', 'supervisor'].includes((getRole() || '').toLowerCase())

  const load = () => api.grnAllExceptions(status).then(r => { if (r.ok) setRows(r.data ?? []) })
  useEffect(() => { load() }, [status])
  const pager = useClientPager(rows)
  const rfMore = useLoadMore(pager.filtered, 10, `${status}|${pager.q}`)

  const resolve = async (id: number, createFollowUp = false) => {
    const resolution = resolveText[id]
      || (createFollowUp ? 'Supplier will send remaining material later' : 'Resolved')
    const r = await api.grnResolveException(id, {
      resolution,
      create_followup: createFollowUp,
    })
    if (r.ok) {
      if (createFollowUp && r.data?.followup_session_no) {
        notify({
          type: 'success',
          title: 'FOLLOW-UP RECEIPT created',
          message: `${r.data.followup_session_no} linked for remaining qty`,
        })
      } else {
        notify({ type: 'success', title: 'Exception resolved', message: `#${id}` })
      }
      load()
    } else {
      notify({ type: 'error', title: 'Failed', message: r.error || '' })
    }
  }

  const isShortage = (ex: any) =>
    String(ex.exception_type || '').toLowerCase().includes('shortage')
    || String(ex.exception_type || '').toLowerCase().includes('missing')

  if (rf) {
    return (
      <RfShell title="Exceptions" meta={status} stat={String(pager.total)}>
        <div className="scan-tabs" style={{ marginBottom: 12 }}>
          {(['open', 'resolved', 'all'] as const).map(s => (
            <button
              key={s}
              type="button"
              className={`scan-tab ${status === s ? 'active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <Link
          to="/follow-up"
          className="scan-btn scan-btn-outline"
          style={{ textDecoration: 'none', marginBottom: 12, textAlign: 'center' }}
        >
          Open Follow-Up Receipts
        </Link>

        <div className="scan-bottom-bar" style={{ marginBottom: 10 }}>
          <div className="scan-input-chip">
            <input
              type="search"
              value={pager.q}
              onChange={e => pager.setQ(e.target.value)}
              placeholder="Search GRN, supplier, box, part…"
              autoComplete="off"
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rfMore.visible.map(ex => (
            <div key={ex.id} className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="scan-select-card-title">
                <Link to={`/grn/${ex.grn_session_id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                  {ex.session_no}
                </Link>
                {' · '}
                <span className="scan-chip hold">{ex.exception_type}</span>
              </div>
              <div className="scan-select-card-sub">
                {ex.supplier_name || '—'} · Box {ex.box_no || '—'} · {ex.part_no || '—'}
              </div>
              <div className="scan-select-card-meta">
                <span>Exp {ex.expected_qty ?? '—'}</span>
                <span>Scan {ex.scanned_qty ?? '—'}</span>
                <span>Var {ex.variance ?? '—'}</span>
                <span>{ex.status}</span>
              </div>
              <div className="scan-select-card-sub">{ex.created_at?.slice(0, 19)}</div>

              {ex.status === 'open' && (
                <>
                  <input
                    className="scan-count-input"
                    style={{ minHeight: 44, fontSize: 14, fontWeight: 500, textAlign: 'left' }}
                    value={resolveText[ex.id] || ''}
                    onChange={e => setResolveText(p => ({ ...p, [ex.id]: e.target.value }))}
                    placeholder="Resolution notes"
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {isSupervisor && (
                      <button type="button" className="scan-btn scan-btn-outline" onClick={() => resolve(ex.id, false)}>
                        Resolve
                      </button>
                    )}
                    {isShortage(ex) && (
                      <button
                        type="button"
                        className="scan-btn scan-btn-primary"
                        onClick={() => resolve(ex.id, true)}
                      >
                        Supplier will send later
                      </button>
                    )}
                  </div>
                </>
              )}
              {ex.status !== 'open' && (
                <div className="scan-select-card-sub">{ex.resolution || '—'}</div>
              )}
            </div>
          ))}
          {rfMore.hasMore && (
            <button type="button" className="scan-btn scan-btn-outline" onClick={rfMore.loadMore}>
              Load more ({rfMore.remaining} left)
            </button>
          )}
          {pager.total === 0 && (
            <div className="scan-section-card" style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>No exceptions</p>
              <p style={{ color: 'var(--muted-foreground)', fontSize: 13, lineHeight: 1.4 }}>
                Shortage, excess, wrong item, duplicate scan, and missing box events appear here after receiving.
              </p>
            </div>
          )}
        </div>
      </RfShell>
    )
  }

  return (
    <div className="desk-page space-y-2">
      <div className="page-head desk-page-head">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h1 className="page-title">Exceptions</h1>
        </div>
        <div className="page-actions">
          <Link to="/follow-up" className="erpnext-btn-secondary text-xs">
            Follow-Up
          </Link>
        </div>
      </div>

      <div className="erpnext-card desk-list-card p-2">
        <ListPager
          pager={pager}
          placeholder="Search GRN, supplier, box, part…"
          leading={
            <div className="desk-seg" role="tablist" aria-label="Exception status">
              {(['open', 'resolved', 'all'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={status === s}
                  className={`desk-seg-item${status === s ? ' is-active' : ''}`}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          }
        />
        <div className="table-wrap desk-table-scroll">
          <table className="erpnext-table text-sm desk-table desk-table-sticky-actions">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>GRN</th>
                <th>Supplier</th>
                <th>Type</th>
                <th>Box</th>
                <th>Part</th>
                <th className="text-right">Exp</th>
                <th className="text-right">Scan</th>
                <th className="text-right">Var</th>
                <th>Status</th>
                <th>When</th>
                <th className="desk-col-actions">Resolve</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map(ex => {
                const shortage = isShortage(ex)
                return (
                  <tr key={ex.id}>
                    <td>
                      <Link to={`/grn/${ex.grn_session_id}`} className="font-medium" style={{ color: 'var(--accent)' }}>
                        {ex.session_no}
                      </Link>
                    </td>
                    <td className="desk-cell-ellipsis" title={ex.supplier_name || ''}>{ex.supplier_name || '—'}</td>
                    <td><span className="erpnext-badge">{ex.exception_type}</span></td>
                    <td className="whitespace-nowrap">{ex.box_no || '—'}</td>
                    <td className="desk-cell-ellipsis" title={ex.part_no || ''}>{ex.part_no || '—'}</td>
                    <td className="text-right">{ex.expected_qty ?? '—'}</td>
                    <td className="text-right">{ex.scanned_qty ?? '—'}</td>
                    <td className="text-right">{ex.variance ?? '—'}</td>
                    <td>{ex.status}</td>
                    <td className="whitespace-nowrap">{ex.created_at?.slice(0, 16)?.replace('T', ' ')}</td>
                    <td className="desk-col-actions">
                      {ex.status === 'open' ? (
                        <div className="desk-row-actions">
                          <input
                            className="erpnext-input text-xs desk-resolve-input"
                            value={resolveText[ex.id] || ''}
                            onChange={e => setResolveText(p => ({ ...p, [ex.id]: e.target.value }))}
                            placeholder="Notes"
                          />
                          {isSupervisor && (
                            <button type="button" className="erpnext-btn-secondary text-xs" onClick={() => resolve(ex.id, false)}>
                              Resolve
                            </button>
                          )}
                          {shortage && (
                            <button
                              type="button"
                              className="erpnext-btn-primary text-xs"
                              onClick={() => resolve(ex.id, true)}
                              title="Supplier will send later — create a linked follow-up receipt"
                            >
                              Later
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="desk-cell-ellipsis" style={{ color: 'var(--text-dim)', maxWidth: 160 }} title={ex.resolution || ''}>
                          {ex.resolution || '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {pager.total === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                    No exceptions. Shortage, excess, wrong item, duplicate scan, and missing box events appear here after receiving.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
