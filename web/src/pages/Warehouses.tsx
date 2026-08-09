import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface Wh {
  id: number
  name: string
  code: string
  warehouse_type: string | null
  picking_mode: string | null
  disabled: boolean
}

export default function Warehouses() {
  const [list, setList] = useState<Wh[]>([])
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [msg, setMsg] = useState('')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [whType, setWhType] = useState('')
  const [pickingMode, setPickingMode] = useState('')

  const loadList = () => api.warehouseList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const createWarehouse = async () => {
    const r = await api.warehouseCreate({ code, name, warehouse_type: whType, picking_mode: pickingMode })
    if (r.ok) {
      setMsg(`Warehouse ${code} created`)
      setCode(''); setName(''); setWhType(''); setPickingMode('')
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Warehouse Created', message: code })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Warehouses</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Warehouse master with location management</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="erpnext-btn-primary">
          {showNew ? '✕ Cancel' : '+ New Warehouse'}
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
            <h2 className="text-lg font-semibold">Create Warehouse</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="erpnext-label">Code *</label>
                <input className="erpnext-input" value={code} onChange={e => setCode(e.target.value)} placeholder="WH-001" />
              </div>
              <div>
                <label className="erpnext-label">Name *</label>
                <input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} placeholder="Main Warehouse" />
              </div>
              <div>
                <label className="erpnext-label">Type</label>
                <select className="erpnext-input" value={whType} onChange={e => setWhType(e.target.value)}>
                  <option value="">Select type</option>
                  <option value="transit">Transit</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="stores">Stores</option>
                </select>
              </div>
              <div>
                <label className="erpnext-label">Picking Mode</label>
                <select className="erpnext-input" value={pickingMode} onChange={e => setPickingMode(e.target.value)}>
                  <option value="">Select mode</option>
                  <option value="fifo">FIFO</option>
                  <option value="lifo">LIFO</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createWarehouse} className="erpnext-btn-primary">Create Warehouse</button>
            </div>
          </div>
        </div>
      )}

      <div className="erpnext-card">
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">All Warehouses ({list.length})</h2>
        </div>
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Picking Mode</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(w => (
                <tr key={w.id}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{w.code}</td>
                  <td>{w.name}</td>
                  <td>{w.warehouse_type || '—'}</td>
                  <td>{w.picking_mode || '—'}</td>
                  <td>
                    <span className={`erpnext-badge ${w.disabled ? 'erpnext-badge-red' : 'erpnext-badge-green'}`}>
                      {w.disabled ? 'disabled' : 'active'}
                    </span>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No warehouses</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
