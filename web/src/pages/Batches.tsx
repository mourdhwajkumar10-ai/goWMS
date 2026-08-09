import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface Batch {
  id: number
  batch_id: string
  item_code: string
  item_name: string
  manufacturing_date: string | null
  expiry_date: string | null
  batch_qty: number | null
  stock_uom: string | null
}

export default function Batches() {
  const [list, setList] = useState<Batch[]>([])
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [msg, setMsg] = useState('')

  const [batchId, setBatchId] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [mfgDate, setMfgDate] = useState('')
  const [expDate, setExpDate] = useState('')
  const [qty, setQty] = useState('')

  const loadList = () => api.batchList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const createBatch = async () => {
    const r = await api.batchCreate({
      batch_id: batchId, item_code: itemCode,
      manufacturing_date: mfgDate || undefined, expiry_date: expDate || undefined,
      batch_qty: +qty || 0
    })
    if (r.ok) {
      setMsg(`Batch ${batchId} created`)
      setBatchId(''); setItemCode(''); setMfgDate(''); setExpDate(''); setQty('')
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Batch Created', message: batchId })
    }
  }

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false
    const d = new Date(date)
    const now = new Date()
    const diff = d.getTime() - now.getTime()
    return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000
  }

  const isExpired = (date: string | null) => {
    if (!date) return false
    return new Date(date) < new Date()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Batches</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Batch master with expiry tracking</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="erpnext-btn-primary">
          {showNew ? '✕ Cancel' : '+ New Batch'}
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
            <h2 className="text-lg font-semibold">Create Batch</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="erpnext-label">Batch ID *</label>
                <input className="erpnext-input" value={batchId} onChange={e => setBatchId(e.target.value)} placeholder="BATCH-001" />
              </div>
              <div>
                <label className="erpnext-label">Item Code *</label>
                <input className="erpnext-input" value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="ITEM-001" />
              </div>
              <div>
                <label className="erpnext-label">Quantity</label>
                <input className="erpnext-input" type="number" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Manufacturing Date</label>
                <input className="erpnext-input" type="date" value={mfgDate} onChange={e => setMfgDate(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Expiry Date</label>
                <input className="erpnext-input" type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createBatch} className="erpnext-btn-primary">Create Batch</button>
            </div>
          </div>
        </div>
      )}

      <div className="erpnext-card">
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">All Batches ({list.length})</h2>
        </div>
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Batch ID</th>
                <th>Item</th>
                <th>Mfg Date</th>
                <th>Expiry</th>
                <th>Qty</th>
                <th>UOM</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(b => (
                <tr key={b.id}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{b.batch_id}</td>
                  <td>{b.item_code}</td>
                  <td>{b.manufacturing_date ? new Date(b.manufacturing_date).toLocaleDateString() : '—'}</td>
                  <td>{b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '—'}</td>
                  <td className="text-right">{b.batch_qty ?? '—'}</td>
                  <td>{b.stock_uom || '—'}</td>
                  <td>
                    {isExpired(b.expiry_date) ? (
                      <span className="erpnext-badge erpnext-badge-red">Expired</span>
                    ) : isExpiringSoon(b.expiry_date) ? (
                      <span className="erpnext-badge erpnext-badge-yellow">Expiring Soon</span>
                    ) : (
                      <span className="erpnext-badge erpnext-badge-green">Active</span>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No batches</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
