import { useState, useEffect } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'

export default function GRN() {
  const [sessions, setSessions] = useState<any[]>([])
  const [session, setSession] = useState<any>(null)
  const [pos, setPOs] = useState<any[]>([])
  const [selectedPO, setSelectedPO] = useState<any>(null)
  const [cartonNo, setCartonNo] = useState('')
  const [item, setItem] = useState('')
  const [exp, setExp] = useState('')
  const [scan, setScan] = useState('')
  const [batch, setBatch] = useState('')
  const [serial, setSerial] = useState('')
  const [mfgDate, setMfgDate] = useState('')
  const [expDate, setExpDate] = useState('')
  const [shelfLife, setShelfLife] = useState('')
  const [damagedQty, setDamagedQty] = useState('')
  const [requiresQI, setRequiresQI] = useState(false)
  const [lineNotes, setLineNotes] = useState('')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [completeMaster, setCompleteMaster] = useState<any>(null)
  const [cmName, setCmName] = useState('')
  const [cmPack, setCmPack] = useState('loose')
  const [cmControl, setCmControl] = useState('item_controlled')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [scanTarget, setScanTarget] = useState<'carton' | 'item'>('carton')
  const [putawayItem, setPutawayItem] = useState('')
  const [putawayQty, setPutawayQty] = useState('')
  const [putawayTarget, setPutawayTarget] = useState('')
  const [putawaySource, setPutawaySource] = useState('INCOMING-01')
  const [showPutaway, setShowPutaway] = useState(false)
  const [confirmClose, setConfirmClose] = useState<any>(null)

  const openPOStatuses = new Set([
    'draft', 'submitted', 'To Receive and Bill', 'To Receive', 'Partially Received',
  ])

  const loadSessions = () => api.grnSessions().then(r => { if (r.ok) setSessions(r.data ?? []) })
  const loadPOs = () => api.poList().then(r => {
    if (r.ok) {
      setPOs((r.data ?? []).filter((p: any) =>
        openPOStatuses.has(p.status) && (p.per_received ?? 0) < 100
      ))
    }
  })
  useEffect(() => {
    loadSessions(); loadPOs()
    api.warehouseList().then(r => {
      if (r.ok) {
        setWarehouses(r.data ?? [])
        if (r.data?.[0] && !warehouseId) setWarehouseId(String(r.data[0].id))
      }
    })
  }, [])

  const createSessionFromPO = async (po: any) => {
    setLoading(true)
    const detail = await api.poGet(po.id)
    const fullPO = detail.ok ? detail.data : po
    const r = await api.grnCreate({
      warehouse_id: warehouseId ? +warehouseId : undefined,
      purchase_receipt_no: fullPO.name || po.name,
      supplier_name: fullPO.supplier_name || po.supplier_name,
      purchase_order_id: po.id,
    })
    setLoading(false)
    if (r.ok) {
      setSelectedPO(fullPO)
      setSession({ ...r.data, cartons: [], po_items: fullPO.items || [] })
      loadSessions()
      notify({ type: 'success', title: 'GRN Session Created', message: `${r.data.session_no} for ${po.name}` })
    } else {
      notify({ type: 'error', title: 'Could not start receiving', message: r.error || 'Unknown error' })
    }
  }

  const createBlankSession = async () => {
    setLoading(true)
    const r = await api.grnCreate({
      warehouse_id: warehouseId ? +warehouseId : undefined,
      purchase_receipt_no: '',
      supplier_name: '',
    })
    setLoading(false)
    if (r.ok) {
      setSelectedPO(null)
      setSession({ ...r.data, cartons: [] })
      loadSessions()
      notify({ type: 'success', title: 'GRN Session Created', message: r.data.session_no })
    }
  }

  const openSession = async (id: number) => {
    const r = await api.grnSession(id)
    if (!r.ok) {
      notify({ type: 'error', title: 'Session load failed', message: r.error || '' })
      return
    }
    setSession(r.data)
    const poName = r.data.purchase_receipt_no
    if (poName) {
      const list = await api.poSearch(poName)
      if (list.ok && list.data?.[0]) {
        const detail = await api.poGet(list.data[0].id)
        if (detail.ok) setSelectedPO(detail.data)
      }
    }
  }

  const addCarton = async () => {
    if (!cartonNo) return
    const r = await api.grnScanCarton({ grn_session_id: session.id, carton_no: cartonNo })
    if (r.ok) {
      setMsg(`Carton ${cartonNo} scanned`)
      setCartonNo('')
      openSession(session.id)
    } else {
      notify({ type: 'error', title: 'Carton scan failed', message: r.error || '' })
    }
  }

  const addLine = async () => {
    if (!item) return

    const check = await api.itemCheck(item)
    if (check.ok && (!check.data.exists || !check.data.master_complete)) {
      setCompleteMaster({ code: item })
      setCmName('')
      notify({
        type: 'warning',
        title: 'Complete item master first',
        message: `${item} is new or incomplete.`,
      })
      return
    }

    let cartonId = session.cartons?.[0]?.id
    if (!cartonId) {
      const auto = await api.grnScanCarton({
        grn_session_id: session.id,
        carton_no: `AUTO-${session.id}`,
      })
      if (!auto.ok) {
        notify({ type: 'error', title: 'Need a carton first', message: auto.error || 'Scan a carton before items' })
        return
      }
      cartonId = auto.data.id
    }
    const r = await api.grnScanLine({
      grn_carton_id: cartonId,
      item_code: item, expected_qty: +exp || 0, scanned_qty: +scan || 1,
      damaged_qty: +damagedQty || 0,
      requires_qi: requiresQI,
      notes: lineNotes || undefined,
      batch_no: batch, serial_no: serial,
      manufacturing_date: mfgDate || undefined, expiry_date: expDate || undefined,
      shelf_life_days: shelfLife ? +shelfLife : undefined,
    })
    if (r.ok) {
      const variance = r.data.variance_qty
      const varianceMsg = variance ? ` · variance ${variance > 0 ? '+' : ''}${variance}` : ''
      setMsg(`Status: ${r.data.status}${varianceMsg}`)
      notify({
        type: r.data.status === 'full_match' ? 'success' : 'warning',
        title: 'Item Scanned',
        message: `${item}: ${r.data.status}${varianceMsg}`,
      })
      setItem(''); setExp(''); setScan(''); setBatch(''); setSerial('')
      setMfgDate(''); setExpDate(''); setShelfLife('')
      setDamagedQty(''); setRequiresQI(false); setLineNotes('')
      openSession(session.id)
    } else {
      notify({ type: 'error', title: 'Item scan failed', message: r.error || '' })
    }
  }

  const saveCompleteMaster = async () => {
    if (!completeMaster?.code || !cmName) return
    const r = await api.itemComplete({
      code: completeMaster.code,
      name: cmName,
      pack_type: cmPack,
      control_mode: cmControl,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Item master saved', message: completeMaster.code })
      setCompleteMaster(null)
    } else {
      notify({ type: 'error', title: 'Could not save master', message: r.error || '' })
    }
  }

  const closeSession = async () => {
    if (!window.confirm('Close this GRN and post stock to Incoming/Hold?')) return
    const r = await api.grnClose({ grn_session_id: session.id })
    if (r.ok) {
      const sle = r.data.sle_count ?? r.data.items_posted ?? 0
      const po = r.data.po || {}
      const poLine = po.po_name
        ? `\nPO ${po.po_name}: ${Number(po.per_received || 0).toFixed(1)}% received → ${po.status}`
        : ''
      setConfirmClose({
        sessionNo: session.session_no,
        sle,
        po,
        postedIncoming: r.data.posted_incoming,
        postedHold: r.data.posted_hold,
        postedDamaged: r.data.posted_damaged,
        qiCreated: r.data.qi_created,
        variances: r.data.variances || [],
        putawayReady: r.data.putaway_ready,
      })
      setMsg(`Session closed — ${sle} lines posted to locations`)
      notify({
        type: 'success',
        title: 'Receiving Complete',
        message: `${sle} lines → Incoming/Hold${poLine}`,
      })
      setSession(null)
      setSelectedPO(null)
      loadSessions()
      loadPOs()
    } else {
      notify({ type: 'error', title: 'Close failed', message: r.error || '' })
    }
  }

  const doPutaway = async () => {
    if (!putawayItem || !putawayQty || !putawayTarget) return
    const r = await api.grnPutaway({
      item_code: putawayItem, source_warehouse: putawaySource,
      target_location: putawayTarget, quantity: +putawayQty,
    })
    if (r.ok) {
      setMsg(`Putaway complete: ${r.data.quantity} x ${putawayItem} → ${r.data.target_location}`)
      setPutawayItem(''); setPutawayQty(''); setPutawayTarget('')
    }
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    if (scanTarget === 'carton') setCartonNo(code)
    else setItem(code)
  }

  const fillFromPOItem = (poItem: any) => {
    const pending = Math.max(0, (poItem.qty || 0) - (poItem.received_qty || 0))
    setItem(poItem.item_code)
    setExp(String(pending))
    setScan(String(pending || 1))
  }

  const statusBadge = (status: string) => {
    const cls = status === 'open' ? 'erpnext-badge-green' :
                status === 'stuck' ? 'erpnext-badge-red' :
                status === 'closed' ? 'erpnext-badge-blue' :
                'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="erpnext-card max-w-md w-full mx-4 p-6 space-y-4" style={{ background: 'var(--panel)' }}>
            <h2 className="text-xl font-semibold">Receiving confirmed</h2>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              Session <strong>{confirmClose.sessionNo}</strong> is closed. Stock is in staging (not sellable until putaway).
            </p>
            <ul className="text-sm space-y-2">
              <li>✓ {confirmClose.sle} lines posted</li>
              <li>✓ Incoming: {confirmClose.postedIncoming ?? 0} · Hold/QI: {confirmClose.postedHold ?? 0} · Damaged: {confirmClose.postedDamaged ?? 0}</li>
              {(confirmClose.qiCreated ?? 0) > 0 && <li>✓ {confirmClose.qiCreated} QI ticket(s) created</li>}
              {(confirmClose.variances?.length ?? 0) > 0 && (
                <li style={{ color: 'var(--orange-700, #9c4621)' }}>
                  ⚠ {confirmClose.variances.length} variance(s) vs expected
                </li>
              )}
              {confirmClose.po?.po_name ? (
                <>
                  <li>✓ PO <strong>{confirmClose.po.po_name}</strong> updated</li>
                  <li>✓ Status → <strong>{confirmClose.po.status}</strong></li>
                </>
              ) : (
                <li>• No linked PO (blank session)</li>
              )}
            </ul>
            <div className="flex gap-2">
              {confirmClose.putawayReady && (
                <button
                  className="erpnext-btn-primary flex-1"
                  onClick={() => { setConfirmClose(null); window.location.href = '/putaway' }}
                >
                  Go to Putaway
                </button>
              )}
              <button className="erpnext-btn-secondary flex-1" onClick={() => setConfirmClose(null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {completeMaster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="erpnext-card max-w-md w-full mx-4 p-6 space-y-4" style={{ background: 'var(--panel)' }}>
            <h2 className="text-xl font-semibold">Complete item master</h2>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              New part <strong>{completeMaster.code}</strong> — fill details before receiving.
            </p>
            <div>
              <label className="erpnext-label">Name *</label>
              <input className="erpnext-input" value={cmName} onChange={e => setCmName(e.target.value)} placeholder="Brake pad set" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="erpnext-label">Pack type</label>
                <select className="erpnext-input" value={cmPack} onChange={e => setCmPack(e.target.value)}>
                  <option value="loose">Loose</option>
                  <option value="packed">Packed</option>
                </select>
              </div>
              <div>
                <label className="erpnext-label">Control</label>
                <select className="erpnext-input" value={cmControl} onChange={e => setCmControl(e.target.value)}>
                  <option value="item_controlled">Item controlled</option>
                  <option value="bin_controlled">Bin controlled</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="erpnext-btn-primary flex-1" onClick={saveCompleteMaster}>Save & continue</button>
              <button className="erpnext-btn-secondary" onClick={() => setCompleteMaster(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>GRN (Inward)</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Receive goods against purchase orders</p>
        </div>
        <div className="flex gap-3 items-end">
          <div style={{ minWidth: 180 }}>
            <label className="erpnext-label">Warehouse</label>
            <select className="erpnext-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>{w.code}</option>
              ))}
            </select>
          </div>
          <button onClick={() => { setScanTarget('carton'); setShowScanner(true) }} className="erpnext-btn-secondary">
            📷 Scan
          </button>
          <button onClick={createBlankSession} disabled={loading} className="erpnext-btn-secondary">
            + Blank Session
          </button>
        </div>
      </div>

      {/* Success/Error Message */}
      {msg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{ 
          background: 'rgba(22,163,74,0.06)', 
          border: '1px solid rgba(22,163,74,0.2)', 
          color: 'var(--green)' 
        }}>
          <span>✓</span>
          {msg}
        </div>
      )}

      {!session ? (
        <>
          {/* PO Selection */}
          {pos.length > 0 && (
            <div className="erpnext-card">
              <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-lg font-semibold">Select PO to Receive</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Choose a purchase order to start receiving</p>
              </div>
              <div className="p-4">
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr style={{ background: 'var(--panel-2)' }}>
                      <th>PO No</th>
                      <th>Supplier</th>
                      <th>Status</th>
                      <th className="text-right">Items</th>
                      <th className="text-right">Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pos.map((po: any) => (
                      <tr key={po.id} className="hover:opacity-90">
                        <td className="font-medium" style={{ color: 'var(--accent)' }}>{po.name}</td>
                        <td>{po.supplier_name}</td>
                        <td>{statusBadge(po.status)}</td>
                        <td className="text-right">{po.total_qty}</td>
                        <td className="text-right font-medium">{po.grand_total?.toFixed(2) || '0.00'}</td>
                        <td>
                          <button onClick={() => createSessionFromPO(po)} disabled={loading} className="erpnext-btn-primary text-xs">
                            {loading ? '...' : 'Start Receiving'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Existing Sessions */}
          <div className="erpnext-card">
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-semibold">Existing GRN Sessions</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Continue or review previous receiving sessions</p>
            </div>
            <div className="p-4">
              <table className="erpnext-table">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Session No</th>
                    <th>Supplier</th>
                    <th>PO</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s: any) => (
                    <tr key={s.id} className="hover:opacity-90">
                      <td className="font-medium" style={{ color: 'var(--accent)' }}>{s.session_no}</td>
                      <td>{s.supplier || '-'}</td>
                      <td>{s.purchase_receipt_no || '-'}</td>
                      <td>{statusBadge(s.status)}</td>
                      <td>{new Date(s.created_at).toLocaleDateString()}</td>
                      <td>
                        <button onClick={() => openSession(s.id)} className="erpnext-btn-secondary text-xs">Open</button>
                      </td>
                    </tr>
                  ))}
                  {sessions.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12" style={{ color: 'var(--text-dim)' }}>No sessions yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Putaway Section - Collapsible */}
          <div className="erpnext-card">
            <button 
              onClick={() => setShowPutaway(!showPutaway)}
              className="w-full px-6 py-4 flex items-center justify-between"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <div className="text-left">
                <h2 className="text-lg font-semibold">Putaway (Move to Storage)</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Move received items to warehouse locations</p>
              </div>
              <span style={{ transform: showPutaway ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: 12 }}>▶</span>
            </button>
            {showPutaway && (
              <div className="px-6 pb-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <label className="erpnext-label">Item Code</label>
                    <input className="erpnext-input" value={putawayItem} onChange={e => setPutawayItem(e.target.value)} placeholder="ITEM-001" />
                  </div>
                  <div>
                    <label className="erpnext-label">Quantity</label>
                    <input className="erpnext-input" type="number" value={putawayQty} onChange={e => setPutawayQty(e.target.value)} />
                  </div>
                  <div>
                    <label className="erpnext-label">Source Warehouse</label>
                    <input className="erpnext-input" value={putawaySource} onChange={e => setPutawaySource(e.target.value)} />
                  </div>
                  <div>
                    <label className="erpnext-label">Target Location</label>
                    <input className="erpnext-input" value={putawayTarget} onChange={e => setPutawayTarget(e.target.value)} placeholder="RACK-A-01" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={doPutaway} className="erpnext-btn-primary w-full">Putaway</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Active Session Header */}
          <div className="erpnext-card">
            <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-lg font-semibold">{session.session_no}</h2>
                {selectedPO && (
                  <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
                    Receiving against {selectedPO.name} — {selectedPO.supplier_name}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={closeSession} className="erpnext-btn-primary">Close Session</button>
                <button onClick={() => { setSession(null); setSelectedPO(null) }} className="erpnext-btn-secondary">← Back</button>
              </div>
            </div>

            {/* PO Items Reference */}
            {selectedPO && selectedPO.items && selectedPO.items.length > 0 && (
              <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-3">Expected Items from PO</h3>
                <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                  <table className="erpnext-table text-sm">
                    <thead>
                      <tr style={{ background: 'var(--panel-2)' }}>
                        <th>Item</th>
                        <th>Name</th>
                        <th className="text-right">Ordered</th>
                        <th className="text-right">Received</th>
                        <th className="text-right">Pending</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPO.items.map((pi: any) => (
                        <tr key={pi.id}>
                          <td className="font-medium">{pi.item_code}</td>
                          <td>{pi.item_name}</td>
                          <td className="text-right">{pi.qty}</td>
                          <td className="text-right">{pi.received_qty || 0}</td>
                          <td className="text-right font-medium">{pi.qty - (pi.received_qty || 0)}</td>
                          <td>
                            <button onClick={() => fillFromPOItem(pi)} className="erpnext-btn-secondary text-xs">Fill</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Scan Forms */}
            <div className="p-6 space-y-6">
              {/* Carton Scan */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Scan Carton</h3>
                <div className="flex gap-3">
                  <input 
                    className="erpnext-input flex-1" 
                    value={cartonNo} 
                    onChange={e => setCartonNo(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && addCarton()} 
                    placeholder="Enter carton number..." 
                  />
                  <button onClick={addCarton} className="erpnext-btn-primary">Add Carton</button>
                </div>
              </div>

              {/* Line Scan */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Scan Line</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="erpnext-label">Item Code</label>
                    <div className="flex gap-2">
                      <input className="erpnext-input" value={item} onChange={e => setItem(e.target.value)} placeholder="ITEM-001" />
                      <button onClick={() => { setScanTarget('item'); setShowScanner(true) }} className="erpnext-btn-secondary">📷</button>
                    </div>
                  </div>
                  <div>
                    <label className="erpnext-label">Expected Qty</label>
                    <input className="erpnext-input" type="number" value={exp} onChange={e => setExp(e.target.value)} />
                  </div>
                  <div>
                    <label className="erpnext-label">Scanned Qty</label>
                    <input className="erpnext-input" type="number" value={scan} onChange={e => setScan(e.target.value)} />
                  </div>
                  <div>
                    <label className="erpnext-label">Damaged Qty</label>
                    <input className="erpnext-input" type="number" value={damagedQty} onChange={e => setDamagedQty(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className="erpnext-label">Batch No</label>
                    <input className="erpnext-input" value={batch} onChange={e => setBatch(e.target.value)} />
                  </div>
                  <div>
                    <label className="erpnext-label">Notes</label>
                    <input className="erpnext-input" value={lineNotes} onChange={e => setLineNotes(e.target.value)} placeholder="Shortage reason…" />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input type="checkbox" id="reqQi" checked={requiresQI} onChange={e => setRequiresQI(e.target.checked)} className="w-4 h-4" />
                    <label htmlFor="reqQi" className="text-sm cursor-pointer">Requires QI (hold bay)</label>
                  </div>
                  <div className="flex items-end md:col-span-2">
                    <button onClick={addLine} className="erpnext-btn-primary w-full">Scan Line</button>
                  </div>
                </div>
                {exp && scan && (+scan !== +exp) && (
                  <div className="mt-3 text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                    Variance: scanned {scan} vs expected {exp} ({(+scan - +exp) > 0 ? '+' : ''}{(+scan - +exp)})
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Session Cartons + line variances */}
          {session.cartons && session.cartons.length > 0 && (
            <div className="erpnext-card">
              <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-lg font-semibold">Scanned Cartons & Lines</h2>
              </div>
              <div className="p-4 space-y-4">
                {session.cartons.map((c: any) => (
                  <div key={c.id}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium">{c.carton_no}</span>
                      <span className={`erpnext-badge ${c.status === 'accounted' ? 'erpnext-badge-green' : 'erpnext-badge-yellow'}`}>{c.status}</span>
                    </div>
                    {(c.lines?.length ?? 0) > 0 && (
                      <table className="erpnext-table text-sm">
                        <thead>
                          <tr style={{ background: 'var(--panel-2)' }}>
                            <th>Item</th>
                            <th className="text-right">Expected</th>
                            <th className="text-right">Scanned</th>
                            <th className="text-right">Damaged</th>
                            <th>Status</th>
                            <th>QI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.lines.map((l: any) => (
                            <tr key={l.id}>
                              <td className="font-medium" style={{ color: 'var(--accent)' }}>{l.item_code}</td>
                              <td className="text-right">{l.expected_qty ?? '—'}</td>
                              <td className="text-right">{l.scanned_qty ?? '—'}</td>
                              <td className="text-right">{l.damaged_qty || '—'}</td>
                              <td>
                                <span className={`erpnext-badge ${
                                  l.status === 'full_match' ? 'erpnext-badge-green'
                                    : l.status === 'shortage' || l.status === 'damage' ? 'erpnext-badge-red'
                                      : 'erpnext-badge-yellow'
                                }`}>{l.status}</span>
                              </td>
                              <td>{l.requires_qi ? 'yes' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="erpnext-card">
            <div className="p-6">
              <Comments entityType="grn_session" entityId={session.id} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
