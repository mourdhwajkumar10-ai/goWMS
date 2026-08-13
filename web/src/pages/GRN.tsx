import { useState, useEffect } from 'react'
import { api, getRole } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import CSVImport from '../components/CSVTools'
import { notify } from '../components/Notifications'
import ItemAutocomplete from '../components/ItemAutocomplete'

export default function GRN() {
  const role = (getRole() || '').toLowerCase()
  const isSupervisor = role === 'admin' || role === 'wm' || role === 'supervisor'
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
  const [scanTarget, setScanTarget] = useState<'carton' | 'item' | 'verify'>('carton')
  const [putawayItem, setPutawayItem] = useState('')
  const [putawayQty, setPutawayQty] = useState('')
  const [putawayTarget, setPutawayTarget] = useState('')
  const [putawaySource, setPutawaySource] = useState('INCOMING-01')
  const [showPutaway, setShowPutaway] = useState(false)
  const [confirmClose, setConfirmClose] = useState<any>(null)
  const [receivingMode, setReceivingMode] = useState<'packing_list' | 'invoice_only'>('packing_list')
  const [truckNo, setTruckNo] = useState('')
  const [driverName, setDriverName] = useState('')
  const [expectedBoxes, setExpectedBoxes] = useState('')
  const [invoiceNos, setInvoiceNos] = useState('')
  const [grnTab, setGrnTab] = useState<'overview' | 'boxes' | 'items' | 'exceptions' | 'audit' | 'activity'>('overview')
  const [boxSummary, setBoxSummary] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [exceptions, setExceptions] = useState<any[]>([])
  const [activeBox, setActiveBox] = useState<any>(null)
  const [verifyItemCode, setVerifyItemCode] = useState('')
  const [audits, setAudits] = useState<any[]>([])
  const [followUps, setFollowUps] = useState<any[]>([])
  const [podUploading, setPodUploading] = useState(false)
  const [resolveText, setResolveText] = useState<Record<number, string>>({})
  const [auditPhys, setAuditPhys] = useState<Record<number, string>>({})
  const [auditSample, setAuditSample] = useState(5)
  const [invExpectLines, setInvExpectLines] = useState<{ invoice_no: string; part_no: string; qty: string }[]>([
    { invoice_no: '', part_no: '', qty: '' },
  ])
  const [itemSummary, setItemSummary] = useState<any>(null)
  const STEPS = [
    { key: 'receiving', label: 'Truck / GRN' },
    { key: 'box_reconciliation', label: 'Box receiving' },
    { key: 'item_verification', label: 'Item verify' },
    { key: 'exception_pending', label: 'Exceptions' },
    { key: 'completed', label: 'Complete' },
  ]

  const stepIndex = (status?: string) => {
    const s = (status || 'receiving').toLowerCase()
    if (s === 'open' || s === 'draft' || s === 'receiving') return 0
    if (s === 'box_reconciliation') return 1
    if (s === 'item_verification') return 2
    if (s === 'exception_pending' || s === 'item_verification_complete') return 3
    if (s === 'closed' || s === 'completed' || s.includes('putaway')) return 4
    return 0
  }

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
    const openId = sessionStorage.getItem('gowms_open_grn')
    if (openId) {
      sessionStorage.removeItem('gowms_open_grn')
      setTimeout(() => openSession(+openId), 0)
    }
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
      receiving_mode: receivingMode,
      truck_no: truckNo || undefined,
      driver_name: driverName || undefined,
      expected_boxes: expectedBoxes ? +expectedBoxes : undefined,
      invoice_nos: invoiceNos || undefined,
    })
    setLoading(false)
    if (r.ok) {
      setSelectedPO(fullPO)
      setSession({ ...r.data, cartons: [], po_items: fullPO.items || [] })
      setGrnTab('boxes')
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
      receiving_mode: receivingMode,
      truck_no: truckNo || undefined,
      driver_name: driverName || undefined,
      expected_boxes: expectedBoxes ? +expectedBoxes : undefined,
      invoice_nos: invoiceNos || undefined,
    })
    setLoading(false)
    if (r.ok) {
      setSelectedPO(null)
      setSession({ ...r.data, cartons: [] })
      setGrnTab('boxes')
      loadSessions()
      notify({ type: 'success', title: 'GRN Session Created', message: r.data.session_no })
    }
  }

  const reloadSession = async (id: number) => {
    const r = await api.grnSession(id)
    if (r.ok) setSession(r.data)
    await refreshWorkspace(id)
  }

  const openSession = async (id: number) => {
    const r = await api.grnSession(id)
    if (!r.ok) {
      notify({ type: 'error', title: 'Session load failed', message: r.error || '' })
      return
    }
    setSession(r.data)
    setGrnTab('overview')
    refreshWorkspace(id)
    const poName = r.data.purchase_receipt_no
    if (poName) {
      const list = await api.poSearch(poName)
      if (list.ok && list.data?.[0]) {
        const detail = await api.poGet(list.data[0].id)
        if (detail.ok) setSelectedPO(detail.data)
      }
    }
  }

  const refreshWorkspace = async (id: number) => {
    const [sum, ev, ex, box, aud, fu, isum] = await Promise.all([
      api.grnBoxSummary(id),
      api.grnEvents(id),
      api.grnExceptions(id),
      api.grnActiveBox(id),
      api.grnAudits(id),
      api.grnFollowUps(id),
      api.grnItemSummary(id),
    ])
    if (sum.ok) setBoxSummary(sum.data)
    if (ev.ok) setEvents(ev.data ?? [])
    if (ex.ok) setExceptions(ex.data ?? [])
    if (box.ok) setActiveBox(box.data?.active ? box.data : null)
    if (aud.ok) setAudits(aud.data ?? [])
    if (fu.ok) setFollowUps(fu.data ?? [])
    if (isum.ok) setItemSummary(isum.data)
  }

  const openBoxForVerify = async () => {
    if (!session || !cartonNo.trim()) return
    const r = await api.grnOpenBox(session.id, { carton_no: cartonNo.trim() })
    if (r.ok) {
      setActiveBox(r.data)
      setCartonNo('')
      setGrnTab('items')
      notify({
        type: r.data.already_verified ? 'warning' : 'success',
        title: r.data.already_verified ? 'Already verified' : 'Box open',
        message: r.data.carton_no,
      })
      refreshWorkspace(session.id)
    } else {
      notify({ type: 'error', title: 'Open box failed', message: r.error || '' })
    }
  }

  const verifyScan = async () => {
    if (!session || !verifyItemCode.trim()) return
    const r = await api.grnVerifyItem(session.id, {
      item_code: verifyItemCode.trim(),
      qty: +(scan || 1) || 1,
      carton_id: activeBox?.id,
    })
    if (!r.ok) {
      notify({ type: 'error', title: 'Verify failed', message: r.error || '' })
      return
    }
    if (r.data.wrong_item) {
      notify({ type: 'warning', title: 'Wrong item', message: r.data.message })
    } else if (r.data.box_auto_closed) {
      notify({ type: 'success', title: 'Box auto-closed', message: r.data.box_message })
      setActiveBox(null)
    } else {
      notify({ type: 'success', title: 'Item scanned', message: `${r.data.item_code} → ${r.data.scanned_qty}/${r.data.expected_qty}` })
      if (r.data.lines) setActiveBox((prev: any) => prev ? { ...prev, lines: r.data.lines } : prev)
    }
    setVerifyItemCode('')
    setScan('1')
    reloadSession(session.id)
  }

  const uploadPOD = async (file: File | null) => {
    if (!file || !session) return
    setPodUploading(true)
    const up = await api.attachmentUpload('grn', session.id, file)
    if (!up.ok) {
      setPodUploading(false)
      notify({ type: 'error', title: 'POD upload failed', message: up.error || '' })
      return
    }
    const r = await api.grnAttachPOD(session.id, up.data.id)
    setPodUploading(false)
    if (r.ok) {
      notify({ type: 'success', title: 'POD attached', message: file.name })
      reloadSession(session.id)
    } else {
      notify({ type: 'error', title: 'POD link failed', message: r.error || '' })
    }
  }

  const resolveExc = async (excId: number) => {
    const resolution = resolveText[excId] || 'Resolved'
    const r = await api.grnResolveException(excId, { resolution })
    if (r.ok) {
      notify({ type: 'success', title: 'Exception resolved', message: `#${excId}` })
      if (session) refreshWorkspace(session.id)
    } else {
      notify({ type: 'error', title: 'Resolve failed', message: r.error || '' })
    }
  }

  const startAudit = async () => {
    if (!session) return
    const r = await api.grnStartAudit(session.id, auditSample)
    if (r.ok) {
      notify({ type: 'success', title: 'Audit started', message: `${r.data.sample_size} items` })
      setGrnTab('audit')
      refreshWorkspace(session.id)
    } else {
      notify({ type: 'error', title: 'Audit failed', message: r.error || '' })
    }
  }

  const seedInvoiceExpected = async () => {
    if (!session) return
    const lines = invExpectLines
      .filter(l => l.part_no.trim() && +l.qty > 0)
      .map(l => ({
        invoice_no: l.invoice_no.trim() || invoiceNos.split(',')[0]?.trim() || 'INV',
        part_no: l.part_no.trim(),
        qty: +l.qty,
      }))
    if (lines.length === 0) {
      notify({ type: 'warning', title: 'Add lines', message: 'Part + qty required' })
      return
    }
    const r = await api.grnSeedInvoiceExpected(session.id, lines)
    if (r.ok) {
      notify({ type: 'success', title: 'Invoice expected seeded', message: `${r.data.created} created` })
      setInvExpectLines([{ invoice_no: '', part_no: '', qty: '' }])
      reloadSession(session.id)
    } else {
      notify({ type: 'error', title: 'Seed failed', message: r.error || '' })
    }
  }

  const completeVerification = async () => {
    if (!session) return
    const r = await api.grnCompleteVerification(session.id)
    if (r.ok) {
      notify({
        type: r.data.open_exceptions > 0 ? 'warning' : 'success',
        title: 'Item verification complete',
        message: r.data.open_exceptions > 0
          ? `${r.data.open_exceptions} open exceptions — resolve before finalize`
          : 'Ready to finalize',
      })
      await reloadSession(session.id)
      if (r.data.open_exceptions > 0) setGrnTab('exceptions')
    } else {
      notify({ type: 'error', title: 'Complete verify failed', message: r.error || '' })
    }
  }

  const finalizeSession = async (force = false) => {
    if (!session) return
    if (!window.confirm(force
      ? 'Force finalize with open exceptions and post staging stock?'
      : 'Finalize GRN, post staging stock, and mark completed? (Put-away deferred)')) return
    const r = await api.grnFinalize(session.id, force)
    if (r.ok) {
      const s = r.data.summary || {}
      const items = s.items || {}
      setConfirmClose({
        sessionNo: session.session_no,
        sle: r.data.posted?.sle_count ?? r.data.posted?.items_posted ?? 0,
        po: r.data.posted?.po || {},
        postedIncoming: r.data.posted?.posted_incoming,
        postedHold: r.data.posted?.posted_hold,
        postedDamaged: r.data.posted?.posted_damaged,
        qiCreated: r.data.posted?.qi_created,
        variances: r.data.posted?.variances || [],
        putawayReady: r.data.posted?.putaway_ready,
        summary: s,
        items,
        status: 'completed',
      })
      setSession(null)
      setSelectedPO(null)
      loadSessions()
      loadPOs()
      notify({ type: 'success', title: 'GRN completed', message: session.session_no })
    } else {
      notify({ type: 'error', title: 'Finalize failed', message: r.error || '' })
    }
  }

  const checkAudit = async (itemId: number) => {
    const qty = +(auditPhys[itemId] ?? '')
    if (Number.isNaN(qty)) return
    const r = await api.grnCheckAuditItem(itemId, { physical_qty: qty })
    if (r.ok) {
      notify({
        type: r.data.result === 'pass' ? 'success' : 'warning',
        title: r.data.result === 'pass' ? 'Audit PASS' : 'Audit FAIL',
        message: `System ${r.data.system_qty} / Physical ${r.data.physical_qty}`,
      })
      if (session) refreshWorkspace(session.id)
    }
  }

  const createFollowUp = async () => {
    if (!session) return
    const r = await api.grnCreateFollowUp(session.id)
    if (r.ok) {
      notify({ type: 'success', title: 'Follow-up created', message: r.data.session_no })
      openSession(r.data.id)
    } else {
      notify({ type: 'error', title: 'Follow-up failed', message: r.error || '' })
    }
  }

  const addCarton = async () => {
    if (!cartonNo) return
    const r = await api.grnScanCarton({ grn_session_id: session.id, carton_no: cartonNo })
    if (r.ok) {
      const msgText = r.data?.message || r.data?.status
      notify({
        type: r.data?.excess || r.data?.duplicate ? 'warning' : 'success',
        title: r.data?.duplicate ? 'Duplicate box' : r.data?.excess ? 'Excess box' : 'Box received',
        message: `${cartonNo} · ${msgText}`,
      })
      setMsg(`Carton ${cartonNo} scanned`)
      setCartonNo('')
      reloadSession(session.id)
    } else {
      notify({ type: 'error', title: 'Carton scan failed', message: r.error || '' })
    }
  }

  const finishBoxReceiving = async () => {
    if (!session) return
    const r = await api.grnCompleteBoxReceiving(session.id)
    if (r.ok) {
      notify({ type: 'success', title: 'Box reconciliation', message: 'Missing expected boxes marked' })
      await reloadSession(session.id)
      setGrnTab('boxes')
    } else {
      notify({ type: 'error', title: 'Failed', message: r.error || '' })
    }
  }

  const startItemVerify = async () => {
    if (!session) return
    const r = await api.grnAdvance(session.id, 'item_verification')
    if (r.ok) {
      notify({ type: 'success', title: 'Item verification', message: 'Ready to scan items' })
      await reloadSession(session.id)
      setGrnTab('items')
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
      reloadSession(session.id)
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
    else if (scanTarget === 'verify') setVerifyItemCode(code)
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
            <h2 className="text-xl font-semibold">GRN completed</h2>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              Session <strong>{confirmClose.sessionNo}</strong> is {confirmClose.status || 'closed'}. Stock is in staging (put-away deferred).
            </p>
            {confirmClose.summary && (
              <ul className="text-sm space-y-1 mb-2">
                <li>Boxes — expected {confirmClose.summary.boxes_expected} · received {confirmClose.summary.boxes_received} · missing {confirmClose.summary.boxes_missing} · excess {confirmClose.summary.boxes_excess}</li>
                <li>Items — expected {confirmClose.items?.expected_qty} · received {confirmClose.items?.received_qty} · short {confirmClose.items?.short_qty} · excess {confirmClose.items?.excess_qty}</li>
                <li>Exceptions — open {confirmClose.items?.exceptions_open} · resolved {confirmClose.items?.exceptions_resolved}</li>
                <li>Audit: {confirmClose.items?.audit_status || 'none'} · Put-away: deferred</li>
              </ul>
            )}
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

      {!session && (
        <div className="erpnext-card p-4">
          <div className="text-sm font-medium mb-3">Truck arrival / receiving options</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="erpnext-label">Mode</label>
              <select className="erpnext-input" value={receivingMode} onChange={e => setReceivingMode(e.target.value as any)}>
                <option value="packing_list">Packing list</option>
                <option value="invoice_only">Invoice only</option>
              </select>
            </div>
            <div>
              <label className="erpnext-label">Truck no</label>
              <input className="erpnext-input" value={truckNo} onChange={e => setTruckNo(e.target.value)} placeholder="MH-12-AB-1234" />
            </div>
            <div>
              <label className="erpnext-label">Driver</label>
              <input className="erpnext-input" value={driverName} onChange={e => setDriverName(e.target.value)} />
            </div>
            <div>
              <label className="erpnext-label">Expected boxes</label>
              <input className="erpnext-input" type="number" value={expectedBoxes} onChange={e => setExpectedBoxes(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="erpnext-label">Invoice nos</label>
              <input className="erpnext-input" value={invoiceNos} onChange={e => setInvoiceNos(e.target.value)} placeholder="INV-001, INV-002" />
            </div>
          </div>
        </div>
      )}

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
              <div className="flex gap-3 flex-wrap">
                <button onClick={completeVerification} className="erpnext-btn-secondary">Complete verify</button>
                {isSupervisor && (
                  <>
                    <button onClick={() => finalizeSession(false)} className="erpnext-btn-primary">Finalize GRN</button>
                    <button onClick={() => finalizeSession(true)} className="erpnext-btn-secondary text-xs">Force finalize</button>
                  </>
                )}
                <button onClick={() => { setSession(null); setSelectedPO(null) }} className="erpnext-btn-secondary">← Back</button>
              </div>
            </div>

            {/* Progress stepper */}
            <div className="px-6 py-3 border-b flex flex-wrap gap-2 items-center" style={{ borderColor: 'var(--border)' }}>
              {STEPS.map((st, i) => {
                const cur = stepIndex(session.status)
                const done = i < cur
                const active = i === cur
                return (
                  <div key={st.key} className="flex items-center gap-2 text-xs">
                    <span
                      className="erpnext-badge"
                      style={{
                        background: done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--panel-2)',
                        color: done || active ? '#fff' : 'var(--text-dim)',
                      }}
                    >
                      {i + 1}. {st.label}
                    </span>
                    {i < STEPS.length - 1 && <span style={{ color: 'var(--text-dim)' }}>→</span>}
                  </div>
                )
              })}
              <span className="text-xs ml-auto" style={{ color: 'var(--text-dim)' }}>
                Mode: {session.receiving_mode || 'packing_list'}
                {session.truck_no ? ` · Truck ${session.truck_no}` : ''}
              </span>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-3 flex gap-2 flex-wrap border-b" style={{ borderColor: 'var(--border)' }}>
              {(['overview', 'boxes', 'items', ...(isSupervisor ? ['exceptions', 'audit', 'activity'] as const : [])] as const).map(t => (
                <button
                  key={t}
                  className={`erpnext-btn-secondary text-xs ${grnTab === t ? 'erpnext-btn-primary' : ''}`}
                  onClick={() => { setGrnTab(t); if (session?.id) refreshWorkspace(session.id) }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {grnTab === 'overview' && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><div style={{ color: 'var(--text-dim)' }}>Status</div><div className="font-medium">{session.status}</div></div>
                  <div><div style={{ color: 'var(--text-dim)' }}>Supplier</div><div className="font-medium">{session.supplier_name || '—'}</div></div>
                  <div><div style={{ color: 'var(--text-dim)' }}>Expected boxes</div><div className="font-medium">{boxSummary?.expected_boxes ?? session.expected_boxes ?? '—'}</div></div>
                  <div><div style={{ color: 'var(--text-dim)' }}>Received boxes</div><div className="font-medium">{boxSummary?.received_boxes ?? '—'}</div></div>
                  <div><div style={{ color: 'var(--text-dim)' }}>Missing</div><div className="font-medium">{boxSummary?.missing_boxes ?? '—'}</div></div>
                  <div><div style={{ color: 'var(--text-dim)' }}>Excess</div><div className="font-medium">{boxSummary?.excess_boxes ?? '—'}</div></div>
                  <div><div style={{ color: 'var(--text-dim)' }}>Exceptions</div><div className="font-medium">{exceptions.length}</div></div>
                  <div><div style={{ color: 'var(--text-dim)' }}>Follow-ups</div><div className="font-medium">{followUps.length}</div></div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button className="erpnext-btn-secondary text-xs" onClick={finishBoxReceiving}>Complete box receiving</button>
                  <button className="erpnext-btn-primary text-xs" onClick={startItemVerify}>Start item verify</button>
                  <button className="erpnext-btn-secondary text-xs" onClick={completeVerification}>Complete item verify</button>
                  {isSupervisor && (
                    <>
                      <button className="erpnext-btn-secondary text-xs" onClick={startAudit}>Start physical audit</button>
                      <button className="erpnext-btn-secondary text-xs" onClick={createFollowUp}>Create follow-up GRN</button>
                      <button className="erpnext-btn-primary text-xs" onClick={() => finalizeSession(false)}>Finalize</button>
                    </>
                  )}
                  <label className="erpnext-btn-secondary text-xs" style={{ cursor: 'pointer' }}>
                    {podUploading ? 'Uploading POD…' : session.pod_attachment_id ? 'Replace POD' : 'Upload POD'}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      style={{ display: 'none' }}
                      disabled={podUploading}
                      onChange={e => { uploadPOD(e.target.files?.[0] ?? null); e.target.value = '' }}
                    />
                  </label>
                  {session.pod_attachment_id ? (
                    <a className="text-xs" style={{ color: 'var(--accent)' }} href={api.attachmentUrl(session.pod_attachment_id)} target="_blank" rel="noreferrer">
                      View POD #{session.pod_attachment_id}
                    </a>
                  ) : null}
                </div>
                {itemSummary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-2">
                    <div><div style={{ color: 'var(--text-dim)' }}>Items expected</div><div className="font-medium">{itemSummary.expected_qty}</div></div>
                    <div><div style={{ color: 'var(--text-dim)' }}>Items scanned</div><div className="font-medium">{itemSummary.received_qty}</div></div>
                    <div><div style={{ color: 'var(--text-dim)' }}>Short</div><div className="font-medium">{itemSummary.short_qty}</div></div>
                    <div><div style={{ color: 'var(--text-dim)' }}>Excess</div><div className="font-medium">{itemSummary.excess_qty}</div></div>
                    <div><div style={{ color: 'var(--text-dim)' }}>Open exceptions</div><div className="font-medium">{itemSummary.exceptions_open}</div></div>
                    <div><div style={{ color: 'var(--text-dim)' }}>Audit</div><div className="font-medium">{itemSummary.audit_status}</div></div>
                    <div><div style={{ color: 'var(--text-dim)' }}>Put-away</div><div className="font-medium">{itemSummary.putaway_status || 'pending'}</div></div>
                  </div>
                )}
                {followUps.length > 0 && (
                  <div className="text-sm">
                    <div className="font-medium mb-1">Follow-up sessions</div>
                    <ul className="space-y-1">
                      {followUps.map((f: any) => (
                        <li key={f.id}>
                          <button className="text-xs" style={{ color: 'var(--accent)' }} onClick={() => openSession(f.id)}>
                            {f.session_no || `GRN #${f.id}`} · {f.status}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {grnTab === 'exceptions' && (
              <div className="p-6">
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr style={{ background: 'var(--panel-2)' }}>
                      <th>Type</th><th>Box</th><th>Part</th><th>Expected</th><th>Scanned</th><th>Status</th><th>When</th><th>Resolve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map((ex: any) => (
                      <tr key={ex.id}>
                        <td>{ex.exception_type}</td>
                        <td>{ex.box_no || '—'}</td>
                        <td>{ex.part_no || '—'}</td>
                        <td>{ex.expected_qty ?? '—'}</td>
                        <td>{ex.scanned_qty ?? '—'}</td>
                        <td>{ex.status}</td>
                        <td>{ex.created_at?.slice(0, 19)}</td>
                        <td>
                          {ex.status === 'open' || ex.status === 'pending' ? (
                            <div className="flex gap-1 items-center">
                              <input
                                className="erpnext-input text-xs"
                                style={{ minWidth: 120 }}
                                placeholder="Resolution…"
                                value={resolveText[ex.id] || ''}
                                onChange={e => setResolveText(prev => ({ ...prev, [ex.id]: e.target.value }))}
                              />
                              <button className="erpnext-btn-secondary text-xs" onClick={() => resolveExc(ex.id)}>Resolve</button>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-dim)' }}>{ex.resolution || '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {exceptions.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No exceptions</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {grnTab === 'audit' && isSupervisor && (
              <div className="p-6 space-y-4">
                <div className="flex gap-2 items-end flex-wrap">
                  <div>
                    <label className="erpnext-label">Sample size</label>
                    <select className="erpnext-input" value={auditSample} onChange={e => setAuditSample(+e.target.value)}>
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>Custom 50</option>
                    </select>
                  </div>
                  <button className="erpnext-btn-primary text-xs" onClick={startAudit}>Start audit</button>
                </div>
                {audits.map((a: any) => (
                  <div key={a.id} className="rounded-lg p-4" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3 mb-3 text-sm">
                      <span className="font-medium">Audit #{a.id}</span>
                      <span className="erpnext-badge">{a.status}</span>
                      <span style={{ color: 'var(--text-dim)' }}>{a.checked}/{a.sample_size} checked</span>
                      {a.status !== 'completed' && (
                        <button
                          className="erpnext-btn-secondary text-xs ml-auto"
                          onClick={async () => {
                            const r = await api.grnCompleteAudit(session.id, a.id)
                            if (r.ok) {
                              notify({ type: 'success', title: 'Audit completed', message: `#${a.id}` })
                              refreshWorkspace(session.id)
                            } else {
                              notify({ type: 'error', title: 'Complete failed', message: r.error || '' })
                            }
                          }}
                        >
                          Complete audit
                        </button>
                      )}
                    </div>
                    <table className="erpnext-table text-sm">
                      <thead>
                        <tr style={{ background: 'var(--panel-2)' }}>
                          <th>Part</th><th className="text-right">System</th><th className="text-right">Physical</th><th>Result</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(a.items || []).map((it: any) => (
                          <tr key={it.id}>
                            <td className="font-medium">{it.part_no}</td>
                            <td className="text-right">{it.system_qty}</td>
                            <td className="text-right">
                              {it.result ? (it.physical_qty ?? '—') : (
                                <input
                                  className="erpnext-input text-xs text-right"
                                  style={{ width: 80 }}
                                  type="number"
                                  value={auditPhys[it.id] ?? ''}
                                  onChange={e => setAuditPhys(prev => ({ ...prev, [it.id]: e.target.value }))}
                                />
                              )}
                            </td>
                            <td>{it.result || '—'}</td>
                            <td>
                              {!it.result && (
                                <button className="erpnext-btn-secondary text-xs" onClick={() => checkAudit(it.id)}>Check</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                {audits.length === 0 && (
                  <div className="text-sm py-6 text-center" style={{ color: 'var(--text-dim)' }}>No audits yet</div>
                )}
              </div>
            )}

            {grnTab === 'activity' && (
              <div className="p-6">
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr style={{ background: 'var(--panel-2)' }}>
                      <th>Time</th><th>Event</th><th>Box</th><th>Part</th><th>Result</th><th>User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev: any) => (
                      <tr key={ev.id}>
                        <td className="whitespace-nowrap">{ev.created_at?.slice(0, 19)}</td>
                        <td className="font-medium">{ev.event_type}</td>
                        <td>{ev.box_no || '—'}</td>
                        <td>{ev.part_no || '—'}</td>
                        <td>{ev.result || '—'}</td>
                        <td>{ev.actor_name || '—'}</td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No events yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

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

            {/* Scan Forms — boxes + items tabs focus here */}
            {(grnTab === 'boxes' || grnTab === 'items' || grnTab === 'overview') && (
            <div className="p-6 space-y-6">
              {/* Packing List Import */}
              {(grnTab === 'boxes' || grnTab === 'overview') && (
              <div>
                <h3 className="text-sm font-semibold mb-3">Import Packing List</h3>
                <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
                  CSV/XLSX creates expected boxes + pending lines (not auto-verified). Then scan boxes to mark received.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <CSVImport onImport={async (rows) => {
                    const r = await api.packingListImport({ grn_session_id: session.id, rows })
                    if (r.ok) {
                      notify({
                        type: 'success',
                        title: 'Packing list imported',
                        message: `${r.data.cartons_created} cartons, ${r.data.lines_created} lines`,
                      })
                      const refreshed = await api.grnSession(session.id)
                      if (refreshed.ok) setSession(refreshed.data)
                    } else {
                      notify({ type: 'error', title: 'Import failed', message: r.error || '' })
                    }
                  }} />
                  <label className="erpnext-btn-secondary text-sm" style={{ cursor: 'pointer' }}>
                    📊 Import XLSX
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file || !session) return
                        const fd = new FormData()
                        fd.append('file', file)
                        fd.append('grn_session_id', String(session.id))
                        const token = localStorage.getItem('gowms_token')
                        const res = await fetch('/api/packing-list/import-xlsx', {
                          method: 'POST',
                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                          body: fd,
                        })
                        const payload = await res.json().catch(() => ({}))
                        if (res.ok && payload.ok) {
                          notify({
                            type: 'success',
                            title: 'XLSX imported',
                            message: `${payload.data.cartons_created} cartons, ${payload.data.lines_created} lines`,
                          })
                          const refreshed = await api.grnSession(session.id)
                          if (refreshed.ok) setSession(refreshed.data)
                        } else {
                          notify({ type: 'error', title: 'XLSX failed', message: payload.error || 'Import failed' })
                        }
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
              )}

              {/* Carton Scan */}
              {(grnTab === 'boxes' || grnTab === 'overview') && (
              <div>
                <h3 className="text-sm font-semibold mb-3">Scan Carton / Box</h3>
                <div className="flex gap-3">
                  <input 
                    className="erpnext-input flex-1" 
                    value={cartonNo} 
                    onChange={e => setCartonNo(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && addCarton()} 
                    placeholder="Enter carton number..." 
                  />
                  <button onClick={addCarton} className="erpnext-btn-primary">Receive Box</button>
                  <button onClick={finishBoxReceiving} className="erpnext-btn-secondary">Finish boxes</button>
                </div>
                {(boxSummary?.boxes?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Box reconciliation</h4>
                    <table className="erpnext-table text-sm">
                      <thead>
                        <tr style={{ background: 'var(--panel-2)' }}>
                          <th>Box</th><th>Status</th><th>Expected?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boxSummary.boxes.map((b: any) => (
                          <tr key={b.id}>
                            <td className="font-medium">{b.carton_no}</td>
                            <td>{b.status}</td>
                            <td>{b.is_expected ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )}

              {/* Invoice-only expected seeding */}
              {(grnTab === 'items' || grnTab === 'overview') && (session.receiving_mode === 'invoice_only') && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Invoice expected items</h3>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
                    Seed consolidated part/qty from invoices before scanning.
                  </p>
                  <div className="space-y-2">
                    {invExpectLines.map((ln, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-2">
                        <input className="erpnext-input" placeholder="Invoice" value={ln.invoice_no}
                          onChange={e => setInvExpectLines(rows => rows.map((r, i) => i === idx ? { ...r, invoice_no: e.target.value } : r))} />
                        <input className="erpnext-input" placeholder="Part no" value={ln.part_no}
                          onChange={e => setInvExpectLines(rows => rows.map((r, i) => i === idx ? { ...r, part_no: e.target.value } : r))} />
                        <input className="erpnext-input" type="number" placeholder="Qty" value={ln.qty}
                          onChange={e => setInvExpectLines(rows => rows.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))} />
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button className="erpnext-btn-secondary text-xs" onClick={() => setInvExpectLines(r => [...r, { invoice_no: '', part_no: '', qty: '' }])}>+ Row</button>
                      <button className="erpnext-btn-primary text-xs" onClick={seedInvoiceExpected}>Seed expected</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Item verify (packing-list: open box → scan items) */}
              {(grnTab === 'items' || grnTab === 'overview') && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-3">Open box for verify</h3>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
                    Scan a received carton to load expected packing-list lines, then scan items. Clean boxes auto-close.
                  </p>
                  <div className="flex gap-3">
                    <input
                      className="erpnext-input flex-1"
                      value={cartonNo}
                      onChange={e => setCartonNo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && openBoxForVerify()}
                      placeholder="Carton / box number…"
                    />
                    <button onClick={openBoxForVerify} className="erpnext-btn-primary">Open box</button>
                  </div>
                </div>

                {activeBox && (
                  <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--panel-2)' }}>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">Active: {activeBox.carton_no}</span>
                      <span className="erpnext-badge">{activeBox.status}</span>
                      <button
                        className="erpnext-btn-secondary text-xs ml-auto"
                        onClick={async () => {
                          const reason = window.prompt('Force-close reason (shortages)?', 'shortage') || 'shortage'
                          const r = await api.grnCloseBox(session.id, { carton_id: activeBox.id, reason })
                          if (r.ok) {
                            notify({ type: 'warning', title: 'Box force-closed', message: activeBox.carton_no })
                            setActiveBox(null)
                            reloadSession(session.id)
                          } else {
                            notify({ type: 'error', title: 'Close failed', message: r.error || '' })
                          }
                        }}
                      >
                        Force close
                      </button>
                    </div>
                    {(activeBox.lines?.length ?? 0) > 0 && (
                      <table className="erpnext-table text-sm">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th className="text-right">Expected</th>
                            <th className="text-right">Scanned</th>
                            <th className="text-right">Left</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeBox.lines.map((l: any) => (
                            <tr key={l.id}>
                              <td className="font-medium">{l.item_code}</td>
                              <td className="text-right">{l.expected_qty}</td>
                              <td className="text-right">{l.scanned_qty}</td>
                              <td className="text-right">{l.remaining ?? (l.expected_qty - l.scanned_qty)}</td>
                              <td>{l.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className="erpnext-label">Scan item</label>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <ItemAutocomplete
                              value={verifyItemCode}
                              onSelect={(found) => setVerifyItemCode(found.code)}
                              onChangeText={setVerifyItemCode}
                              placeholder="Scan / type item code"
                              className="erpnext-input"
                            />
                          </div>
                          <button onClick={() => { setScanTarget('verify'); setShowScanner(true) }} className="erpnext-btn-secondary">📷</button>
                        </div>
                      </div>
                      <div>
                        <label className="erpnext-label">Qty</label>
                        <div className="flex gap-2">
                          <input
                            className="erpnext-input"
                            type="number"
                            value={scan}
                            onChange={e => setScan(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); verifyScan() } }}
                          />
                          <button onClick={verifyScan} className="erpnext-btn-primary">Verify</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Manual / invoice-only line entry */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Manual line scan (invoice-only / ad-hoc)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="erpnext-label">Item Code</label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <ItemAutocomplete
                            value={item}
                            onSelect={(found) => setItem(found.code)}
                            onChangeText={setItem}
                            placeholder="ITEM-001"
                            className="erpnext-input"
                          />
                        </div>
                        <button onClick={() => { setScanTarget('item'); setShowScanner(true) }} className="erpnext-btn-secondary">📷</button>
                      </div>
                    </div>
                    <div>
                      <label className="erpnext-label">Expected Qty</label>
                      <input className="erpnext-input" type="number" value={exp} onChange={e => setExp(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Scanned Qty</label>
                      <input
                        className="erpnext-input"
                        type="number"
                        value={scan}
                        onChange={e => setScan(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLine() } }}
                      />
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
              )}
            </div>
            )}
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
