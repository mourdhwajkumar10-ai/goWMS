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

interface QueueRow {
  id: number
  item_code: string
  item_name: string | null
  warehouse_id: number
  warehouse_code: string
  location_id: number
  location_code: string
  batch_no: string
  qty: number
  location_type: string
}

interface Suggestion {
  location_id: number
  location_code: string
  warehouse_id: number
  reason: string
  free_capacity: number | null
  on_hand_qty: number
}

export default function Putaway() {
  const [rules, setRules] = useState<Rule[]>([])
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')

  const [itemCode, setItemCode] = useState('')
  const [warehouse, setWarehouse] = useState('MAIN')
  const [priority, setPriority] = useState('1')
  const [capacity, setCapacity] = useState('')

  const [putawayItem, setPutawayItem] = useState('')
  const [putawayQty, setPutawayQty] = useState('')
  const [putawayTarget, setPutawayTarget] = useState('')
  const [putawayTargetId, setPutawayTargetId] = useState<number | null>(null)
  const [putawaySource, setPutawaySource] = useState('')
  const [putawayWarehouseId, setPutawayWarehouseId] = useState<number | null>(null)
  const [putawayBatch, setPutawayBatch] = useState('')
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)

  const loadRules = () => api.putawayRules().then(r => { if (r.ok) setRules(r.data ?? []) })
  const loadQueue = () => api.putawayQueue().then(r => { if (r.ok) setQueue(r.data ?? []) })
  useEffect(() => { loadRules(); loadQueue() }, [])

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

  const suggest = async () => {
    if (!putawayItem) return
    const r = await api.putawaySuggest(putawayItem, +putawayQty || 1, putawayWarehouseId || undefined)
    if (r.ok && r.data) {
      setSuggestion(r.data)
      setPutawayTarget(r.data.location_code)
      setPutawayTargetId(r.data.location_id)
      setPutawayWarehouseId(r.data.warehouse_id)
      notify({ type: 'success', title: 'Suggested', message: `${r.data.location_code} (${r.data.reason})` })
    } else {
      setSuggestion(null)
      notify({ type: 'error', title: 'No suggestion', message: r.error || '' })
    }
  }

  const pickQueueRow = (row: QueueRow) => {
    setPutawayItem(row.item_code)
    setPutawayQty(String(row.qty))
    setPutawaySource(row.location_code)
    setPutawayWarehouseId(row.warehouse_id)
    setPutawayBatch(row.batch_no || '')
    setPutawayTarget('')
    setPutawayTargetId(null)
    setSuggestion(null)
  }

  const doPutaway = async () => {
    if (!putawayItem || !putawayQty || (!putawayTarget && !putawayTargetId)) return
    if (!putawaySource.trim()) {
      notify({ type: 'error', title: 'Source required', message: 'Pick a queue row or enter source location (e.g. INCOMING-01)' })
      return
    }
    const r = await api.putawayCreate({
      item_code: putawayItem,
      source_warehouse: putawaySource || undefined,
      source_location: putawaySource || undefined,
      target_location: putawayTarget,
      target_location_id: putawayTargetId || undefined,
      warehouse_id: putawayWarehouseId || undefined,
      batch_no: putawayBatch || undefined,
      quantity: +putawayQty,
    })
    if (r.ok) {
      setMsg(`Putaway complete: ${putawayQty} x ${putawayItem} → ${r.data.target_location || putawayTarget}`)
      setPutawayItem(''); setPutawayQty(''); setPutawayTarget(''); setPutawayTargetId(null)
      setPutawayBatch(''); setSuggestion(null)
      loadQueue()
      notify({ type: 'success', title: 'Putaway Complete', message: `${putawayItem} → ${r.data.target_location}` })
    } else {
      notify({ type: 'error', title: 'Putaway failed', message: r.error || '' })
    }
  }

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Putaway</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Suggest a bin, walk there, confirm</p>
        </div>
        <button onClick={() => setShowScanner(true)} className="erpnext-btn-secondary">📷 Scan Item</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="erpnext-card lg:col-span-1">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Pending queue ({queue.length})</h3>
          </div>
          <div className="p-3 overflow-auto" style={{ maxHeight: 360 }}>
            {queue.length === 0 && <p className="text-sm p-2" style={{ color: 'var(--text-dim)' }}>No incoming stock waiting.</p>}
            {queue.map(q => (
              <button
                key={q.id}
                type="button"
                onClick={() => pickQueueRow(q)}
                className="w-full text-left p-3 mb-2 rounded-lg"
                style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}
              >
                <div className="font-medium" style={{ color: 'var(--accent)' }}>{q.item_code}</div>
                <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {q.qty} from {q.warehouse_code}/{q.location_code} ({q.location_type})
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="erpnext-card lg:col-span-2">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Confirm putaway</h3>
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
                <label className="erpnext-label">Source location</label>
                <input className="erpnext-input" value={putawaySource} onChange={e => setPutawaySource(e.target.value)} placeholder="INCOMING-01" />
              </div>
              <div>
                <label className="erpnext-label">Batch</label>
                <input className="erpnext-input" value={putawayBatch} onChange={e => setPutawayBatch(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Target Location *</label>
                <input className="erpnext-input" value={putawayTarget} onChange={e => { setPutawayTarget(e.target.value); setPutawayTargetId(null) }} placeholder="A-01-L-01" />
              </div>
              <div className="flex items-end">
                <button onClick={suggest} className="erpnext-btn-secondary w-full">Suggest location</button>
              </div>
            </div>

            {suggestion && (
              <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(36,144,239,0.08)', border: '1px solid rgba(36,144,239,0.25)' }}>
                Suggested <strong>{suggestion.location_code}</strong> — {suggestion.reason}
                {suggestion.free_capacity != null && <> · free {suggestion.free_capacity}</>}
                · on hand {suggestion.on_hand_qty}
              </div>
            )}

            <button onClick={doPutaway} className="erpnext-btn-primary">Confirm putaway</button>
          </div>
        </div>
      </div>

      {msg && (
        <div style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
          {msg}
        </div>
      )}

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
            <h3 className="font-semibold">Rules ({rules.length})</h3>
          </div>
          <table className="erpnext-table">
            <thead>
              <tr><th>Item</th><th>Warehouse</th><th>Priority</th><th>Capacity</th></tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td>{r.item_code}</td>
                  <td>{r.warehouse}</td>
                  <td>{r.priority}</td>
                  <td>{r.stock_capacity}</td>
                </tr>
              ))}
              {rules.length === 0 && <tr><td colSpan={4} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No rules</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
