import { useEffect, useState } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'

interface Sheet {
  id: number
  sheet_no: string
  warehouse_id: number | null
  tier: string | null
  scheduled_date: string | null
  status: string | null
  created_at: string
}

interface CountLine {
  id: number
  item_code: string
  system_qty: number
  counted_qty: number | null
  discrepancy_status: string | null
}

export default function CycleCount() {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [selectedSheet, setSelectedSheet] = useState<any>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')

  const [tier, setTier] = useState('A')
  const [scheduledDate, setScheduledDate] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [aisle, setAisle] = useState('')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [autoGen, setAutoGen] = useState(true)

  const [addItemCode, setAddItemCode] = useState('')
  const [addSystemQty, setAddSystemQty] = useState('')

  const loadSheets = () => api.cycleCountSheets().then(r => { if (r.ok) setSheets(r.data ?? []) })
  useEffect(() => {
    loadSheets()
    api.warehouseList().then(r => { if (r.ok) setWarehouses(r.data ?? []) })
  }, [])

  const createSheet = async () => {
    const r = await api.cycleCountCreate({
      tier,
      scheduled_date: scheduledDate || undefined,
      warehouse_id: warehouse ? +warehouse : undefined,
      aisle: aisle || undefined,
      auto_generate: autoGen && !!warehouse,
    })
    if (r.ok) {
      setMsg(`Sheet ${r.data.sheet_no} created${r.data.lines_generated ? ` · ${r.data.lines_generated} bins` : ''}`)
      setTier('A'); setScheduledDate(''); setAisle('')
      loadSheets()
      notify({ type: 'success', title: 'Sheet Created', message: r.data.sheet_no })
      if (r.data.id) openSheet(r.data.id)
    }
  }

  const openSheet = async (id: number) => {
    const r = await api.get(`/cyclecount/${id}`)
    if (r.ok) setSelectedSheet(r.data)
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    setAddItemCode(code)
  }

  const addLine = async () => {
    if (!addItemCode || !selectedSheet) return
    const r = await api.post(`/cyclecount/${selectedSheet.id}/line`, {
      item_code: addItemCode,
      system_qty: +addSystemQty || 0,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Line Added', message: addItemCode })
      setAddItemCode(''); setAddSystemQty('')
      openSheet(selectedSheet.id)
    }
  }

  const submitCount = async (lineId: number, qty: number) => {
    const r = await api.post(`/cyclecount/line/${lineId}/count`, { counted_qty: qty })
    if (r.ok) {
      notify({ type: 'success', title: 'Count Recorded', message: `Qty: ${qty}` })
      openSheet(selectedSheet.id)
    }
  }

  const completeSheet = async () => {
    if (!selectedSheet) return
    const apply = window.confirm('Apply qty adjustments to location stock for discrepancies?')
    const r = await api.post<{ adjustments_applied?: number }>(`/cyclecount/${selectedSheet.id}/complete`, { apply_adjustments: apply })
    if (r.ok) {
      notify({
        type: 'success',
        title: 'Sheet Completed',
        message: apply ? `${r.data?.adjustments_applied || 0} adjustments applied` : 'Closed without adjustments',
      })
      setSelectedSheet(null)
      loadSheets()
    }
  }

  const statusBadge = (status: string) => {
    const cls = status === 'completed' ? 'erpnext-badge-green' :
                status === 'in_progress' ? 'erpnext-badge-blue' :
                'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cycle Count</h2>
        <button onClick={() => setShowScanner(true)} className="erpnext-btn-secondary">📷 Scan Item</button>
      </div>

      {!selectedSheet ? (
        <>
          <div className="erpnext-card">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Create Count Sheet</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="erpnext-label">Tier (ABC)</label>
                  <select className="erpnext-input" value={tier} onChange={e => setTier(e.target.value)}>
                    <option value="A">A (Fast)</option>
                    <option value="B">B (Medium)</option>
                    <option value="C">C (Slow)</option>
                  </select>
                </div>
                <div>
                  <label className="erpnext-label">Scheduled Date</label>
                  <input className="erpnext-input" type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
                </div>
                <div>
                  <label className="erpnext-label">Warehouse</label>
                  <select className="erpnext-input" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                    <option value="">Select</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="erpnext-label">Aisle (optional)</label>
                  <input className="erpnext-input" value={aisle} onChange={e => setAisle(e.target.value)} placeholder="A" />
                </div>
                <div className="flex items-center gap-2 md:col-span-2">
                  <input type="checkbox" id="autogen" checked={autoGen} onChange={e => setAutoGen(e.target.checked)} className="w-4 h-4" />
                  <label htmlFor="autogen" className="text-sm">Auto-fill from location stock</label>
                </div>
                <div className="flex items-end md:col-span-2">
                  <button onClick={createSheet} className="erpnext-btn-primary w-full">Create Sheet</button>
                </div>
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
              <h3 className="font-semibold">Count Sheets</h3>
            </div>
            <table className="erpnext-table">
              <thead>
                <tr><th>Sheet No</th><th>Tier</th><th>Scheduled</th><th>Status</th><th>Created</th><th>Action</th></tr>
              </thead>
              <tbody>
                {sheets.map(s => (
                  <tr key={s.id}>
                    <td className="font-medium cursor-pointer hover:underline" style={{ color: 'var(--accent)' }} onClick={() => openSheet(s.id)}>{s.sheet_no}</td>
                    <td>{s.tier || '—'}</td>
                    <td>{s.scheduled_date ? new Date(s.scheduled_date).toLocaleDateString() : '—'}</td>
                    <td>{statusBadge(s.status || 'pending')}</td>
                    <td>{new Date(s.created_at).toLocaleDateString()}</td>
                    <td>
                      <button onClick={() => openSheet(s.id)} className="erpnext-btn-secondary text-xs">Open</button>
                    </td>
                  </tr>
                ))}
                {sheets.length === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No sheets</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold">{selectedSheet.sheet_no}</h3>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Tier: {selectedSheet.tier} | Status: {selectedSheet.status}</p>
            </div>
            <div className="flex gap-2">
              {selectedSheet.status !== 'completed' && (
                <button onClick={completeSheet} className="erpnext-btn-primary text-sm">Complete</button>
              )}
              <button onClick={() => setSelectedSheet(null)} className="erpnext-btn-secondary">Back</button>
            </div>
          </div>

          <div className="p-4">
            <h4 className="font-medium text-sm mb-2">Add Item to Count</h4>
            <div className="flex gap-2">
              <input className="erpnext-input" value={addItemCode} onChange={e => setAddItemCode(e.target.value)} placeholder="Item code" />
              <input className="erpnext-input" type="number" value={addSystemQty} onChange={e => setAddSystemQty(e.target.value)} placeholder="System qty" />
              <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
              <button onClick={addLine} className="erpnext-btn-primary">Add</button>
            </div>

            {selectedSheet.lines && selectedSheet.lines.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Count Lines ({selectedSheet.lines.length})</h4>
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr><th>Location</th><th>Item</th><th>System Qty</th><th>Counted Qty</th><th>Variance</th><th>Status</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {selectedSheet.lines.map((line: any) => {
                      const variance = line.counted_qty !== null && line.counted_qty !== undefined ? line.counted_qty - line.system_qty : null
                      return (
                        <tr key={line.id}>
                          <td className="text-xs">{line.location_code || '—'}</td>
                          <td className="font-medium">{line.item_code}</td>
                          <td>{line.system_qty}</td>
                          <td>{line.counted_qty ?? '—'}</td>
                          <td>
                            {variance !== null ? (
                              <span style={{ color: variance === 0 ? 'var(--green)' : 'var(--red)' }}>
                                {variance > 0 ? '+' : ''}{variance}
                              </span>
                            ) : '—'}
                          </td>
                          <td>
                            {line.discrepancy_status && (
                              <span className={`erpnext-badge ${line.discrepancy_status === 'match' ? 'erpnext-badge-green' : 'erpnext-badge-red'}`}>
                                {line.discrepancy_status}
                              </span>
                            )}
                          </td>
                          <td>
                            {line.counted_qty === null && selectedSheet.status !== 'completed' && (
                              <input
                                className="erpnext-input text-sm"
                                type="number"
                                placeholder="Count"
                                style={{ width: 80 }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    submitCount(line.id, +(e.target as HTMLInputElement).value)
                                    ;(e.target as HTMLInputElement).value = ''
                                  }
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Comments entityType="cycle_count_sheet" entityId={selectedSheet.id} />
          </div>
        </div>
      )}
    </div>
  )
}
