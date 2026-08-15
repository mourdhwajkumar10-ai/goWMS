import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

export default function GRNAudit() {
  const [sessions, setSessions] = useState<any[]>([])
  const [audits, setAudits] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sample, setSample] = useState(5)
  const [custom, setCustom] = useState('')
  const [active, setActive] = useState<any[]>([])
  const [phys, setPhys] = useState<Record<number, string>>({})

  const load = () => {
    api.grnSessions().then(r => { if (r.ok) setSessions(r.data ?? []) })
    api.grnAllAudits().then(r => { if (r.ok) setAudits(r.data ?? []) })
  }
  useEffect(() => { load() }, [])

  const loadSessionAudits = async (id: number) => {
    const r = await api.grnAudits(id)
    if (r.ok) setActive(r.data ?? [])
  }

  const start = async () => {
    if (!selectedId) {
      notify({ type: 'error', title: 'Select a GRN', message: 'Pick a receipt to audit' })
      return
    }
    const r = await api.grnStartAudit(selectedId, sample)
    if (r.ok) {
      notify({ type: 'success', title: 'AUDIT started', message: `${r.data.sample_size} items selected at random` })
      loadSessionAudits(selectedId)
      load()
    } else {
      notify({ type: 'error', title: 'AUDIT failed', message: r.error || '' })
    }
  }

  const check = async (itemId: number) => {
    const qty = +(phys[itemId] ?? '')
    if (Number.isNaN(qty)) return
    const r = await api.grnCheckAuditItem(itemId, { physical_qty: qty })
    if (r.ok) {
      notify({
        type: r.data.result === 'pass' ? 'success' : 'warning',
        title: r.data.result === 'pass' ? '✓ PASS' : '⚠ FAIL',
        message: `System ${r.data.system_qty} / Physical ${r.data.physical_qty}`,
      })
      if (selectedId) loadSessionAudits(selectedId)
    }
  }

  const receivable = sessions.filter((s: any) => {
    const st = String(s.status || '').toLowerCase()
    return !['completed', 'closed'].includes(st)
  })
  const pager = useClientPager(audits)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">AUDIT</h1>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Home › Inward › Random Audit — physical count vs system qty after receiving
        </p>
      </div>

      <div className="erpnext-card p-4 space-y-3">
        <div className="font-medium">START AUDIT</div>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Random: 5 items · 10 items · 20 items · Custom. The system selects parts for physical verification.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="erpnext-label">GRN to audit</label>
            <select className="erpnext-input" value={selectedId ?? ''} onChange={e => {
              const id = e.target.value ? +e.target.value : null
              setSelectedId(id)
              if (id) loadSessionAudits(id)
            }}>
              <option value="">Select GRN…</option>
              {receivable.map((s: any) => (
                <option key={s.id} value={s.id}>{s.session_no} · {s.supplier || '—'} · {String(s.status_label || s.status || '').toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="erpnext-label">Sample size</label>
            <div className="flex gap-2">
              {[5, 10, 20].map(n => (
                <button key={n} className={`erpnext-btn-secondary text-xs ${sample === n ? 'erpnext-btn-primary' : ''}`}
                  onClick={() => { setSample(n); setCustom('') }}>{n} items</button>
              ))}
              <input className="erpnext-input" style={{ width: 90 }} type="number" min={1} max={100}
                placeholder="Custom" value={custom}
                onChange={e => { setCustom(e.target.value); if (+e.target.value > 0) setSample(+e.target.value) }} />
            </div>
          </div>
          <button className="erpnext-btn-primary" onClick={start}>START AUDIT</button>
        </div>
      </div>

      {active.map((a: any) => (
        <div key={a.id} className="erpnext-card p-4 space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">Audit #{a.id}</span>
            <span className="erpnext-badge">{a.status}</span>
            <span style={{ color: 'var(--text-dim)' }}>{a.checked}/{a.sample_size} checked</span>
            {selectedId && a.status !== 'completed' && (
              <button className="erpnext-btn-secondary text-xs ml-auto" onClick={async () => {
                const r = await api.grnCompleteAudit(selectedId, a.id)
                if (r.ok) {
                  notify({ type: 'success', title: 'Audit completed', message: `#${a.id}` })
                  loadSessionAudits(selectedId)
                  load()
                }
              }}>Complete audit</button>
            )}
          </div>
          <table className="erpnext-table text-sm">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Part</th><th className="text-right">System Qty</th><th className="text-right">Physical Qty</th><th>Result</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(a.items || []).map((it: any) => (
                <tr key={it.id}>
                  <td className="font-medium">{it.part_no}</td>
                  <td className="text-right">{it.system_qty}</td>
                  <td className="text-right">
                    {it.result ? (it.physical_qty ?? '—') : (
                      <input className="erpnext-input text-xs text-right" style={{ width: 80 }} type="number"
                        value={phys[it.id] ?? ''} onChange={e => setPhys(p => ({ ...p, [it.id]: e.target.value }))} />
                    )}
                  </td>
                  <td>
                    {it.result === 'pass' ? '✓ PASS' : it.result === 'fail' ? '⚠ FAIL' : '—'}
                  </td>
                  <td>
                    {!it.result && (
                      <button className="erpnext-btn-secondary text-xs" onClick={() => check(it.id)}>Check</button>
                    )}
                  </td>
                </tr>
              ))}
              {(a.items || []).length === 0 && (
                <tr><td colSpan={5} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No sample items — receive or seed expected parts first.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      <div className="erpnext-card overflow-x-auto p-4 space-y-3">
        <div className="font-medium">Recent audits</div>
        <ListPager pager={pager} placeholder="Search audits, GRN, supplier…" />
        <table className="erpnext-table text-sm">
          <thead>
            <tr style={{ background: 'var(--panel-2)' }}>
              <th>Audit</th><th>GRN</th><th>Supplier</th><th>Sample</th><th>Status</th><th>Started</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map(a => (
              <tr key={a.id}>
                <td>#{a.id}</td>
                <td>
                  <Link to={`/grn/${a.grn_session_id}`} style={{ color: 'var(--accent)' }}>{a.session_no}</Link>
                </td>
                <td>{a.supplier_name || '—'}</td>
                <td>{a.sample_size}</td>
                <td>{a.status}</td>
                <td className="whitespace-nowrap">{a.started_at?.slice(0, 19)}</td>
              </tr>
            ))}
            {pager.total === 0 && (
              <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No audits yet. Choose a GRN and press START AUDIT.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
