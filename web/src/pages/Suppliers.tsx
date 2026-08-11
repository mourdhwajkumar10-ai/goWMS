import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface Sup {
  id: number
  name: string
  supplier_group: string | null
  gstin: string | null
  disabled: boolean
}

export default function Suppliers() {
  const [list, setList] = useState<Sup[]>([])
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [msg, setMsg] = useState('')

  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [gstin, setGstin] = useState('')
  const [isTransporter, setIsTransporter] = useState(false)
  const [carrierCode, setCarrierCode] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  const loadList = () => api.supplierList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const createSupplier = async () => {
    const r = await api.supplierCreate({
      name,
      supplier_group: group,
      gstin,
      is_transporter: isTransporter,
      carrier_code: carrierCode || undefined,
      contact_phone: phone || undefined,
      contact_email: email || undefined,
    })
    if (r.ok) {
      setMsg(`Supplier "${name}" created`)
      setName(''); setGroup(''); setGstin(''); setIsTransporter(false); setCarrierCode(''); setPhone(''); setEmail('')
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Supplier Created', message: name })
    } else {
      notify({ type: 'error', title: 'Failed', message: r.error || '' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Suppliers</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Supplier master with GST tracking</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="erpnext-btn-primary">
          {showNew ? '✕ Cancel' : '+ New Supplier'}
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
            <h2 className="text-lg font-semibold">Create Supplier</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="erpnext-label">Supplier Name *</label>
                <input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} placeholder="ABC Suppliers" />
              </div>
              <div>
                <label className="erpnext-label">Supplier Group</label>
                <input className="erpnext-input" value={group} onChange={e => setGroup(e.target.value)} placeholder="Local" />
              </div>
              <div>
                <label className="erpnext-label">GSTIN</label>
                <input className="erpnext-input" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="27AABCU9603R1ZM" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" id="isTx" checked={isTransporter} onChange={e => setIsTransporter(e.target.checked)} />
                <label htmlFor="isTx" className="text-sm">Is Transporter / Carrier</label>
              </div>
              {isTransporter && (
                <>
                  <div>
                    <label className="erpnext-label">Carrier Code</label>
                    <input className="erpnext-input" value={carrierCode} onChange={e => setCarrierCode(e.target.value)} />
                  </div>
                  <div>
                    <label className="erpnext-label">Contact Phone</label>
                    <input className="erpnext-input" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div>
                    <label className="erpnext-label">Contact Email</label>
                    <input className="erpnext-input" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createSupplier} className="erpnext-btn-primary">Create Supplier</button>
            </div>
          </div>
        </div>
      )}

      <div className="erpnext-card">
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">All Suppliers ({list.length})</h2>
          <input className="erpnext-input text-sm" style={{ width: 250 }} placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Name</th>
                <th>Group</th>
                <th>GSTIN</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{s.name}</td>
                  <td>{s.supplier_group || '—'}</td>
                  <td>{s.gstin || '—'}</td>
                  <td>
                    <span className={`erpnext-badge ${s.disabled ? 'erpnext-badge-red' : 'erpnext-badge-green'}`}>
                      {s.disabled ? 'disabled' : 'active'}
                    </span>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={4} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No suppliers</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
