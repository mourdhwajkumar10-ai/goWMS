import { useEffect, useState } from 'react'
import { api } from '../services/api'

interface Dn {
  id: number
  name: string
  customer_name: string | null
  status: string | null
  posting_date: string | null
  grand_total: number | null
  currency: string | null
}

export default function DeliveryNotes() {
  const [list, setList] = useState<Dn[]>([])
  const [search, setSearch] = useState('')

  const loadList = () => api.deliveryNoteList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const statusBadge = (status: string) => {
    const cls = status === 'completed' ? 'erpnext-badge-green' :
                status === 'in_transit' ? 'erpnext-badge-blue' :
                status === 'draft' ? 'erpnext-badge-yellow' :
                'erpnext-badge-red'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Delivery Notes</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Outbound delivery notes for customer shipments</p>
        </div>
      </div>

      <div className="erpnext-card">
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">All Delivery Notes ({list.length})</h2>
          <input className="erpnext-input text-sm" style={{ width: 250 }} placeholder="Search delivery notes..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Name</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Date</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {list.map(d => (
                <tr key={d.id}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{d.name}</td>
                  <td>{d.customer_name || '—'}</td>
                  <td>{statusBadge(d.status || 'draft')}</td>
                  <td>{d.posting_date ? new Date(d.posting_date).toLocaleDateString() : '—'}</td>
                  <td className="text-right font-medium">{d.currency} {d.grand_total?.toFixed(2) || '0.00'}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No delivery notes</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
