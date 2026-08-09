import { useEffect, useState } from 'react'
import { api } from '../services/api'

interface GrnSummary {
  session_no: string
  supplier_name: string | null
  status: string
  created_at: string
  carton_count: number
  received_qty: number
  shortage_qty: number
}

interface PickPerf {
  log_no: string
  pick_list: string | null
  item_code: string
  quantity: number | null
  location_drift: boolean
  scanned_at: string | null
}

export default function Reports() {
  const [grn, setGrn] = useState<GrnSummary[]>([])
  const [perf, setPerf] = useState<PickPerf[]>([])
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'grn' | 'pick'>('grn')

  useEffect(() => {
    api.get<GrnSummary[]>('/reports/grn-summary').then(r => { if (r.ok) setGrn(r.data ?? []) }).catch((e) => setError((e as Error).message))
    api.get<PickPerf[]>('/reports/pick-performance').then(r => { if (r.ok) setPerf(r.data ?? []) }).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Reports</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setActiveTab('grn')}
          className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          style={{
            borderColor: activeTab === 'grn' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'grn' ? 'var(--accent)' : 'var(--text-dim)',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          GRN Summary ({grn.length})
        </button>
        <button
          onClick={() => setActiveTab('pick')}
          className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          style={{
            borderColor: activeTab === 'pick' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'pick' ? 'var(--accent)' : 'var(--text-dim)',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          Pick Performance ({perf.length})
        </button>
      </div>

      {activeTab === 'grn' && (
        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">GRN Summary</h3>
          </div>
          <table className="erpnext-table">
            <thead>
              <tr><th>Session</th><th>Supplier</th><th>Status</th><th>Cartons</th><th>Received</th><th>Shortage</th><th>Date</th></tr>
            </thead>
            <tbody>
              {grn.map(r => (
                <tr key={r.session_no}>
                  <td className="font-medium">{r.session_no}</td>
                  <td>{r.supplier_name || '—'}</td>
                  <td>
                    <span className={`erpnext-badge ${r.status === 'closed' ? 'erpnext-badge-green' : 'erpnext-badge-yellow'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.carton_count}</td>
                  <td>{r.received_qty}</td>
                  <td>
                    {r.shortage_qty > 0 ? (
                      <span style={{ color: 'var(--red)' }}>{r.shortage_qty}</span>
                    ) : '0'}
                  </td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {grn.length === 0 && <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No GRN data</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'pick' && (
        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Pick Performance</h3>
          </div>
          <table className="erpnext-table">
            <thead>
              <tr><th>Log</th><th>Pick List</th><th>Item</th><th>Qty</th><th>Drift</th><th>Time</th></tr>
            </thead>
            <tbody>
              {perf.map(r => (
                <tr key={r.log_no}>
                  <td className="font-medium">{r.log_no}</td>
                  <td>{r.pick_list || '—'}</td>
                  <td>{r.item_code}</td>
                  <td>{r.quantity ?? '—'}</td>
                  <td>
                    <span className={`erpnext-badge ${r.location_drift ? 'erpnext-badge-red' : 'erpnext-badge-green'}`}>
                      {r.location_drift ? 'drift' : 'ok'}
                    </span>
                  </td>
                  <td>{r.scanned_at ? new Date(r.scanned_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {perf.length === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No pick data</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
