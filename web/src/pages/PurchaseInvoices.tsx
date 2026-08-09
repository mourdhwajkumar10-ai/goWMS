import { useEffect, useState } from 'react'
import { api } from '../services/api'

interface Pi {
  id: number
  name: string
  supplier_name: string | null
  status: string | null
  grand_total: number | null
  currency: string | null
  posting_date: string | null
}

export default function PurchaseInvoices() {
  const [list, setList] = useState<Pi[]>([])
  const [search, setSearch] = useState('')

  const loadList = () => api.purchaseInvoiceList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const statusBadge = (status: string) => {
    const cls = status === 'paid' ? 'erpnext-badge-green' :
                status === 'submitted' ? 'erpnext-badge-blue' :
                status === 'draft' ? 'erpnext-badge-yellow' :
                'erpnext-badge-red'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Purchase Invoices</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Inbound billing and payment tracking</p>
        </div>
      </div>

      <div className="erpnext-card">
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">All Invoices ({list.length})</h2>
          <input className="erpnext-input text-sm" style={{ width: 250 }} placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Invoice</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Date</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{p.name}</td>
                  <td>{p.supplier_name || '—'}</td>
                  <td>{statusBadge(p.status || 'draft')}</td>
                  <td>{p.posting_date ? new Date(p.posting_date).toLocaleDateString() : '—'}</td>
                  <td className="text-right font-medium">{p.currency} {p.grand_total?.toFixed(2) || '0.00'}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No invoices</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
