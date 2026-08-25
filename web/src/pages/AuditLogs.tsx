import { useEffect, useState, Fragment } from 'react'
import { api } from '../services/api'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

export default function AuditLogs() {
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [entityType, setEntityType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit', '500')
    if (q.trim()) params.set('q', q.trim())
    if (entityType.trim()) params.set('entity_type', entityType.trim())
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const r = await api.get<any[]>(`/audit/?${params.toString()}`)
    if (r.ok) setRows(r.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  const pager = useClientPager(rows)

  return (
    <div className="desk-page space-y-3">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Transaction Logs</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
          Who did what, when — warehouse audit trail (immutable).
        </p>
      </div>

      <div className="erpnext-card p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="erpnext-label">Search</label>
            <input className="erpnext-input" value={q} onChange={e => setQ(e.target.value)} placeholder="operation / user / entity" />
          </div>
          <div>
            <label className="erpnext-label">Entity type</label>
            <input className="erpnext-input" value={entityType} onChange={e => setEntityType(e.target.value)} placeholder="item / location / grn" />
          </div>
          <div>
            <label className="erpnext-label">From</label>
            <input className="erpnext-input" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="erpnext-label">To</label>
            <input className="erpnext-input" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <button className="erpnext-btn-primary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Filter'}
          </button>
        </div>
      </div>

      <div className="erpnext-card overflow-x-auto">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <ListPager pager={pager} placeholder="Search loaded logs…" />
        </div>
        <table className="erpnext-table">
          <thead>
            <tr style={{ background: 'var(--panel-2)' }}>
              <th>Time</th>
              <th>User</th>
              <th>Operation</th>
              <th>Entity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map(row => (
              <Fragment key={row.id}>
                <tr>
                  <td className="text-sm whitespace-nowrap">{row.created_at?.replace('T', ' ').slice(0, 19)}</td>
                  <td>{row.actor_name || (row.actor_id ? `#${row.actor_id}` : '—')}</td>
                  <td className="font-medium">{row.operation}</td>
                  <td>
                    <span className="erpnext-badge erpnext-badge-blue">{row.entity_type || '—'}</span>
                    {row.entity_id ? ` #${row.entity_id}` : ''}
                  </td>
                  <td>
                    <button className="erpnext-btn-secondary text-xs" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                      {expanded === row.id ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
                {expanded === row.id && (
                  <tr>
                    <td colSpan={5} className="text-xs" style={{ background: 'var(--panel-2)' }}>
                      <pre className="whitespace-pre-wrap p-3 overflow-x-auto">
{JSON.stringify({ old: row.old_value, new: row.new_value }, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {pager.total === 0 && (
              <tr><td colSpan={5} className="text-center py-10" style={{ color: 'var(--text-dim)' }}>No audit events yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
