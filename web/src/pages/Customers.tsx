import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

interface Cust {
  id: number
  name: string
  customer_group: string | null
  customer_type: string | null
  gstin: string | null
  territory: string | null
}

export default function Customers() {
  const [list, setList] = useState<Cust[]>([])
  const [showNew, setShowNew] = useState(false)
  const [msg, setMsg] = useState('')

  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [gstin, setGstin] = useState('')
  const [territory, setTerritory] = useState('')

  const loadList = () => api.customerList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])
  const pager = useClientPager(list)

  const createCustomer = async () => {
    const r = await api.customerCreate({ name, customer_group: group, gstin, territory })
    if (r.ok) {
      setMsg(`Customer "${name}" created`)
      setName(''); setGroup(''); setGstin(''); setTerritory('')
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Customer Created', message: name })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Customers</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Customer master with GST and territory tracking</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="erpnext-btn-primary">
          {showNew ? '✕ Cancel' : '+ New Customer'}
        </button>
      </div>

      {msg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{ 
          background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)' 
        }}>
          <span>✓</span> {msg}
        </div>
      )}

      {showNew && (
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Create Customer</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="erpnext-label">Customer Name *</label>
                <input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} placeholder="ABC Motors" />
              </div>
              <div>
                <label className="erpnext-label">Customer Group</label>
                <input className="erpnext-input" value={group} onChange={e => setGroup(e.target.value)} placeholder="Commercial" />
              </div>
              <div>
                <label className="erpnext-label">GSTIN</label>
                <input className="erpnext-input" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="27AABCU9603R1ZM" />
              </div>
              <div>
                <label className="erpnext-label">Territory</label>
                <input className="erpnext-input" value={territory} onChange={e => setTerritory(e.target.value)} placeholder="India" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createCustomer} className="erpnext-btn-primary">Create Customer</button>
            </div>
          </div>
        </div>
      )}

      <div className="erpnext-card">
        <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">All Customers ({list.length})</h2>
          <ListPager pager={pager} placeholder="Search customers…" />
        </div>
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Name</th>
                <th>Group</th>
                <th>Type</th>
                <th>GSTIN</th>
                <th>Territory</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map(c => (
                <tr key={c.id}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{c.name}</td>
                  <td>{c.customer_group || '—'}</td>
                  <td>{c.customer_type || '—'}</td>
                  <td>{c.gstin || '—'}</td>
                  <td>{c.territory || '—'}</td>
                </tr>
              ))}
              {pager.total === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No customers</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
