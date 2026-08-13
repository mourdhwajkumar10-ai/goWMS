import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getRole } from '../services/api'
import { notify } from '../components/Notifications'

export default function GRNExceptions() {
  const [rows, setRows] = useState<any[]>([])
  const [status, setStatus] = useState('open')
  const [resolveText, setResolveText] = useState<Record<number, string>>({})
  const isSupervisor = ['admin', 'wm', 'supervisor'].includes((getRole() || '').toLowerCase())

  const load = () => api.grnAllExceptions(status).then(r => { if (r.ok) setRows(r.data ?? []) })
  useEffect(() => { load() }, [status])

  const resolve = async (id: number) => {
    const r = await api.grnResolveException(id, { resolution: resolveText[id] || 'Resolved' })
    if (r.ok) {
      notify({ type: 'success', title: 'Resolved', message: `#${id}` })
      load()
    } else {
      notify({ type: 'error', title: 'Failed', message: r.error || '' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">GRN Exceptions</h1>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Open discrepancies across inbound receipts</p>
        </div>
        <div className="flex gap-2">
          {(['open', 'resolved', 'all'] as const).map(s => (
            <button key={s} className={`erpnext-btn-secondary text-xs ${status === s ? 'erpnext-btn-primary' : ''}`} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="erpnext-card overflow-x-auto">
        <table className="erpnext-table text-sm">
          <thead>
            <tr style={{ background: 'var(--panel-2)' }}>
              <th>GRN</th><th>Supplier</th><th>Type</th><th>Box</th><th>Part</th>
              <th>Expected</th><th>Scanned</th><th>Status</th><th>When</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(ex => (
              <tr key={ex.id}>
                <td>
                  <Link to="/grn" className="font-medium" style={{ color: 'var(--accent)' }}
                    onClick={() => sessionStorage.setItem('gowms_open_grn', String(ex.grn_session_id))}>
                    {ex.session_no}
                  </Link>
                </td>
                <td>{ex.supplier_name || '—'}</td>
                <td>{ex.exception_type}</td>
                <td>{ex.box_no || '—'}</td>
                <td>{ex.part_no || '—'}</td>
                <td>{ex.expected_qty ?? '—'}</td>
                <td>{ex.scanned_qty ?? '—'}</td>
                <td>{ex.status}</td>
                <td className="whitespace-nowrap">{ex.created_at?.slice(0, 19)}</td>
                <td>
                  {isSupervisor && ex.status === 'open' && (
                    <div className="flex gap-1">
                      <input className="erpnext-input text-xs" style={{ minWidth: 100 }}
                        value={resolveText[ex.id] || ''} onChange={e => setResolveText(p => ({ ...p, [ex.id]: e.target.value }))}
                        placeholder="Resolution" />
                      <button className="erpnext-btn-secondary text-xs" onClick={() => resolve(ex.id)}>Resolve</button>
                    </div>
                  )}
                  {ex.status !== 'open' && <span style={{ color: 'var(--text-dim)' }}>{ex.resolution || '—'}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No exceptions</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
