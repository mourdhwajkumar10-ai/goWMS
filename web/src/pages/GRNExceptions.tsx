import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getRole } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

export default function GRNExceptions() {
  const [rows, setRows] = useState<any[]>([])
  const [status, setStatus] = useState('open')
  const [resolveText, setResolveText] = useState<Record<number, string>>({})
  const isSupervisor = ['admin', 'wm', 'supervisor'].includes((getRole() || '').toLowerCase())

  const load = () => api.grnAllExceptions(status).then(r => { if (r.ok) setRows(r.data ?? []) })
  useEffect(() => { load() }, [status])
  const pager = useClientPager(rows)

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Exceptions</h1>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Home › Inward › Exceptions — this is the exception list, not the GRN landing page
          </p>
          <p className="text-sm mt-1">
            Resolve shortages here. If the supplier will send missing material later, create a follow-up receipt linked to the original GRN.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Link to="/follow-up" className="erpnext-btn-secondary text-xs">Open Follow-Up Receipts</Link>
          {(['open', 'resolved', 'all'] as const).map(s => (
            <button key={s} className={`erpnext-btn-secondary text-xs ${status === s ? 'erpnext-btn-primary' : ''}`} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="erpnext-card overflow-x-auto p-4 space-y-3">
        <ListPager pager={pager} placeholder="Search GRN, supplier, box, part…" />
        <table className="erpnext-table text-sm">
          <thead>
            <tr style={{ background: 'var(--panel-2)' }}>
              <th>GRN</th><th>Supplier</th><th>Type</th><th>Box</th><th>Part</th>
              <th>Expected</th><th>Scanned</th><th>Variance</th><th>Status</th><th>When</th><th>Resolution</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map(ex => {
              const shortage = String(ex.exception_type || '').toLowerCase().includes('shortage')
                || String(ex.exception_type || '').toLowerCase().includes('missing')
              return (
              <tr key={ex.id}>
                <td>
                  <Link to={`/grn/${ex.grn_session_id}`} className="font-medium" style={{ color: 'var(--accent)' }}>
                    {ex.session_no}
                  </Link>
                </td>
                <td>{ex.supplier_name || '—'}</td>
                <td><span className="erpnext-badge">{ex.exception_type}</span></td>
                <td>{ex.box_no || '—'}</td>
                <td>{ex.part_no || '—'}</td>
                <td>{ex.expected_qty ?? '—'}</td>
                <td>{ex.scanned_qty ?? '—'}</td>
                <td>{ex.variance ?? '—'}</td>
                <td>{ex.status}</td>
                <td className="whitespace-nowrap">{ex.created_at?.slice(0, 19)}</td>
                <td>
                  {ex.status === 'open' && (
                    <div className="flex flex-col gap-1">
                      <input className="erpnext-input text-xs" style={{ minWidth: 140 }}
                        value={resolveText[ex.id] || ''} onChange={e => setResolveText(p => ({ ...p, [ex.id]: e.target.value }))}
                        placeholder="Resolution notes" />
                      <div className="flex gap-1 flex-wrap">
                        {isSupervisor && (
                          <button className="erpnext-btn-secondary text-xs" onClick={() => resolve(ex.id, false)}>Resolve</button>
                        )}
                        {shortage && (
                          <button
                            className="erpnext-btn-primary text-xs"
                            onClick={() => resolve(ex.id, true)}
                            title="Supplier will send later — create a linked FOLLOW-UP RECEIPT"
                          >
                            Supplier will send later
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {ex.status !== 'open' && <span style={{ color: 'var(--text-dim)' }}>{ex.resolution || '—'}</span>}
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
  )
}
