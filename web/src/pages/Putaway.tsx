import { useEffect, useState } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import { notify } from '../components/Notifications'

interface Rule {
  id: number
  item_code: string
  warehouse: string
  priority: number
  stock_capacity: number
}

export default function Putaway() {
  const [rules, setRules] = useState<Rule[]>([])
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')

  const [itemCode, setItemCode] = useState('')
  const [warehouse, setWarehouse] = useState('MAIN')
  const [priority, setPriority] = useState('1')
  const [capacity, setCapacity] = useState('')

  const [putawayItem, setPutawayItem] = useState('')
  const [putawayQty, setPutawayQty] = useState('')
  const [putawayTarget, setPutawayTarget] = useState('')
  const [putawaySource, setPutawaySource] = useState('Stores - GW')

  const loadRules = () => api.putawayRules().then(r => { if (r.ok) setRules(r.data ?? []) })
  useEffect(() => { loadRules() }, [])

  const addRule = async () => {
    const r = await api.post('/putaway-rules/', {
      item_code: itemCode,
      warehouse,
      priority: +priority || 1,
      stock_capacity: +capacity || 0,
    })
    if (r.ok) {
      setMsg('Rule added')
      setItemCode(''); setCapacity('')
      loadRules()
      notify({ type: 'success', title: 'Rule Added', message: itemCode })
    }
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    setPutawayItem(code)
  }

  const doPutaway = async () => {
    if (!putawayItem || !putawayQty || !putawayTarget) return
    const r = await api.putawayCreate({
      item_code: putawayItem,
      source_warehouse: putawaySource,
      target_location: putawayTarget,
      quantity: +putawayQty,
    })
    if (r.ok) {
      setMsg(`Putaway complete: ${putawayQty} x ${putawayItem} → ${putawayTarget}`)
      setPutawayItem(''); setPutawayQty(''); setPutawayTarget('')
      notify({ type: 'success', title: 'Putaway Complete', message: `${putawayItem} → ${putawayTarget}` })
    }
  }

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Putaway</h2>
        <button onClick={() => setShowScanner(true)} className="erpnext-btn-secondary">📷 Scan Item</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Putaway Rules</h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="erpnext-label">Item Code *</label>
                <input className="erpnext-input" value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="ITEM-001" />
              </div>
              <div>
                <label className="erpnext-label">Warehouse</label>
                <input className="erpnext-input" value={warehouse} onChange={e => setWarehouse(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Priority</label>
                <input className="erpnext-input" type="number" value={priority} onChange={e => setPriority(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Capacity</label>
                <input className="erpnext-input" type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="0" />
              </div>
            </div>
            <button onClick={addRule} className="erpnext-btn-primary">Add Rule</button>
          </div>
        </div>

        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Record Putaway</h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="erpnext-label">Item Code *</label>
                <div className="flex gap-1">
                  <input className="erpnext-input" value={putawayItem} onChange={e => setPutawayItem(e.target.value)} placeholder="ITEM-001" />
                  <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
                </div>
              </div>
              <div>
                <label className="erpnext-label">Quantity *</label>
                <input className="erpnext-input" type="number" value={putawayQty} onChange={e => setPutawayQty(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Source Warehouse</label>
                <input className="erpnext-input" value={putawaySource} onChange={e => setPutawaySource(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Target Location *</label>
                <input className="erpnext-input" value={putawayTarget} onChange={e => setPutawayTarget(e.target.value)} placeholder="RACK-A-01" />
              </div>
            </div>
            <button onClick={doPutaway} className="erpnext-btn-primary">Putaway</button>
          </div>
        </div>
      </div>

      {msg && (
        <div style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
          {msg}
        </div>
      )}

      <div className="erpnext-card">
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold">Putaway Rules ({rules.length})</h3>
        </div>
        <table className="erpnext-table">
          <thead>
            <tr><th>Item</th><th>Warehouse</th><th>Priority</th><th>Capacity</th></tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id}>
                <td className="font-medium">{r.item_code}</td>
                <td>{r.warehouse}</td>
                <td>{r.priority}</td>
                <td>{r.stock_capacity}</td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={4} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No rules</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
