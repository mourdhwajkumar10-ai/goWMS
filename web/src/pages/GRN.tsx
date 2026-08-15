import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, getRole } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import CSVImport from '../components/CSVTools'
import { notify } from '../components/Notifications'
import ItemAutocomplete from '../components/ItemAutocomplete'
import TruckAutocomplete from '../components/TruckAutocomplete'
import BoxAutocomplete from '../components/BoxAutocomplete'
import { lookupItemName, rememberItemName, rememberItems } from '../utils/itemNameCache'
import ProductMasterFields, { emptyProductForm, productPayload, type LocOpt } from '../components/ProductMasterFields'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

function nowLocalDatetime() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function specStatusLabel(status?: string) {
  const s = (status || '').toLowerCase().trim()
  const map: Record<string, string> = {
    open: 'RECEIVING',
    draft: 'DRAFT',
    receiving: 'RECEIVING',
    box_reconciliation: 'BOX_RECONCILIATION',
    item_verification: 'ITEM_VERIFICATION',
    exception_pending: 'EXCEPTION_PENDING',
    item_verification_complete: 'ITEM_VERIFICATION_COMPLETE',
    putaway_pending: 'PUTAWAY_PENDING',
    putaway_in_progress: 'PUTAWAY_IN_PROGRESS',
    closed: 'COMPLETED',
    completed: 'COMPLETED',
  }
  return map[s] || (status || 'RECEIVING').toUpperCase()
}

function exceptionNeedsPhoto(type?: string) {
  const t = String(type || '').toLowerCase()
  return t === 'contaminated' || t === 'internal_damage' || t === 'damage' || t === 'damaged'
}

function exceptionNeedsCOA(type?: string) {
  const t = String(type || '').toLowerCase()
  return t.includes('missing_coa') || (t.includes('coa') && t.includes('missing'))
}

function FileCapture({
  label, accept, capture, onFile, className,
}: {
  label: string
  accept: string
  capture?: boolean
  onFile: (f: File) => void
  className?: string
}) {
  return (
    <label className={className || 'erpnext-btn-secondary text-xs'} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
      {label}
      <input
        type="file"
        accept={accept}
        capture={capture ? 'environment' : undefined}
        className="hidden"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
    </label>
  )
}

function isInvalidBoxBarcode(raw: string) {
  const s = (raw || '').trim()
  if (!s || s.length > 80) return true
  return !/[A-Za-z0-9]/.test(s)
}

function daysUntil(dateStr: string): number | null {
  const s = (dateStr || '').trim()
  if (!s) return null
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

function shelfLifeThreshold(days?: number | null) {
  if (days && days > 0) return Math.max(7, Math.ceil(days * 0.1))
  return 30
}

const moneyFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function money(value?: number | string | null) {
  const n = typeof value === 'string' ? +value : value
  if (n == null || !Number.isFinite(n) || n === 0) return '—'
  return moneyFmt.format(n)
}

function poItemBatch(po: any, itemCode: string) {
  const want = (itemCode || '').trim().toUpperCase()
  const hit = (po?.items || []).find((p: any) => String(p.item_code || '').toUpperCase() === want)
  return String(hit?.batch_no || '').trim()
}

export default function GRN() {
  const navigate = useNavigate()
  const params = useParams()
  const role = (getRole() || '').toLowerCase()
  const isSupervisor = role === 'admin' || role === 'wm' || role === 'supervisor'
  const [sessions, setSessions] = useState<any[]>([])
  const [session, setSession] = useState<any>(null)
  const [pos, setPOs] = useState<any[]>([])
  const [selectedPO, setSelectedPO] = useState<any>(null)
  const [cartonNo, setCartonNo] = useState('')
  const [item, setItem] = useState('')
  const [exp, setExp] = useState('')
  const [scan, setScan] = useState('1')
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
  const [cmForm, setCmForm] = useState(emptyProductForm())
  const [cmLocations, setCmLocations] = useState<LocOpt[]>([])
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [scanTarget, setScanTarget] = useState<'carton' | 'item' | 'verify' | 'supplier'>('carton')
  const [confirmClose, setConfirmClose] = useState<any>(null)
  const [receivingMode, setReceivingMode] = useState<'packing_list' | 'invoice_only'>('packing_list')
  const [truckNo, setTruckNo] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [arrivalAt, setArrivalAt] = useState(nowLocalDatetime)
  const [expectedBoxes, setExpectedBoxes] = useState('')
  const [invoiceNos, setInvoiceNos] = useState('')
  const [dashFilter, setDashFilter] = useState<'all' | 'in_progress' | 'verify' | 'exceptions' | 'followups' | 'completed'>('all')
  const [otherExc, setOtherExc] = useState({ box_no: '', part_no: '', notes: '' })
  const [auditCustom, setAuditCustom] = useState('')
  const [grnTab, setGrnTab] = useState<'overview' | 'boxes' | 'items' | 'exceptions' | 'audit' | 'activity' | 'checks'>('overview')
  const [boxSummary, setBoxSummary] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [exceptions, setExceptions] = useState<any[]>([])
  const [activeBox, setActiveBox] = useState<any>(null)
  const [verifyItemCode, setVerifyItemCode] = useState('')
  const [scanConfirm, setScanConfirm] = useState<null | {
    kind: 'verify' | 'carton'
    raw: string
    itemCode: string
    qty: number
    isCasePack: boolean
    boxNo?: string
    expected?: number
    already?: number
    remaining?: number
    remainingAfter?: number
    notOnBox?: boolean
    overscan?: boolean
    cartonExpected?: boolean | null
    cartonStatus?: string
    cartonDuplicate?: boolean
    itemName?: string
    condition?: string
    unitPrice?: number
    amount?: number
  }>(null)
  const [scanConfirmBusy, setScanConfirmBusy] = useState(false)
  const [rescanAfterConfirm, setRescanAfterConfirm] = useState(false)
  const [boxCondition, setBoxCondition] = useState('ok')
  const [exceptionAlert, setExceptionAlert] = useState<null | { title: string; detail: string }>(null)
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
  const [invoiceExpected, setInvoiceExpected] = useState<any[]>([])
  const [pickedPOIds, setPickedPOIds] = useState<number[]>([])
  const [lastScanFeedback, setLastScanFeedback] = useState('')
  const [operators, setOperators] = useState<any[]>([])
  const [discPart, setDiscPart] = useState('')
  const [discLabelQty, setDiscLabelQty] = useState('')
  const [discPhysicalQty, setDiscPhysicalQty] = useState('')
  const [discExpectedVariant, setDiscExpectedVariant] = useState('')
  const [discVariant, setDiscVariant] = useState('')
  const [discExpectedRevision, setDiscExpectedRevision] = useState('')
  const [discRevision, setDiscRevision] = useState('')
  const [discSerial, setDiscSerial] = useState('')
  const [discOtherPO, setDiscOtherPO] = useState('')
  const [discNotes, setDiscNotes] = useState('')
  const [acceptSubstitute, setAcceptSubstitute] = useState(false)
  const [discBusy, setDiscBusy] = useState(false)
  const [parentCartonNo, setParentCartonNo] = useState('')
  const [invoiceToFollow, setInvoiceToFollow] = useState(false)
  const [documentsToFollow, setDocumentsToFollow] = useState(false)
  const [invoiceRows, setInvoiceRows] = useState<string[]>([''])
  const [physicalCount, setPhysicalCount] = useState('')
  const [docCompare, setDocCompare] = useState<any>(null)
  const [scanItemMeta, setScanItemMeta] = useState<null | {
    requires_qi?: boolean
    has_batch?: boolean
    has_expiry_date?: boolean
    shelf_life_in_days?: number | null
    expiry_warning?: string
    batch_warning?: string
    expected_batch?: string
  }>(null)
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState('')
  const [expectedBatch, setExpectedBatch] = useState('')
  const [expectedSupplier, setExpectedSupplier] = useState('')
  const [supplierBarcode, setSupplierBarcode] = useState('')
  const [receivingType, setReceivingType] = useState('return_receipt')
  const [manualEntryMode, setManualEntryMode] = useState(false)
  const [offlineMode, setOfflineMode] = useState(false)
  const STEPS = [
    { key: 'draft', label: 'DRAFT' },
    { key: 'receiving', label: 'RECEIVING' },
    { key: 'box_reconciliation', label: 'BOX_RECONCILIATION' },
    { key: 'item_verification', label: 'ITEM_VERIFICATION' },
    { key: 'exception_pending', label: 'EXCEPTION_PENDING' },
    { key: 'item_verification_complete', label: 'ITEM_VERIFICATION_COMPLETE' },
    { key: 'putaway_pending', label: 'PUTAWAY_PENDING' },
    { key: 'completed', label: 'COMPLETED' },
  ]

  const stepIndex = (status?: string) => {
    const s = (status || 'receiving').toLowerCase()
    if (s === 'draft') return 0
    if (s === 'open' || s === 'receiving') return 1
    if (s === 'box_reconciliation') return 2
    if (s === 'item_verification') return 3
    if (s === 'exception_pending') return 4
    if (s === 'item_verification_complete') return 5
    if (s === 'putaway_pending' || s === 'putaway_in_progress') return 6
    if (s === 'closed' || s === 'completed') return 7
    return 1
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
    api.get<LocOpt[]>('/masterdata/locations').then(r => {
      if (r.ok) setCmLocations((r.data ?? []).map((l: any) => ({
        id: l.id, code: l.code, warehouse_code: l.warehouse_code,
      })))
    })
  }, [])

  const joinedInvoices = () => {
    const rows = invoiceRows.map(s => s.trim()).filter(Boolean)
    if (rows.length) return rows.join(', ')
    if (invoiceToFollow) return 'INVOICE-TO-FOLLOW'
    return invoiceNos.trim()
  }

  const createPayload = (po?: any, fullPO?: any) => ({
    warehouse_id: warehouseId ? +warehouseId : undefined,
    purchase_receipt_no: fullPO?.name || po?.name || '',
    supplier_name: fullPO?.supplier_name || po?.supplier_name || '',
    purchase_order_id: po?.id,
    receiving_mode: receivingMode,
    packing_list_available: receivingMode === 'packing_list',
    truck_no: truckNo || undefined,
    driver_name: driverName || undefined,
    driver_phone: driverPhone || undefined,
    arrival_at: arrivalAt || nowLocalDatetime(),
    expected_boxes: expectedBoxes ? +expectedBoxes : undefined,
    invoice_nos: joinedInvoices() || undefined,
    documents_to_follow: documentsToFollow || undefined,
    expected_delivery_at: expectedDeliveryAt || fullPO?.schedule_date || po?.schedule_date || undefined,
    supplier_barcode: supplierBarcode || undefined,
  })

  const createSessionFromPO = async (po: any) => {
    await createSessionsFromPOs([po])
  }

  const createSessionsFromPOs = async (poList: any[]) => {
    if (poList.length === 0) return
    setLoading(true)
    let last: { data: any; fullPO: any } | null = null
    const created: string[] = []
    for (const po of poList) {
      const detail = await api.poGet(po.id)
      const fullPO = detail.ok ? detail.data : po
      const r = await api.grnCreate(createPayload(po, fullPO))
      if (!r.ok) {
        notify({ type: 'error', title: 'Could not start receiving', message: `${po.name}: ${r.error || 'Unknown error'}` })
        continue
      }
      created.push(r.data.session_no)
      last = { data: r.data, fullPO }
      const flags = r.data?.auto_flags || []
      if (flags.length) {
        notify({
          type: 'warning',
          title: 'Arrival checks',
          message: flags.join(', ').replace(/_/g, ' '),
        })
      }
    }
    setLoading(false)
    if (last) {
      setSelectedPO(last.fullPO)
      setGrnTab('boxes')
      setPickedPOIds([])
      loadSessions()
      navigate(`/grn/${last.data.id}`)
      notify({
        type: 'success',
        title: created.length > 1 ? `${created.length} GRNs created` : 'GRN Session Created',
        message: created.length > 1
          ? `${created.join(', ')} · truck ${truckNo || '—'} · independent PO tracking`
          : `${last.data.session_no} for ${last.fullPO.name}`,
      })
    }
  }

  const createBlankSession = async (asDraft = false) => {
    setLoading(true)
    const r = await api.grnCreate({
      warehouse_id: warehouseId ? +warehouseId : undefined,
      purchase_receipt_no: '',
      supplier_name: '',
      receiving_mode: receivingMode,
      packing_list_available: receivingMode === 'packing_list',
      truck_no: truckNo || undefined,
      driver_name: driverName || undefined,
      driver_phone: driverPhone || undefined,
      arrival_at: arrivalAt || nowLocalDatetime(),
      expected_boxes: expectedBoxes ? +expectedBoxes : undefined,
      invoice_nos: joinedInvoices() || undefined,
      documents_to_follow: documentsToFollow || undefined,
      expected_delivery_at: expectedDeliveryAt || undefined,
      supplier_barcode: supplierBarcode || undefined,
      as_draft: asDraft,
    })
    setLoading(false)
    if (r.ok) {
      setSelectedPO(null)
      setGrnTab('boxes')
      loadSessions()
      navigate(`/grn/${r.data.id}`)
      notify({ type: 'success', title: 'GRN Session Created', message: r.data.session_no })
      const flags = r.data?.auto_flags || []
      if (flags.length) {
        notify({ type: 'warning', title: 'Arrival checks', message: flags.join(', ').replace(/_/g, ' ') })
      }
    }
  }

  const reloadSession = async (id: number) => {
    const r = await api.grnSession(id)
    if (r.ok) setSession(r.data)
    await refreshWorkspace(id)
  }

  const openSession = async (id: number, skipNav = false) => {
    const r = await api.grnSession(id)
    if (!r.ok) {
      notify({ type: 'error', title: 'Session load failed', message: r.error || '' })
      return
    }
    setSession(r.data)
    setGrnTab('overview')
    refreshWorkspace(id)
    if (!skipNav) navigate(`/grn/${id}`)
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
    const [sum, ev, ex, box, aud, fu, isum, invExp, cmp] = await Promise.all([
      api.grnBoxSummary(id),
      api.grnEvents(id),
      api.grnExceptions(id),
      api.grnActiveBox(id),
      api.grnAudits(id),
      api.grnFollowUps(id),
      api.grnItemSummary(id),
      api.grnInvoiceExpected(id),
      api.grnDocCompare(id),
    ])
    if (sum.ok) setBoxSummary(sum.data)
    if (ev.ok) setEvents(ev.data ?? [])
    if (ex.ok) setExceptions(ex.data ?? [])
    if (box.ok) setActiveBox(box.data?.active ? box.data : null)
    if (aud.ok) setAudits(aud.data ?? [])
    if (fu.ok) setFollowUps(fu.data ?? [])
    if (isum.ok) setItemSummary(isum.data)
    if (invExp.ok) setInvoiceExpected(invExp.data ?? [])
    if (cmp.ok) setDocCompare(cmp.data)
  }

  useEffect(() => {
    const id = params.id ? +params.id : 0
    if (id && session?.id !== id) void openSession(id, true)
  }, [params.id])

  useEffect(() => {
    if (!session?.id) {
      setOperators([])
      return
    }
    const ping = () => {
      api.grnPresence(session.id).then(r => {
        if (r.ok) setOperators(r.data?.operators ?? [])
      })
    }
    ping()
    const t = window.setInterval(ping, 20000)
    return () => window.clearInterval(t)
  }, [session?.id])

  useEffect(() => {
    if (session?.id) refreshWorkspace(session.id)
  }, [session?.id])

  useEffect(() => { rememberItems(selectedPO?.items) }, [selectedPO])
  useEffect(() => { rememberItems(activeBox?.lines) }, [activeBox])

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

  // Item/case labels are {item}-{qty}_{unit price}, e.g. JL401403-1_759.
  // Item codes may contain hyphens, so qty and price are read from the right.
  const parsePackedQR = (raw: string) => {
    const s = (raw || '').trim().replace(/[\s\n\r\t]/g, '')
    const us = s.lastIndexOf('_')
    if (us <= 0) return null
    const priceText = s.slice(us + 1).replace(/,/g, '')
    if (!priceText || Number.isNaN(+priceText)) return null
    const unitPrice = +priceText
    if (unitPrice < 0) return null
    const left = s.slice(0, us)
    const hy = left.lastIndexOf('-')
    if (hy <= 0) return null
    const item = left.slice(0, hy)
    const qty = +left.slice(hy + 1)
    if (!item || !(qty > 0)) return null
    const amount = Math.round(qty * unitPrice * 100) / 100
    return { item, qty, amount, unitPrice }
  }

  const applyPackedScan = (raw: string, target: 'carton' | 'item' | 'verify') => {
    const packed = parsePackedQR(raw)
    if (target === 'verify' && packed) {
      setVerifyItemCode(packed.item)
      setScan(String(packed.qty))
      return packed
    }
    if (target === 'item' && packed) {
      setItem(packed.item)
      setScan(String(packed.qty))
      if (!exp) setExp(String(packed.qty))
      return packed
    }
    if (target === 'carton') setCartonNo(raw)
    else if (target === 'verify') setVerifyItemCode(raw)
    else setItem(raw)
    return packed
  }

  const findBoxLine = (itemCode: string) => {
    const want = (itemCode || '').trim().toUpperCase()
    return (activeBox?.lines || []).find((l: any) => String(l.item_code || '').toUpperCase() === want)
  }

  const resolveItemName = (itemCode: string, line?: any) => {
    const fromLine = (line?.item_name || line?.name || '').trim()
    if (fromLine) {
      rememberItemName(itemCode, fromLine)
      return fromLine
    }
    const fromPO = (selectedPO?.items || []).find((p: any) =>
      String(p.item_code || '').toUpperCase() === itemCode.trim().toUpperCase()
    )
    const poName = (fromPO?.item_name || fromPO?.name || '').trim()
    if (poName) {
      rememberItemName(itemCode, poName)
      return poName
    }
    return lookupItemName(itemCode)
  }

  const fillItemNameInBackground = async (itemCode: string) => {
    if (lookupItemName(itemCode)) return
    const r = await api.itemCheck(itemCode)
    let name = r.ok && r.data?.exists ? (r.data.name || '') : ''
    if (!name) {
      const list = await api.itemList(itemCode)
      const hit = (list.ok ? list.data : [])?.find((i: any) =>
        String(i.code || '').toUpperCase() === itemCode.trim().toUpperCase()
      )
      name = hit?.name || ''
    }
    if (!name) return
    rememberItemName(itemCode, name)
    setScanConfirm(prev => {
      if (!prev || prev.kind !== 'verify') return prev
      if (prev.itemCode.toUpperCase() !== itemCode.trim().toUpperCase()) return prev
      if (prev.itemName) return prev
      return { ...prev, itemName: name }
    })
  }

  const loadScanItemMeta = async (itemCode: string, scannedBatch?: string, scannedExpiry?: string) => {
    const check = await api.itemCheck(itemCode)
    const data = check.ok ? check.data : {}
    const expectedBatch = poItemBatch(selectedPO, itemCode)
      || String((activeBox?.lines || []).find((l: any) => String(l.item_code || '').toUpperCase() === itemCode.trim().toUpperCase())?.batch_no || '').trim()
    const shelf = data.shelf_life_in_days != null ? +data.shelf_life_in_days : null
    if (data.requires_qi) setRequiresQI(true)
    if (shelf && !shelfLife) setShelfLife(String(shelf))
    if (expectedBatch) setExpectedBatch(expectedBatch)
    const remaining = daysUntil(scannedExpiry || expDate)
    const threshold = shelfLifeThreshold(shelf)
    let expiryWarning = ''
    if (remaining != null && remaining < 0) expiryWarning = `Expired ${Math.abs(remaining)} day(s) ago`
    else if (remaining != null && remaining < threshold) expiryWarning = `Short shelf life — ${remaining} day(s) left (threshold ${threshold})`
    const scanned = (scannedBatch || batch || '').trim()
    let batchWarning = ''
    if (expectedBatch && scanned && expectedBatch.toUpperCase() !== scanned.toUpperCase()) {
      batchWarning = `Expected batch ${expectedBatch}, scanned ${scanned}`
    }
    const meta = {
      requires_qi: !!data.requires_qi,
      has_batch: !!data.has_batch,
      has_expiry_date: !!data.has_expiry_date,
      shelf_life_in_days: shelf,
      expiry_warning: expiryWarning || undefined,
      batch_warning: batchWarning || undefined,
      expected_batch: expectedBatch || undefined,
    }
    setScanItemMeta(meta)
    return meta
  }

  const requestVerifyConfirm = (rawOverride?: string, qtyOverride?: number) => {
    const raw = (rawOverride ?? verifyItemCode).trim()
    if (!session || !raw) return
    const packed = parsePackedQR(raw)
    const itemCode = packed?.item || raw
    const qty = packed?.qty || qtyOverride || +(scan || 1) || 1
    const invoiceOnly = session.receiving_mode === 'invoice_only'
    const boxLine = findBoxLine(itemCode)
    const part = (itemSummary?.parts || []).find((p: any) =>
      String(p.part_no || '').toUpperCase() === itemCode.trim().toUpperCase()
    )
    const line = boxLine || (invoiceOnly && part ? {
      expected_qty: part.expected_qty,
      scanned_qty: part.scanned_qty,
      remaining: (part.expected_qty || 0) - (part.scanned_qty || 0),
    } : null)
    const expected = line ? +line.expected_qty : undefined
    const already = line ? +(line.scanned_qty || 0) : undefined
    const remaining = line != null
      ? +(line.remaining ?? ((line.expected_qty || 0) - (line.scanned_qty || 0)))
      : undefined
    const remainingAfter = remaining != null ? remaining - qty : undefined
    const hasList = invoiceOnly
      ? ((itemSummary?.parts?.length ?? 0) > 0 || invoiceExpected.length > 0)
      : (activeBox?.lines?.length ?? 0) > 0
    const itemName = resolveItemName(itemCode, boxLine)
    applyPackedScan(raw, 'verify')
    if (!packed) {
      setVerifyItemCode(itemCode)
      setScan(String(qty))
    }
    setScanConfirm({
      kind: 'verify',
      raw,
      itemCode,
      qty,
      isCasePack: !!packed && packed.qty > 1,
      boxNo: activeBox?.carton_no,
      expected,
      already,
      remaining,
      remainingAfter,
      notOnBox: !invoiceOnly && hasList && !line,
      overscan: remaining != null && remainingAfter != null && remainingAfter < 0,
      itemName,
      unitPrice: packed?.unitPrice,
      amount: packed?.amount,
    })
    if (!itemName) void fillItemNameInBackground(itemCode)
    void loadScanItemMeta(itemCode, batch, expDate)
  }

  const requestCartonConfirm = (rawOverride?: string) => {
    const raw = (rawOverride ?? cartonNo).trim()
    if (!raw || !session) return
    setCartonNo(raw)
    const box = (boxSummary?.boxes || []).find((b: any) =>
      String(b.carton_no || '').toUpperCase() === raw.toUpperCase()
    )
    const st = String(box?.status || '').toLowerCase()
    const cartonDuplicate = ['received', 'accounted', 'verified', 'exception', 'excess'].includes(st)
    const cartonFromSession = (session.cartons || []).find((c: any) =>
      String(c.carton_no || '').toUpperCase() === raw.toUpperCase()
    )
    const labelQty = Number(box?.expected_qty)
      || (cartonFromSession?.lines || []).reduce((s: number, l: any) => s + (+l.expected_qty || 0), 0)
    setPhysicalCount(labelQty ? String(labelQty) : '')
    setScanConfirm({
      kind: 'carton',
      raw,
      itemCode: raw,
      qty: 1,
      isCasePack: false,
      boxNo: raw,
      expected: labelQty || undefined,
      cartonExpected: box ? !!box.is_expected : ((boxSummary?.expected_boxes ?? 0) > 0 ? false : null),
      cartonStatus: box?.status,
      cartonDuplicate,
      condition: boxCondition,
    })
  }

  const dismissScanConfirm = (clearFields = true) => {
    setScanConfirm(null)
    setScanConfirmBusy(false)
    setRescanAfterConfirm(false)
    if (clearFields) {
      if (scanConfirm?.kind === 'verify') {
        setVerifyItemCode('')
        setScan('1')
      }
    }
  }

  const commitScanConfirm = async () => {
    if (!scanConfirm || scanConfirmBusy) return
    if (scanConfirm.kind === 'carton') {
      setScanConfirmBusy(true)
      const labelQty = +(scanConfirm.expected || 0)
      const phys = physicalCount.trim() === '' ? null : +physicalCount
      if (phys != null && Number.isFinite(phys) && labelQty > 0 && phys !== labelQty) {
        await api.grnReportDiscrepancy(session.id, {
          kind: 'label_mismatch',
          box_no: scanConfirm.raw,
          label_qty: labelQty,
          physical_qty: phys,
        })
      }
      const ok = await addCarton()
      setScanConfirmBusy(false)
      if (!ok) return
      setScanConfirm(null)
      setPhysicalCount('')
      const reopen = rescanAfterConfirm
      setRescanAfterConfirm(false)
      if (reopen) setTimeout(() => { setScanTarget('carton'); setShowScanner(true) }, 150)
      return
    }
    if (!session) return
    setScanConfirmBusy(true)
    const packed = parsePackedQR(scanConfirm.raw)
    const r = await api.grnVerifyItem(session.id, {
      item_code: packed ? scanConfirm.raw : scanConfirm.itemCode,
      qty: scanConfirm.qty,
      carton_id: session.receiving_mode === 'invoice_only' ? undefined : activeBox?.id,
      variant: discVariant || undefined,
      expected_variant: discExpectedVariant || undefined,
      revision: discRevision || undefined,
      expected_revision: discExpectedRevision || undefined,
      serial_no: discSerial || undefined,
      substitute: acceptSubstitute || undefined,
      unit_price: scanConfirm.unitPrice ?? packed?.unitPrice,
      amount: scanConfirm.amount ?? packed?.amount,
    })
    setScanConfirmBusy(false)
    if (!r.ok) {
      notify({ type: 'error', title: 'Verify failed', message: r.error || '' })
      return
    }
    const meta = await loadScanItemMeta(scanConfirm.itemCode, batch, expDate)
    if (meta?.expiry_warning) {
      await api.grnReportDiscrepancy(session.id, {
        kind: 'expired', part_no: scanConfirm.itemCode, notes: meta.expiry_warning,
      })
    }
    if (meta?.batch_warning) {
      await api.grnReportDiscrepancy(session.id, {
        kind: 'wrong_batch', part_no: scanConfirm.itemCode, notes: meta.batch_warning,
      })
    }
    setScanConfirm(null)
    setScanItemMeta(null)
    const flagged = applyItemDiscrepancyAlert(r.data)
    if (r.data.lines) {
      rememberItems(r.data.lines)
      setActiveBox((prev: any) => prev ? { ...prev, lines: r.data.lines } : prev)
    }
    if (!flagged && r.data.box_auto_closed) {
      notify({ type: 'success', title: 'Box auto-closed', message: r.data.box_message })
      setActiveBox(null)
    } else if (!flagged) {
      const packNote = (r.data.pack_qty || packed?.qty) > 1
        ? ` (case pack ${r.data.pack_qty || packed?.qty})`
        : ''
      notify({ type: 'success', title: 'Item scanned', message: `${r.data.item_code} → ${r.data.scanned_qty}/${r.data.expected_qty}${packNote}` })
    }
    setVerifyItemCode('')
    setScan('1')
    reloadSession(session.id)
    const reopen = rescanAfterConfirm && !r.data.box_auto_closed
    setRescanAfterConfirm(false)
    if (reopen) setTimeout(() => { setScanTarget('verify'); setShowScanner(true) }, 150)
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

  const uploadCOA = async (file: File | null) => {
    if (!file || !session) return
    const up = await api.attachmentUpload('grn_coa', session.id, file)
    if (!up.ok) {
      notify({ type: 'error', title: 'COA upload failed', message: up.error || '' })
      return
    }
    const r = await api.grnAttachCOA(session.id, up.data.id)
    if (r.ok) {
      notify({
        type: 'success',
        title: r.data.resolved ? 'COA attached — exception resolved' : 'COA attached',
        message: file.name,
      })
      refreshWorkspace(session.id)
    } else {
      notify({ type: 'error', title: 'COA link failed', message: r.error || '' })
    }
  }

  const uploadEvidence = async (exceptionId: number, file: File | null) => {
    if (!file || !session || !exceptionId) return
    const up = await api.attachmentUpload('grn_exception', exceptionId, file)
    if (!up.ok) {
      notify({ type: 'error', title: 'Photo upload failed', message: up.error || '' })
      return
    }
    const r = await api.grnAttachEvidence(exceptionId, up.data.id)
    if (r.ok) {
      notify({ type: 'success', title: 'Evidence attached', message: file.name })
      refreshWorkspace(session.id)
    } else {
      notify({ type: 'error', title: 'Evidence link failed', message: r.error || '' })
    }
  }

  const reportThenPhoto = async (kind: string, file: File) => {
    if (!session) return
    let excId = exceptions.find((ex: any) =>
      String(ex.exception_type || '').toLowerCase() === kind
      && (ex.status === 'open' || ex.status === 'pending')
    )?.id
    if (!excId) {
      const data = await reportDiscrepancy(kind)
      excId = data?.exception_id
    }
    if (excId) await uploadEvidence(excId, file)
  }

  const scanSupplierCode = async (code: string) => {
    const raw = (code || '').trim()
    if (!raw) return
    setSupplierBarcode(raw)
    if (session) {
      const r = await api.grnScanSupplier(session.id, raw)
      if (!r.ok) {
        notify({ type: 'error', title: 'Supplier scan failed', message: r.error || '' })
        return
      }
      if (r.data.mismatch) {
        notify({ type: 'warning', title: '⚠ WRONG SUPPLIER', message: r.data.message || raw })
        setGrnTab('exceptions')
        refreshWorkspace(session.id)
      } else if (!r.data.found) {
        notify({ type: 'warning', title: 'Unknown supplier barcode', message: r.data.message || raw })
      } else {
        notify({ type: 'success', title: 'Supplier matched', message: r.data.scanned_supplier || raw })
      }
      return
    }
    const r = await api.supplierByBarcode(raw)
    if (r.ok && r.data?.found) {
      notify({ type: 'success', title: 'Supplier barcode', message: r.data.name })
    } else {
      notify({ type: 'warning', title: 'Unknown supplier barcode', message: raw })
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

  const applyItemDiscrepancyAlert = (data: any) => {
    const code = data?.item_code || data?.part_no || ''
    const msg = data?.message || ''
    const kind = String(data?.kind || '').toLowerCase()
    const raise = (title: string, detail: string) => {
      setExceptionAlert({ title, detail })
      setLastScanFeedback(title + (code ? ` — ${code}` : ''))
      notify({ type: 'warning', title, message: detail || msg })
      setGrnTab('exceptions')
    }
    if (data?.counterfeit || kind === 'counterfeit') {
      raise('⚠ COUNTERFEIT', msg || `Serial ${discSerial || ''} is not in manufacturer records.`)
      return true
    }
    if (data?.substitute || kind === 'substitute') {
      raise('⚠ SUBSTITUTE', msg || 'Substitute recorded as pending approval. Supervisor must resolve before it becomes accepted stock.')
      return true
    }
    if (data?.wrong_po || kind === 'wrong_po') {
      raise('⚠ ITEM FROM DIFFERENT PO', msg || `Valid item, but it belongs to ${data.other_po || 'another PO'}, not this GRN.`)
      return true
    }
    if (data?.wrong_variant || kind === 'wrong_variant') {
      raise('⚠ WRONG VARIANT', msg || `${discExpectedVariant} expected, received ${discVariant}.`)
      return true
    }
    if (data?.wrong_revision || kind === 'wrong_revision') {
      raise('⚠ WRONG REVISION', msg || `${discExpectedRevision} expected, received ${discRevision}.`)
      return true
    }
    if (data?.mixed_items || kind === 'mixed_items') {
      raise('⚠ MIXED ITEMS', msg || `Box contains parts that were not expected together (${code}).`)
      return true
    }
    if (data?.wrong_item || kind === 'wrong_item') {
      raise('⚠ WRONG ITEM', msg || `Scanned: ${code}. This item is not expected in ${data.box_no || 'this box'}.`)
      return true
    }
    if (data?.empty_box || kind === 'empty_box') {
      raise('⚠ EMPTY BOX', msg || 'Sealed/labeled carton contained nothing. Full shortage recorded.')
      return true
    }
    if (data?.label_mismatch || kind === 'label_mismatch') {
      raise('⚠ LABEL MISMATCH', msg || 'Label qty does not match physical count.')
      return true
    }
    if (data?.excess || data?.status === 'excess') {
      raise('⚠ EXCESS', msg || `Part ${code}: expected ${data.expected_qty}, scanned ${data.scanned_qty}. Excess should not silently become accepted stock.`)
      return true
    }
    const kindTitles: Record<string, string> = {
      internal_damage: '⚠ INTERNAL DAMAGE',
      unknown_box: '⚠ UNKNOWN BOX',
      relabeled: '⚠ RELABELED BOX',
      no_box_id: '⚠ NO BOX ID',
      damaged_barcode: '⚠ DAMAGED BARCODE',
      nested_box: '⚠ NESTED BOXES',
      no_packing_list: '⚠ NO PACKING LIST',
      no_invoice: '⚠ INVOICE TO FOLLOW',
      packing_list_po_mismatch: '⚠ PACKING LIST ≠ PO',
      packing_list_physical_mismatch: '⚠ PACKING LIST ≠ PHYSICAL',
      invoice_po_mismatch: '⚠ INVOICE ≠ PO',
      invoice_packing_list_mismatch: '⚠ INVOICE ≠ PACKING LIST',
      wrong_po_referenced: '⚠ WRONG PO REFERENCED',
      missing_delivery_note: '⚠ MISSING DELIVERY NOTE',
      handwritten_docs: '⚠ UNCLEAR DOCUMENTS',
      multiple_invoices: '⚠ MULTIPLE INVOICES',
      quality_fail: '⚠ QUALITY FAIL',
      expired: '⚠ EXPIRED',
      wrong_batch: '⚠ WRONG BATCH',
      missing_coa: '⚠ MISSING COA',
      contaminated: '⚠ CONTAMINATED',
      cold_chain: '⚠ COLD CHAIN BREAK',
      recalled: '⚠ RECALLED ITEM',
      wrong_supplier: '⚠ WRONG SUPPLIER',
      unscheduled_delivery: '⚠ UNSCHEDULED DELIVERY',
      early_delivery: '⚠ EARLY DELIVERY',
      late_delivery: '⚠ LATE DELIVERY',
      split_truck: '⚠ SPLIT TRUCK',
      outside_hours: '⚠ OUTSIDE HOURS',
      driver_no_docs: '⚠ DRIVER HAS NO DOCUMENTS',
      rejected_truck_return: '⚠ REJECTED TRUCK RETURNED',
      scanner_down: '⚠ SCANNER NOT WORKING',
      system_offline: '⚠ SYSTEM DOWN',
      network_timeout: '⚠ NETWORK TIMEOUT',
      concurrent_ops: 'Concurrent receiving',
      undo_last_box: '⚠ WRONG BOX CORRECTED',
      double_scan_item: '⚠ DOUBLE SCAN',
      resume_session: 'SESSION RESUME',
      wrong_warehouse: '⚠ WRONG WAREHOUSE',
      return_receipt: 'RETURN RECEIPT',
      transfer_in: 'TRANSFER IN',
      consignment: 'CONSIGNMENT',
      vmi: 'VMI',
      sample: 'SAMPLE',
      loan: 'LOAN / TOOLING',
      hazmat: '⚠ HAZMAT',
      oversized: 'OVERSIZED',
      high_value: 'HIGH VALUE',
      serialized: 'SERIALIZED RECEIVING',
      cross_dock: 'CROSS-DOCK',
      quarantine: '⚠ QUARANTINE',
      rma: 'RMA',
      stock_adjustment: 'STOCK ADJUSTMENT',
    }
    if (kind && kindTitles[kind]) {
      raise(kindTitles[kind], msg)
      if (kind === 'no_box_id' && data?.box_no) setCartonNo(String(data.box_no))
      if (kind === 'no_packing_list') reloadSession(session?.id || 0)
      if (kind === 'scanner_down') setManualEntryMode(true)
      if (kind === 'system_offline') setOfflineMode(true)
      if (kind === 'resume_session' && session?.id) navigate(`/grn/${session.id}`)
      return true
    }
    return false
  }

  const reportDiscrepancy = async (kind: string, extra: Record<string, unknown> = {}) => {
    if (!session) return
    setDiscBusy(true)
    const part = String(extra.part_no ?? (discPart || verifyItemCode)).trim()
    const box = String(extra.box_no ?? (activeBox?.carton_no || cartonNo)).trim()
    const r = await api.grnReportDiscrepancy(session.id, {
      kind,
      box_no: box,
      part_no: part,
      notes: discNotes,
      label_qty: +(discLabelQty || 0),
      physical_qty: +(discPhysicalQty || 0),
      expected_qty: extra.expected_qty,
      scanned_qty: extra.scanned_qty,
      expected_variant: discExpectedVariant,
      variant: discVariant,
      expected_revision: discExpectedRevision,
      revision: discRevision,
      serial_no: discSerial,
      other_po: discOtherPO,
      ...extra,
    })
    setDiscBusy(false)
    if (!r.ok) {
      notify({ type: 'error', title: 'Discrepancy failed', message: r.error || '' })
      return
    }
    applyItemDiscrepancyAlert({ ...r.data, kind: r.data.kind || kind, item_code: part })
    if (kind === 'empty_box') setActiveBox(null)
    reloadSession(session.id)
    return r.data
  }

  const completeVerification = async () => {
    if (!session) return
    const r = await api.grnCompleteVerification(session.id)
    if (r.ok) {
      const net = r.data.net_offset
      notify({
        type: r.data.open_exceptions > 0 ? 'warning' : 'success',
        title: 'Item verification complete',
        message: net
          ? `Independent shortage (${r.data.shortages_recorded}) and excess (${r.data.excesses_recorded}) — net quantity does not cancel exceptions`
          : r.data.open_exceptions > 0
            ? `${r.data.open_exceptions} open exceptions — resolve before finalize`
            : 'Ready to finalize',
      })
      if (net) {
        setExceptionAlert({
          title: 'Per-part reconciliation',
          detail: 'Net quantity can match while one part is short and another is excess. Shortage and excess are recorded independently.',
        })
      }
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
      navigate('/grn')
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
    const no = (scanConfirm?.kind === 'carton' ? scanConfirm.raw : cartonNo).trim()
    if (!no || !session) return false
    const r = await api.grnScanCarton({
      grn_session_id: session.id,
      carton_no: no,
      condition: scanConfirm?.kind === 'carton' ? (scanConfirm.condition || boxCondition) : boxCondition,
      parent_carton_no: parentCartonNo || undefined,
    })
    if (r.ok) {
      const msgText = r.data?.message || r.data?.status
      if (r.data?.nested) {
        setExceptionAlert({
          title: '⚠ NESTED BOXES',
          detail: msgText || `Inner box ${no} inside outer ${parentCartonNo}. Scan each level separately.`,
        })
        setLastScanFeedback(`NESTED BOXES — ${no}`)
        notify({ type: 'warning', title: '⚠ NESTED BOXES', message: msgText })
        setGrnTab('exceptions')
      } else if (r.data?.damaged) {
        setExceptionAlert({
          title: '⚠ DAMAGED BOX',
          detail: `Box ${no} recorded as damaged. Inspect contents and decide accept/reject. Exception created.`,
        })
        setLastScanFeedback(`DAMAGED BOX — ${no}`)
        notify({ type: 'warning', title: '⚠ DAMAGED BOX', message: msgText })
        setGrnTab('exceptions')
      } else if (r.data?.unknown_box) {
        setExceptionAlert({
          title: '⚠ UNKNOWN BOX',
          detail: `Box ${no} has a barcode that is not on the packing list or any PO. Recorded as an unknown/excess box exception.`,
        })
        setLastScanFeedback(`UNKNOWN BOX — ${no}`)
        notify({ type: 'warning', title: '⚠ UNKNOWN BOX', message: msgText })
        setGrnTab('exceptions')
      } else if (r.data?.excess) {
        setExceptionAlert({
          title: '⚠ EXCESS BOX',
          detail: `Box ${no} is not on the packing list / exceeds expected count. It entered an exception state and was not silently accepted as expected stock.`,
        })
        setLastScanFeedback(`EXCESS BOX — ${no}`)
        notify({ type: 'warning', title: '⚠ EXCESS BOX', message: msgText })
        setGrnTab('exceptions')
      } else if (r.data?.duplicate) {
        setExceptionAlert({
          title: '⚠ BOX ALREADY SCANNED',
          detail: `${no} — this box was already scanned. The duplicate was recorded as an event. Quantity was not counted twice.`,
        })
        setLastScanFeedback(`BOX ALREADY SCANNED — ${no}`)
        notify({ type: 'warning', title: '⚠ BOX ALREADY SCANNED', message: `${no} was not counted again` })
        setGrnTab('exceptions')
      } else if (r.data?.invalid) {
        setExceptionAlert({
          title: '⚠ INVALID BARCODE',
          detail: `${no} is not a valid box ID. Nothing was received and no box was created.`,
        })
        setLastScanFeedback(`INVALID BARCODE — ${no}`)
        notify({ type: 'warning', title: '⚠ INVALID BARCODE', message: no })
      } else {
        setLastScanFeedback(`Box ${no} accepted`)
        notify({ type: 'success', title: 'Box accepted', message: `${no} · ${msgText}` })
      }
      setMsg(msgText)
      setCartonNo('')
      setBoxCondition('ok')
      reloadSession(session.id)
      return true
    }
    notify({ type: 'error', title: 'Carton scan failed', message: r.error || '' })
    return false
  }

  const finishBoxReceiving = async () => {
    if (!session) return
    const r = await api.grnCompleteBoxReceiving(session.id)
    if (r.ok) {
      const missing = r.data?.missing_boxes || []
      if (missing.length > 0) {
        setExceptionAlert({
          title: '⚠ MISSING BOXES',
          detail: `Packing list expected boxes that did not arrive: ${missing.join(', ')}. These are marked missing and were not treated as received.`,
        })
        setLastScanFeedback(`Missing boxes: ${missing.join(', ')}`)
        notify({ type: 'warning', title: '⚠ MISSING BOXES', message: missing.join(', ') })
        setGrnTab('exceptions')
      } else {
        notify({ type: 'success', title: 'Box reconciliation', message: 'No missing expected boxes' })
      }
      await reloadSession(session.id)
      if (missing.length === 0) setGrnTab('boxes')
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
      setCmForm({ ...emptyProductForm(), code: item })
      notify({
        type: 'warning',
        title: 'Complete item master first',
        message: `${item} is new or incomplete.`,
      })
      return
    }
    const meta = await loadScanItemMeta(item, batch, expDate)
    const qi = requiresQI || !!meta.requires_qi

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
      requires_qi: qi,
      notes: lineNotes || undefined,
      batch_no: batch, serial_no: serial,
      manufacturing_date: mfgDate || undefined, expiry_date: expDate || undefined,
      shelf_life_days: shelfLife ? +shelfLife : undefined,
    })
    if (r.ok) {
      if (meta.expiry_warning) {
        await api.grnReportDiscrepancy(session.id, { kind: 'expired', part_no: item, notes: meta.expiry_warning })
      }
      if (meta.batch_warning) {
        await api.grnReportDiscrepancy(session.id, { kind: 'wrong_batch', part_no: item, notes: meta.batch_warning })
      }
      const variance = r.data.variance_qty
      const varianceMsg = variance ? ` · variance ${variance > 0 ? '+' : ''}${variance}` : ''
      setMsg(`Status: ${r.data.status}${varianceMsg}`)
      notify({
        type: r.data.status === 'full_match' ? 'success' : 'warning',
        title: r.data.status === 'excess' ? '⚠ EXCESS' : r.data.status === 'damage' ? '⚠ DAMAGED' : 'Item Scanned',
        message: `${item}: ${r.data.status}${varianceMsg}`,
      })
      if (r.data.status === 'excess') {
        setExceptionAlert({
          title: '⚠ EXCESS',
          detail: `${item}: scanned more than expected. Excess should not silently become accepted stock.`,
        })
        setGrnTab('exceptions')
      }
      setItem(''); setExp(''); setScan(''); setBatch(''); setSerial('')
      setMfgDate(''); setExpDate(''); setShelfLife('')
      setDamagedQty(''); setRequiresQI(false); setLineNotes('')
      reloadSession(session.id)
    } else {
      notify({ type: 'error', title: 'Item scan failed', message: r.error || '' })
    }
  }

  const saveCompleteMaster = async () => {
    if (!completeMaster?.code || !cmForm.name) return
    const r = await api.itemComplete(productPayload(cmForm, { code: completeMaster.code }))
    if (r.ok) {
      rememberItemName(completeMaster.code, cmForm.name)
      notify({ type: 'success', title: 'Item master saved', message: completeMaster.code })
      setCompleteMaster(null)
    } else {
      notify({ type: 'error', title: 'Could not save master', message: r.error || '' })
    }
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    const raw = (code || '').trim()
    if (!raw) return
    if (scanTarget === 'supplier') {
      void scanSupplierCode(raw)
      return
    }
    if (scanTarget === 'verify' && session) {
      setRescanAfterConfirm(true)
      requestVerifyConfirm(raw)
      return
    }
    if (scanTarget === 'carton' && session) {
      setRescanAfterConfirm(true)
      requestCartonConfirm(raw)
      return
    }
    applyPackedScan(code, scanTarget)
  }

  const fillFromPOItem = (poItem: any) => {
    const pending = Math.max(0, (poItem.qty || 0) - (poItem.received_qty || 0))
    setItem(poItem.item_code)
    setExp(String(pending))
    setScan(String(pending || 1))
  }

  const statusBadge = (status: string, kind: 'grn' | 'po' = 'grn') => {
    const s = (status || '').toLowerCase()
    const cls = s === 'completed' || s === 'closed' || s === 'full_match' ? 'erpnext-badge-blue'
      : s === 'exception_pending' || s === 'stuck' || s === 'shortage' || s === 'damage' ? 'erpnext-badge-red'
      : s === 'receiving' || s === 'open' || s === 'draft' ? 'erpnext-badge-green'
      : 'erpnext-badge-yellow'
    const label = kind === 'grn' ? specStatusLabel(status) : (status || '—')
    return <span className={`erpnext-badge ${cls}`}>{label}</span>
  }

  const canSaveDraft = !!(warehouseId && (truckNo.trim() || invoiceNos.trim() || driverName.trim()))
  const poExpectedQty = (selectedPO?.items || []).reduce((sum: number, pi: any) => sum + (pi.qty || 0), 0)
  const expectedItemQty = itemSummary?.expected_qty || poExpectedQty
  const receivedItemQty = itemSummary?.received_qty ?? 0
  const shortItemQty = itemSummary?.short_qty ?? Math.max(0, expectedItemQty - receivedItemQty)
  const excessItemQty = itemSummary?.excess_qty ?? 0
  const expectedBoxCount = boxSummary?.expected_boxes ?? (expectedBoxes ? +expectedBoxes : null)
  const receivedBoxCount = boxSummary?.received_boxes ?? session?.cartons?.filter((c: any) => c.carton_no !== 'CONSOLIDATED').length ?? 0
  const boxSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const out: { carton_no: string; status?: string; is_expected?: boolean }[] = []
    const add = (no?: string, status?: string, is_expected?: boolean) => {
      const k = String(no || '').trim()
      if (!k || k.toUpperCase() === 'CONSOLIDATED') return
      const key = k.toUpperCase()
      if (seen.has(key)) return
      seen.add(key)
      out.push({ carton_no: k, status, is_expected })
    }
    for (const b of boxSummary?.boxes || []) add(b.carton_no, b.status, b.is_expected)
    for (const c of session?.cartons || []) add(c.carton_no, c.status, c.is_expected)
    return out
  }, [boxSummary, session])

  const filteredSessions = useMemo(() => {
    return sessions.filter((s: any) => {
      const st = (s.status || '').toLowerCase()
      if (dashFilter === 'followups' && !s.is_followup) return false
      if (dashFilter === 'completed' && st !== 'completed' && st !== 'closed') return false
      if (dashFilter === 'exceptions' && st !== 'exception_pending') return false
      if (dashFilter === 'verify' && st !== 'item_verification' && st !== 'item_verification_complete') return false
      if (dashFilter === 'in_progress' && (['completed', 'closed', 'exception_pending', 'item_verification', 'item_verification_complete'].includes(st) || s.is_followup)) return false
      return true
    })
  }, [sessions, dashFilter])

  const sessionPager = useClientPager(filteredSessions)
  const poPager = useClientPager(pos)
  const boxPager = useClientPager(boxSummary?.boxes || [])
  const exceptionPager = useClientPager(exceptions)

  const truckGroups = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const s of sessions) {
      const t = String(s.truck_no || '').trim()
      if (!t) continue
      const list = m.get(t) || []
      list.push(s)
      m.set(t, list)
    }
    return [...m.entries()].filter(([, list]) => list.length > 1)
  }, [sessions])

  const pickedPOs = pos.filter((p: any) => pickedPOIds.includes(p.id))

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="erpnext-card max-w-md w-full mx-4 p-6 space-y-4" style={{ background: 'var(--panel)' }}>
            <h2 className="text-xl font-semibold">GRN completed</h2>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              Session <strong>{confirmClose.sessionNo}</strong> is COMPLETED. Stock is in staging (put-away deferred).
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

      {scanConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="erpnext-card max-w-md w-full mx-4 p-6 space-y-4" style={{ background: 'var(--panel)' }}>
            <h2 className="text-xl font-semibold">
              {scanConfirm.kind === 'carton' ? 'Confirm box scan' : 'Confirm item scan'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              Check this scan before it is recorded. Cancel leaves it out of the GRN.
            </p>
            {scanConfirm.kind === 'verify' ? (
              <div className="rounded-lg p-3 space-y-2 text-sm" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
                {scanConfirm.boxNo && (
                  <div className="flex justify-between gap-3">
                    <span style={{ color: 'var(--text-dim)' }}>Box</span>
                    <span className="font-medium">{scanConfirm.boxNo}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-dim)' }}>Item</span>
                  <span className="font-medium text-right">{scanConfirm.itemCode}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-dim)' }}>Name</span>
                  <span className="font-medium text-right">
                    {scanConfirm.itemName || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-dim)' }}>QR</span>
                  <span className="text-right">
                    {scanConfirm.isCasePack ? 'Case pack' : 'Item'} · qty {scanConfirm.qty}
                  </span>
                </div>
                {(scanConfirm.amount ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between gap-3">
                      <span style={{ color: 'var(--text-dim)' }}>Unit price</span>
                      <span className="font-medium text-right">{money(scanConfirm.unitPrice)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span style={{ color: 'var(--text-dim)' }}>Label amount</span>
                      <span className="text-right">{money(scanConfirm.amount)}</span>
                    </div>
                  </>
                )}
                {scanConfirm.expected != null && (
                  <>
                    <div className="flex justify-between gap-3">
                      <span style={{ color: 'var(--text-dim)' }}>Expected in box</span>
                      <span>{scanConfirm.expected}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span style={{ color: 'var(--text-dim)' }}>Already scanned</span>
                      <span>{scanConfirm.already ?? 0}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span style={{ color: 'var(--text-dim)' }}>After this scan</span>
                      <span className="font-medium">
                        {(scanConfirm.already ?? 0) + scanConfirm.qty} / {scanConfirm.expected}
                        {scanConfirm.remainingAfter != null && scanConfirm.remainingAfter > 0
                          ? ` · ${scanConfirm.remainingAfter} left`
                          : ''}
                      </span>
                    </div>
                  </>
                )}
                {scanConfirm.raw !== scanConfirm.itemCode && (
                  <div className="text-xs break-all pt-1" style={{ color: 'var(--text-dim)' }}>
                    QR: {scanConfirm.raw}
                  </div>
                )}
                {(scanItemMeta?.has_batch || scanItemMeta?.expected_batch) && (
                  <div>
                    <label className="erpnext-label">Batch {scanItemMeta?.expected_batch ? `(PO ${scanItemMeta.expected_batch})` : ''}</label>
                    <input className="erpnext-input" value={batch} onChange={e => setBatch(e.target.value)} aria-label="Scanned batch" />
                  </div>
                )}
                {(scanItemMeta?.has_expiry_date || scanItemMeta?.expiry_warning) && (
                  <div>
                    <label className="erpnext-label">Expiry</label>
                    <input className="erpnext-input" type="date" value={expDate} onChange={e => setExpDate(e.target.value)} aria-label="Expiry date" />
                  </div>
                )}
                {scanItemMeta?.requires_qi && (
                  <p className="text-xs" style={{ color: 'var(--yellow-700)' }}>Item master requires QI — this line will be held.</p>
                )}
              </div>
            ) : (
              <div className="rounded-lg p-3 space-y-2 text-sm" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-dim)' }}>Box / carton</span>
                  <span className="font-medium">{scanConfirm.raw}</span>
                </div>
                {scanConfirm.cartonExpected != null && (
                  <div className="flex justify-between gap-3">
                    <span style={{ color: 'var(--text-dim)' }}>On packing list</span>
                    <span>{scanConfirm.cartonExpected ? 'Yes' : 'No — excess'}</span>
                  </div>
                )}
                {scanConfirm.cartonStatus && (
                  <div className="flex justify-between gap-3">
                    <span style={{ color: 'var(--text-dim)' }}>Current status</span>
                    <span>{scanConfirm.cartonStatus}</span>
                  </div>
                )}
                <div>
                  <label className="erpnext-label">Box condition</label>
                  <select
                    className="erpnext-input"
                    value={boxCondition}
                    aria-label="Box condition"
                    onChange={e => {
                      setBoxCondition(e.target.value)
                      setScanConfirm(prev => prev ? { ...prev, condition: e.target.value } : prev)
                    }}
                  >
                    <option value="ok">OK</option>
                    <option value="damaged">Damaged</option>
                    <option value="wet">Wet</option>
                    <option value="crushed">Crushed / torn</option>
                  </select>
                </div>
                {(scanConfirm.expected || 0) > 0 && (
                  <div>
                    <label className="erpnext-label">Physical count (label {scanConfirm.expected})</label>
                    <input
                      className="erpnext-input"
                      type="number"
                      min={0}
                      value={physicalCount}
                      onChange={e => setPhysicalCount(e.target.value)}
                      aria-label="Physical count"
                    />
                    {physicalCount !== '' && +physicalCount !== +(scanConfirm.expected || 0) && (
                      <p className="text-xs mt-1" style={{ color: 'var(--yellow-700)' }}>
                        Count differs from packing-list qty — a label mismatch will be recorded.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {scanConfirm.notOnBox && (
              <div className="text-sm px-3 py-2 rounded-lg" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ WRONG ITEM — {scanConfirm.itemCode} is not expected in {scanConfirm.boxNo || 'this box'}. Confirm only to log an exception; it will not be accepted against the box.
              </div>
            )}
            {scanConfirm.overscan && (
              <div className="text-sm px-3 py-2 rounded-lg" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ EXCESS — qty exceeds remaining expected ({scanConfirm.remaining} left). Excess will not silently become accepted stock.
              </div>
            )}
            {scanConfirm.kind === 'carton' && scanConfirm.cartonExpected === false && !scanConfirm.cartonDuplicate && (
              <div className="text-sm px-3 py-2 rounded-lg" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ EXCESS BOX — this box is not on the packing list. Confirming records an exception.
              </div>
            )}
            {scanConfirm.kind === 'carton' && scanConfirm.cartonDuplicate && (
              <div className="text-sm px-3 py-2 rounded-lg" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ BOX ALREADY SCANNED — {scanConfirm.raw}. Confirming records a duplicate event. Quantity will not be counted twice.
              </div>
            )}
            {scanConfirm.kind === 'verify' && scanItemMeta?.expiry_warning && (
              <div className="text-sm px-3 py-2 rounded-lg" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ EXPIRED / SHORT SHELF LIFE — {scanItemMeta.expiry_warning}. Confirming records a QI hold.
              </div>
            )}
            {scanConfirm.kind === 'verify' && scanItemMeta?.batch_warning && (
              <div className="text-sm px-3 py-2 rounded-lg" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ WRONG BATCH — {scanItemMeta.batch_warning}.
              </div>
            )}
            {scanConfirm.kind === 'carton' && isInvalidBoxBarcode(scanConfirm.raw) && (
              <div className="text-sm px-3 py-2 rounded-lg" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ INVALID BARCODE — {scanConfirm.raw} is not a valid box ID. Confirming will not create a box.
              </div>
            )}
            {scanConfirm.kind === 'carton' && boxCondition !== 'ok' && (
              <div className="text-sm px-3 py-2 rounded-lg" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ DAMAGED BOX — condition {boxCondition}. Confirming creates a damage exception.
              </div>
            )}
            <div className="flex gap-2">
              <button
                className="erpnext-btn-primary flex-1"
                autoFocus
                disabled={scanConfirmBusy}
                onClick={() => { void commitScanConfirm() }}
              >
                {scanConfirmBusy ? 'Recording…' : 'Confirm & record'}
              </button>
              <button
                className="erpnext-btn-secondary"
                disabled={scanConfirmBusy}
                onClick={() => dismissScanConfirm(true)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {completeMaster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="erpnext-card w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4 p-6 space-y-4" style={{ background: 'var(--panel)' }}>
            <h2 className="text-xl font-semibold">Complete Product Master</h2>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              New part <strong>{completeMaster.code}</strong> — fill details before receiving.
            </p>
            <ProductMasterFields form={cmForm} setForm={setCmForm} locations={cmLocations} />
            <div className="flex gap-2">
              <button className="erpnext-btn-primary flex-1" onClick={saveCompleteMaster}>Save & continue</button>
              <button className="erpnext-btn-secondary" onClick={() => setCompleteMaster(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-head">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>GRN (Inward)</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Home › Inward › GRN{session?.session_no ? ` › ${session.session_no}` : ''}
          </p>
        </div>
        <div className="page-actions">
          <div className="page-actions-field">
            <label className="erpnext-label">Warehouse</label>
            <select className="erpnext-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>{w.code}</option>
              ))}
            </select>
          </div>
          {session ? (
            <>
              <button
                onClick={() => { setScanTarget('carton'); setShowScanner(true) }}
                className="erpnext-btn-secondary"
                aria-label="Scan box"
              >
                Scan box
              </button>
              <button
                onClick={() => { setScanTarget('verify'); setShowScanner(true) }}
                className="erpnext-btn-secondary"
                aria-label="Scan item"
              >
                Scan item
              </button>
            </>
          ) : (
            <button
              disabled
              className="erpnext-btn-secondary"
              title="Open a GRN session first, then scan boxes or items"
              aria-label="Scan box or item (open a GRN first)"
            >
              Scan box / item
            </button>
          )}
          <button onClick={() => createBlankSession(true)} disabled={loading || !canSaveDraft} className="erpnext-btn-secondary" title={canSaveDraft ? 'Save truck arrival as draft' : 'Enter truck or invoice first'}>
            Save draft
          </button>
          <button onClick={() => createBlankSession(false)} disabled={loading} className="erpnext-btn-secondary">
            + Blank Session
          </button>
        </div>
      </div>

      {!session && (
        <div className="erpnext-card grn-start-card p-4 space-y-4">
          <details className="grn-help">
            <summary>How receiving works</summary>
            <div className="grn-help-body">
              <p>Start with the arrival details below. After saving, scan boxes and verify the items before completing the receipt.</p>
              <div className="flex flex-wrap gap-2 items-center" aria-label="GRN workflow progress">
                {STEPS.map((st, i) => (
                  <div key={st.key} className="flex items-center gap-2 text-xs">
                    <span className="erpnext-badge" style={{ background: 'var(--panel-2)', color: 'var(--text-dim)' }}>
                      {i + 1}. {st.label}
                    </span>
                    {i < STEPS.length - 1 && <span style={{ color: 'var(--text-dim)' }}>→</span>}
                  </div>
                ))}
              </div>
            </div>
          </details>
          <div className="text-sm font-medium">Truck arrival / receiving options</div>
          <div className="grn-arrival-grid">
            <div>
              <label className="erpnext-label" htmlFor="grn-receiving-mode">Receiving mode</label>
              <select
                id="grn-receiving-mode"
                className="erpnext-input"
                value={receivingMode}
                aria-label="Receiving mode"
                onChange={e => {
                  setReceivingMode(e.target.value as 'packing_list' | 'invoice_only')
                }}
              >
                <option value="packing_list">Packing list available</option>
                <option value="invoice_only">Invoice only (no packing list)</option>
              </select>
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                {receivingMode === 'packing_list'
                  ? 'Supplier sent a packing list — system knows which items are in which box.'
                  : 'Only invoices are available — boxes are counted first, then items are checked as a total.'}
              </p>
              <button
                type="button"
                className="erpnext-btn-secondary text-xs mt-2"
                aria-label="No packing list provided"
                onClick={() => setReceivingMode('invoice_only')}
              >
                No packing list provided
              </button>
            </div>
            <div>
              <label className="erpnext-label" htmlFor="grn-truck">Truck no</label>
              <TruckAutocomplete
                id="grn-truck"
                ariaLabel="Truck number"
                value={truckNo}
                onChangeText={setTruckNo}
                onSelect={row => {
                  setTruckNo(row.truck_no)
                  if (row.driver_name && !driverName) setDriverName(row.driver_name)
                  if (row.driver_phone && !driverPhone) setDriverPhone(row.driver_phone)
                }}
                placeholder="Type truck no or name"
              />
            </div>
            <div>
              <label className="erpnext-label">Driver</label>
              <input className="erpnext-input" value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver name" />
            </div>
            <div>
              <label className="erpnext-label" htmlFor="grn-arrival">Arrival</label>
              <input
                id="grn-arrival"
                className="erpnext-input"
                type="datetime-local"
                value={arrivalAt}
                onChange={e => setArrivalAt(e.target.value)}
                aria-label="Arrival date and time"
              />
            </div>
            <div>
              <label className="erpnext-label">Expected boxes</label>
              <input className="erpnext-input" type="number" min={0} value={expectedBoxes} onChange={e => setExpectedBoxes(e.target.value)} placeholder="0" aria-label="Expected boxes" />
            </div>
            <div className="md:col-span-2">
              <label className="erpnext-label">Invoice numbers</label>
              <div className="space-y-2">
                {invoiceRows.map((row, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      className="erpnext-input"
                      value={row}
                      onChange={e => {
                        const next = [...invoiceRows]
                        next[idx] = e.target.value
                        setInvoiceRows(next)
                        setInvoiceNos(next.map(s => s.trim()).filter(Boolean).join(', '))
                      }}
                      placeholder={`Invoice ${idx + 1}`}
                      aria-label={`Invoice number ${idx + 1}`}
                    />
                    {invoiceRows.length > 1 && (
                      <button type="button" className="erpnext-btn-secondary text-xs" onClick={() => {
                        const next = invoiceRows.filter((_, i) => i !== idx)
                        setInvoiceRows(next.length ? next : [''])
                        setInvoiceNos(next.map(s => s.trim()).filter(Boolean).join(', '))
                      }}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" className="erpnext-btn-secondary text-xs" onClick={() => setInvoiceRows([...invoiceRows, ''])}>
                  + Add invoice
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" checked={invoiceToFollow} onChange={e => {
                  setInvoiceToFollow(e.target.checked)
                  if (e.target.checked && !joinedInvoices()) setInvoiceRows(['INVOICE-TO-FOLLOW'])
                }} />
                Invoice to follow
              </label>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" checked={documentsToFollow} onChange={e => setDocumentsToFollow(e.target.checked)} />
                Documents to follow (driver has no papers)
              </label>
            </div>
          </div>
          <details className="grn-more-fields">
            <summary>More receiving details</summary>
            <div className="grn-secondary-grid">
              <div>
                <label className="erpnext-label">Driver phone</label>
                <input className="erpnext-input" value={driverPhone} onChange={e => setDriverPhone(e.target.value)} placeholder="Phone" />
              </div>
              <div>
                <label className="erpnext-label">PO scheduled delivery</label>
                <input className="erpnext-input" type="datetime-local" value={expectedDeliveryAt} onChange={e => setExpectedDeliveryAt(e.target.value)} aria-label="PO scheduled delivery" />
              </div>
              <div>
                <label className="erpnext-label">Supplier barcode</label>
                <div className="flex gap-2">
                  <input
                    className="erpnext-input flex-1"
                    value={supplierBarcode}
                    onChange={e => setSupplierBarcode(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void scanSupplierCode(supplierBarcode) } }}
                    placeholder="Scan from delivery docs"
                    aria-label="Supplier barcode"
                  />
                  <button
                    type="button"
                    className="erpnext-btn-secondary text-xs"
                    onClick={() => { setScanTarget('supplier'); setShowScanner(true) }}
                    aria-label="Scan supplier barcode"
                  >
                    📷
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" onChange={e => {
                  if (e.target.checked) setExpectedDeliveryAt('')
                }} />
                Unscheduled delivery
              </label>
            </div>
          </details>
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
                <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
                  Choose one PO, or select several for the same truck — each PO gets its own GRN
                </p>
                {pickedPOIds.length > 0 && (
                  <button
                    className="erpnext-btn-primary text-xs mt-3"
                    disabled={loading}
                    onClick={() => createSessionsFromPOs(pickedPOs)}
                  >
                    Start receiving {pickedPOIds.length} PO{pickedPOIds.length > 1 ? 's' : ''} on this truck
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3">
                <ListPager pager={poPager} placeholder="Search PO, supplier…" />
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr style={{ background: 'var(--panel-2)' }}>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Select all POs"
                          checked={pos.length > 0 && pickedPOIds.length === pos.length}
                          onChange={e => setPickedPOIds(e.target.checked ? pos.map((p: any) => p.id) : [])}
                        />
                      </th>
                      <th>PO No</th>
                      <th>Supplier</th>
                      <th>Status</th>
                      <th className="text-right">Items</th>
                      <th className="text-right">Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poPager.pageItems.map((po: any) => (
                      <tr key={po.id} className="hover:opacity-90">
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${po.name}`}
                            checked={pickedPOIds.includes(po.id)}
                            onChange={e => setPickedPOIds(ids => e.target.checked ? [...ids, po.id] : ids.filter(id => id !== po.id))}
                          />
                        </td>
                        <td className="font-medium" style={{ color: 'var(--accent)' }}>{po.name}</td>
                        <td>{po.supplier_name}</td>
                        <td>{statusBadge(po.status, 'po')}</td>
                        <td className="text-right">{po.item_count ?? po.total_qty ?? 0}</td>
                        <td className="text-right font-medium">{Number(po.grand_total || 0).toFixed(2)}</td>
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
              <div className="flex gap-2 flex-wrap mt-3 items-center">
                {([
                  ['all', 'All sessions'],
                  ['in_progress', 'In progress'],
                  ['verify', 'Awaiting verify'],
                  ['exceptions', 'Exception sessions'],
                  ['followups', 'Follow-up sessions'],
                  ['completed', 'Completed'],
                ] as const).map(([k, label]) => (
                  <button key={k} className={`erpnext-btn-secondary text-xs ${dashFilter === k ? 'erpnext-btn-primary' : ''}`}
                    onClick={() => setDashFilter(k)}>{label}</button>
                ))}
                <Link to="/exceptions" className="erpnext-btn-primary text-xs">Open Exceptions page</Link>
                <Link to="/follow-up" className="erpnext-btn-secondary text-xs">Open Follow-Up Receipts</Link>
                <Link to="/grn-audit" className="erpnext-btn-secondary text-xs">Open Random Audit</Link>
              </div>
              <div className="mt-3">
                <ListPager pager={sessionPager} placeholder="Search GRN, PO, supplier, truck" />
              </div>
              {truckGroups.length > 0 && (
                <div className="mt-3 text-xs space-y-1" style={{ color: 'var(--text-dim)' }}>
                  <div className="font-medium" style={{ color: 'var(--text)' }}>Same-truck receipts</div>
                  {truckGroups.map(([truck, list]) => (
                    <div key={truck}>
                      Truck {truck}: {list.map((s: any) => `${s.session_no} (${s.purchase_receipt_no || 'no PO'})`).join(' · ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 space-y-3">
              <table className="erpnext-table">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Session No</th>
                    <th>Supplier</th>
                    <th>PO</th>
                    <th>Truck</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionPager.pageItems.map((s: any) => (
                    <tr key={s.id} className="hover:opacity-90">
                      <td className="font-medium" style={{ color: 'var(--accent)' }}>{s.session_no}</td>
                      <td>{s.supplier || '-'}</td>
                      <td>{s.purchase_receipt_no || '-'}</td>
                      <td>{s.truck_no || '-'}</td>
                      <td>{statusBadge(s.status)}</td>
                      <td>{new Date(s.created_at).toLocaleDateString()}</td>
                      <td>
                        <button onClick={() => openSession(s.id)} className="erpnext-btn-secondary text-xs">Open</button>
                      </td>
                    </tr>
                  ))}
                  {sessionPager.total === 0 && (
                    <tr><td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-dim)' }}>No sessions yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="erpnext-card">
            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Putaway</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
                  Put-away is a separate downstream process after GRN is completed
                </p>
              </div>
              <Link to="/putaway" className="erpnext-btn-secondary text-sm">Open Putaway →</Link>
            </div>
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
                    {session.truck_no ? ` · Truck ${session.truck_no}` : ''}
                  </p>
                )}
                <div className="mt-1">{statusBadge(session.status)}</div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={completeVerification} className="erpnext-btn-secondary">Complete verify</button>
                {isSupervisor && (
                  <>
                    <button onClick={() => finalizeSession(false)} className="erpnext-btn-primary">Finalize GRN</button>
                    <button onClick={() => finalizeSession(true)} className="erpnext-btn-secondary text-xs">Force finalize</button>
                  </>
                )}
                <button onClick={() => { setSession(null); setSelectedPO(null); navigate('/grn') }} className="erpnext-btn-secondary">← Back</button>
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
                {specStatusLabel(session.status)} · Mode: {session.receiving_mode || 'packing_list'}
                {session.truck_no ? ` · Truck ${session.truck_no}` : ''}
              </span>
            </div>

            <div className="px-6 py-3 border-b grid grid-cols-2 md:grid-cols-4 gap-3 text-sm" style={{ borderColor: 'var(--border)' }} aria-label="Expected versus received">
              <div>
                <div style={{ color: 'var(--text-dim)' }}>Boxes received / expected</div>
                <div className="font-medium">{receivedBoxCount} / {expectedBoxCount ?? '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-dim)' }}>Items scanned / expected</div>
                <div className="font-medium">{receivedItemQty} / {expectedItemQty || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-dim)' }}>Shortage</div>
                <div className="font-medium" style={{ color: shortItemQty > 0 ? 'var(--red)' : undefined }}>{shortItemQty}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-dim)' }}>Excess</div>
                <div className="font-medium">{excessItemQty}</div>
              </div>
            </div>
            {manualEntryMode && (
              <div className="px-6 py-2 text-sm" role="status" style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--border)' }}>
                <div className="font-semibold">Scanner not working — manual entry</div>
                Type box and item IDs into the scan fields. Barcode camera is optional.
              </div>
            )}
            {offlineMode && (
              <div className="px-6 py-2 text-sm" role="status" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                <div className="font-semibold">⚠ SYSTEM DOWN — paper / offline fallback</div>
                Record scans on paper or keep this tab open. Replay when the WMS is back. Do not assume a timed-out scan counted.
              </div>
            )}
            {operators.filter((o: any) => !o.is_self).length > 0 && (
              <div className="px-6 py-2 text-sm" role="status" style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--border)' }}>
                <div className="font-semibold">Concurrent receiving</div>
                Also open: {operators.filter((o: any) => !o.is_self).map((o: any) => o.username).join(', ')}.
                Scans from both operators are recorded as events. This GRN is not exclusive-locked.
              </div>
            )}
            {exceptionAlert && (
              <div className="px-6 py-3 text-sm" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)', borderBottom: '1px solid var(--border)' }}>
                <div className="font-semibold">{exceptionAlert.title}</div>
                <div>{exceptionAlert.detail}</div>
                <button className="erpnext-btn-secondary text-xs mt-2" onClick={() => { setExceptionAlert(null); setGrnTab('exceptions') }}>
                  Open exceptions
                </button>
              </div>
            )}
            {lastScanFeedback && !exceptionAlert && (
              <div className="px-6 py-2 text-sm" style={{ background: 'rgba(22,163,74,0.06)', color: 'var(--green)' }}>
                {lastScanFeedback}
              </div>
            )}
            {(boxSummary?.missing_boxes ?? 0) > 0 && (
              <div className="px-6 py-2 text-sm" role="status" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ MISSING BOXES: {boxSummary.missing_boxes} expected box(es) not received.
                {boxSummary.boxes?.filter((b: any) => ['missing', 'expected', 'pending'].includes(String(b.status).toLowerCase())).map((b: any) => ` ${b.carton_no}`).join(',') || ''}
              </div>
            )}
            {(boxSummary?.excess_boxes ?? 0) > 0 && !exceptionAlert && (
              <div className="px-6 py-2 text-sm" role="status" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                ⚠ EXCESS BOX: {boxSummary.excess_boxes} unexpected box(es) on this GRN.
              </div>
            )}
            {shortItemQty > 0 && (
              <div className="px-6 py-2 text-sm" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }} role="status">
                Shortage detected: received {receivedItemQty} of {expectedItemQty} expected. Complete verify to raise a shortage exception.
              </div>
            )}
            {(itemSummary?.net_offset || (shortItemQty > 0 && excessItemQty > 0)) && (
              <div className="px-6 py-2 text-sm" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }} role="status">
                Net quantity can match while one part is short and another is excess. Each part is reconciled independently — shortage and excess are both recorded.
              </div>
            )}

            {/* Tabs */}
            <div className="px-6 pt-3 flex gap-2 flex-wrap border-b" style={{ borderColor: 'var(--border)' }}>
              {(['overview', 'boxes', 'items', 'exceptions', 'audit', 'checks', ...(isSupervisor ? ['activity'] as const : [])] as const).map(t => (
                <button
                  key={t}
                  className={`erpnext-btn-secondary text-xs ${grnTab === t ? 'erpnext-btn-primary' : ''}`}
                  onClick={() => { setGrnTab(t); if (session?.id) refreshWorkspace(session.id) }}
                >
                  {t === 'audit' ? 'AUDIT' : t === 'checks' ? 'CHECKS' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {grnTab === 'overview' && (
              <div className="p-6 space-y-4">
                {session.receiving_mode === 'invoice_only' && (
                  <div className="text-sm px-3 py-2 rounded-lg" role="status" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
                    <div className="font-semibold">Invoice-only receiving</div>
                    Boxes are counted separately. Item verification is against invoice totals — there is no box-to-item packing list.
                  </div>
                )}
                {docCompare?.mismatch && (
                  <div className="text-sm px-3 py-2 rounded-lg" role="alert" style={{ background: 'var(--yellow-50)', color: 'var(--yellow-700)' }}>
                    Document quantities do not match the PO. Open CHECKS for the part-by-part comparison.
                    <button className="erpnext-btn-secondary text-xs ml-2" onClick={() => setGrnTab('checks')}>Open CHECKS</button>
                  </div>
                )}
                {session.is_followup && (
                  <div className="text-sm px-3 py-2 rounded-lg" role="status" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
                    <div className="font-semibold">FOLLOW-UP RECEIPT</div>
                    Linked to original GRN {session.parent_session_no || (session.parent_grn_id ? `#${session.parent_grn_id}` : '')}. Scan remaining short / missing material here.
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><div style={{ color: 'var(--text-dim)' }}>Status</div><div className="font-medium">{specStatusLabel(session.status)}</div></div>
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
                  <button className="erpnext-btn-secondary text-xs" onClick={createFollowUp}>Create follow-up GRN</button>
                  {isSupervisor && (
                    <>
                      <button className="erpnext-btn-secondary text-xs" onClick={startAudit}>Start physical audit</button>
                      <button className="erpnext-btn-primary text-xs" onClick={() => finalizeSession(false)}>Finalize</button>
                      <button className="erpnext-btn-secondary text-xs" onClick={async () => {
                        const r = await api.grnCompletePutaway(session.id)
                        if (r.ok) {
                          notify({ type: 'success', title: 'Put-away completed', message: session.session_no })
                          reloadSession(session.id)
                        } else {
                          notify({ type: 'error', title: 'Put-away complete failed', message: r.error || '' })
                        }
                      }}>Complete put-away</button>
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
                  <label className="erpnext-btn-secondary text-xs" style={{ cursor: 'pointer' }}>
                    {session.arrival_attachment_id ? 'Replace arrival doc' : 'Arrival document'}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      style={{ display: 'none' }}
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file || !session) return
                        const up = await api.attachmentUpload('grn', session.id, file)
                        if (!up.ok) {
                          notify({ type: 'error', title: 'Upload failed', message: up.error || '' })
                          return
                        }
                        const r = await api.grnSupportingDoc(session.id, up.data.id)
                        if (r.ok) {
                          notify({ type: 'success', title: 'Arrival document attached', message: file.name })
                          reloadSession(session.id)
                        } else {
                          notify({ type: 'error', title: 'Attach failed', message: r.error || '' })
                        }
                      }}
                    />
                  </label>
                  {session.arrival_attachment_id ? (
                    <a className="text-xs" style={{ color: 'var(--accent)' }} href={api.attachmentUrl(session.arrival_attachment_id)} target="_blank" rel="noreferrer">
                      View arrival doc
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
                {(itemSummary?.parts?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Part-level reconciliation</h3>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
                      Same part in multiple boxes is verified per box, then totalled. Net quantity can match while one part is short and another is excess.
                    </p>
                    <div className="space-y-3">
                      {itemSummary.parts.map((p: any) => (
                        <div key={p.part_no} className="rounded-lg p-3 text-sm" style={{ border: '1px solid var(--border)' }}>
                          <div className="flex justify-between font-medium mb-1">
                            <span>{p.part_no}</span>
                            <span>
                              TOTAL → {p.scanned_qty} / {p.expected_qty} {p.ok ? '✓' : '⚠'}
                            </span>
                          </div>
                          <table className="erpnext-table text-xs">
                            <thead>
                              <tr><th>Box</th><th className="text-right">Expected</th><th className="text-right">Scanned</th><th></th></tr>
                            </thead>
                            <tbody>
                              {(p.boxes || []).map((b: any) => (
                                <tr key={`${p.part_no}-${b.box_no}`}>
                                  <td>{b.box_no}</td>
                                  <td className="text-right">{b.expected_qty}</td>
                                  <td className="text-right">{b.scanned_qty}</td>
                                  <td>{b.ok ? '✓' : (b.status || '').toUpperCase()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
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
                <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">Exceptions on this GRN</h3>
                  <Link to="/exceptions" className="erpnext-btn-secondary text-xs">Open Exceptions page</Link>
                </div>
                <ListPager pager={exceptionPager} placeholder="Search exceptions…" />
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr style={{ background: 'var(--panel-2)' }}>
                      <th>Type</th><th>Box</th><th>Part</th><th>Expected</th><th>Scanned</th><th>Status</th><th>Evidence</th><th>When</th><th>Resolve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptionPager.pageItems.map((ex: any) => (
                      <tr key={ex.id}>
                        <td>{ex.exception_type}</td>
                        <td>{ex.box_no || '—'}</td>
                        <td>{ex.part_no || '—'}</td>
                        <td>{ex.expected_qty ?? '—'}</td>
                        <td>{ex.scanned_qty ?? '—'}</td>
                        <td>{ex.status}</td>
                        <td>
                          <div className="flex gap-1 items-center flex-wrap">
                            <span style={{ color: 'var(--text-dim)' }}>{ex.evidence_count || 0}</span>
                            {exceptionNeedsCOA(ex.exception_type) && (ex.status === 'open' || ex.status === 'pending') && (
                              <FileCapture label="Upload COA" accept="application/pdf,image/*" onFile={f => void uploadCOA(f)} />
                            )}
                            {exceptionNeedsPhoto(ex.exception_type) && (
                              <FileCapture label="📷 Photo" accept="image/*" capture onFile={f => void uploadEvidence(ex.id, f)} />
                            )}
                          </div>
                        </td>
                        <td>{ex.created_at?.slice(0, 19)}</td>
                        <td>
                          {ex.status === 'open' || ex.status === 'pending' ? (
                            <div className="flex gap-1 items-center">
                              <input
                                className="erpnext-input text-xs min-w-0"
                                style={{ width: 120, maxWidth: '40vw' }}
                                placeholder="Resolution…"
                                value={resolveText[ex.id] || ''}
                                onChange={e => setResolveText(prev => ({ ...prev, [ex.id]: e.target.value }))}
                              />
                              <button className="erpnext-btn-secondary text-xs" onClick={() => resolveExc(ex.id)}>Resolve</button>
                              {(String(ex.exception_type || '').toLowerCase().includes('shortage')
                                || String(ex.exception_type || '').toLowerCase().includes('missing')) && (
                                <button
                                  className="erpnext-btn-primary text-xs"
                                  onClick={async () => {
                                    const r = await api.grnResolveException(ex.id, {
                                      resolution: resolveText[ex.id] || 'Supplier will send remaining material later',
                                      create_followup: true,
                                    })
                                    if (r.ok) {
                                      notify({
                                        type: 'success',
                                        title: 'FOLLOW-UP RECEIPT created',
                                        message: r.data?.followup_session_no || 'linked to original GRN',
                                      })
                                      if (r.data?.followup_id) openSession(r.data.followup_id)
                                      else refreshWorkspace(session.id)
                                    } else {
                                      notify({ type: 'error', title: 'Follow-up failed', message: r.error || '' })
                                    }
                                  }}
                                >
                                  Supplier will send later
                                </button>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-dim)' }}>{ex.resolution || '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {exceptions.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No exceptions</td></tr>
                    )}
                  </tbody>
                </table>
                {isSupervisor && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <div>
                      <label className="erpnext-label">Other discrepancy</label>
                      <input className="erpnext-input" placeholder="Box" value={otherExc.box_no}
                        onChange={e => setOtherExc(p => ({ ...p, box_no: e.target.value }))} />
                    </div>
                    <div>
                      <label className="erpnext-label">Part</label>
                      <input className="erpnext-input" placeholder="Part no" value={otherExc.part_no}
                        onChange={e => setOtherExc(p => ({ ...p, part_no: e.target.value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="erpnext-label">Notes</label>
                      <div className="flex gap-2">
                        <input className="erpnext-input flex-1" placeholder="Describe the discrepancy"
                          value={otherExc.notes} onChange={e => setOtherExc(p => ({ ...p, notes: e.target.value }))} />
                        <button className="erpnext-btn-secondary text-xs" onClick={async () => {
                          const r = await api.grnCreateException(session.id, {
                            exception_type: 'other', box_no: otherExc.box_no, part_no: otherExc.part_no, notes: otherExc.notes,
                          })
                          if (r.ok) {
                            notify({ type: 'success', title: 'Exception logged', message: 'other' })
                            setOtherExc({ box_no: '', part_no: '', notes: '' })
                            refreshWorkspace(session.id)
                          } else {
                            notify({ type: 'error', title: 'Could not log', message: r.error || '' })
                          }
                        }}>Log other</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {grnTab === 'audit' && (
              <div className="p-6 space-y-4">
                <h3 className="text-sm font-semibold">AUDIT</h3>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Random physical verification: 5 / 10 / 20 / Custom items. START AUDIT selects parts from this GRN.
                </p>
                <div className="flex gap-2 items-end flex-wrap">
                  <div>
                    <label className="erpnext-label">Sample size</label>
                    <div className="flex gap-2">
                      {[5, 10, 20].map(n => (
                        <button key={n} className={`erpnext-btn-secondary text-xs ${auditSample === n ? 'erpnext-btn-primary' : ''}`}
                          onClick={() => { setAuditSample(n); setAuditCustom('') }}>{n}</button>
                      ))}
                      <input className="erpnext-input" style={{ width: 80 }} type="number" min={1} max={100}
                        placeholder="Custom" value={auditCustom}
                        onChange={e => { setAuditCustom(e.target.value); if (+e.target.value > 0) setAuditSample(+e.target.value) }} />
                    </div>
                  </div>
                  <button className="erpnext-btn-primary text-xs" onClick={startAudit}>START AUDIT</button>
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
                            <td>{it.result === 'pass' ? '✓ PASS' : it.result === 'fail' ? '⚠ FAIL' : (it.result || '—')}</td>
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
                      <th>Time</th><th>Event</th><th>Box</th><th>Part</th><th>Result</th><th>User</th><th>Device</th>
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
                        <td className="text-xs" style={{ color: 'var(--text-dim)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.device || '—'}</td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No events yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {grnTab === 'checks' && (
              <div className="p-6 space-y-6">
                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">PO vs packing list vs invoice</h3>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Line-level comparison. Mismatches are flagged automatically on packing-list import and invoice seed.
                  </p>
                  {docCompare?.lines?.length ? (
                    <div className="overflow-x-auto">
                      <table className="erpnext-table text-sm">
                        <thead>
                          <tr style={{ background: 'var(--panel-2)' }}>
                            <th>Part</th>
                            <th className="text-right">PO qty</th>
                            <th className="text-right">Packing list</th>
                            <th className="text-right">Invoice</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docCompare.lines.map((ln: any) => (
                            <tr key={ln.part_no}>
                              <td className="font-medium">{ln.part_no}</td>
                              <td className="text-right">{ln.po_qty}</td>
                              <td className="text-right">{ln.packing_list_qty}</td>
                              <td className="text-right">{ln.invoice_qty}</td>
                              <td>
                                <span className={`erpnext-badge ${ln.status === 'match' ? 'erpnext-badge-green' : 'erpnext-badge-yellow'}`}>
                                  {String(ln.status || '').replace(/_/g, ' ')}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Import a packing list or seed invoice expected lines to compare against the PO.</p>
                  )}
                </div>
                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">Documentation issues</h3>
                  <div className="flex flex-wrap gap-2">
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('invoice_po_mismatch')} aria-label="Invoice does not match PO">Invoice does not match PO</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('invoice_packing_list_mismatch')} aria-label="Invoice does not match packing list">Invoice does not match packing list</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('wrong_po_referenced')} aria-label="Wrong PO referenced">Wrong PO referenced</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('missing_delivery_note')} aria-label="Missing delivery note">Missing delivery note / challan</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('handwritten_docs')} aria-label="Handwritten unclear documents">Handwritten / unclear documents</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('multiple_invoices')} aria-label="Multiple invoices for one shipment">Multiple invoices for one shipment</button>
                  </div>
                </div>
                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">Quality / inspection</h3>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Fail QI, expiry, wrong batch, missing COA, contamination, cold-chain break, and recalls. These hold stock — they do not become available inventory.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="erpnext-label">Expected batch / lot</label>
                      <input className="erpnext-input" value={expectedBatch} onChange={e => setExpectedBatch(e.target.value)} placeholder="LOT-001" aria-label="Expected batch" />
                    </div>
                    <div>
                      <label className="erpnext-label">Expiry</label>
                      <input className="erpnext-input" type="date" value={expDate} onChange={e => setExpDate(e.target.value)} aria-label="Expiry date" />
                    </div>
                    <div>
                      <label className="erpnext-label">Part</label>
                      <ItemAutocomplete
                        value={discPart}
                        onSelect={(found) => setDiscPart(found.code)}
                        onChangeText={setDiscPart}
                        placeholder={verifyItemCode || 'PART'}
                        className="erpnext-input"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('quality_fail')} aria-label="Items fail quality check">Items fail quality check</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('expired', { notes: expDate })} aria-label="Expired items">Expired items</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('wrong_batch', { notes: expectedBatch })} aria-label="Wrong batch lot number">Wrong batch / lot number</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('missing_coa')} aria-label="Missing certifications">Missing certifications / COA</button>
                    <FileCapture
                      label="COA arrived — upload"
                      accept="application/pdf,image/*"
                      onFile={f => void uploadCOA(f)}
                    />
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('contaminated')} aria-label="Contaminated items">Contaminated items</button>
                    <FileCapture
                      label="📷 Contamination photo"
                      accept="image/*"
                      capture
                      onFile={f => void reportThenPhoto('contaminated', f)}
                    />
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('cold_chain')} aria-label="Cold chain break">Temperature-sensitive arrived wrong</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('recalled')} aria-label="Items recalled">Items recalled — quarantine</button>
                    <Link to="/qi" className="erpnext-btn-secondary text-xs">Open Quality Inspection</Link>
                  </div>
                </div>

                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">Supplier / logistics</h3>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Early/late vs PO schedule and outside warehouse receiving hours are auto-flagged when you start receiving. Scan the supplier barcode on delivery documents to catch a wrong supplier immediately.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="erpnext-label">Expected supplier</label>
                      <input className="erpnext-input" value={expectedSupplier} onChange={e => setExpectedSupplier(e.target.value)} placeholder={session.supplier_name || 'Supplier A'} />
                    </div>
                    <div>
                      <label className="erpnext-label">PO scheduled delivery</label>
                      <input className="erpnext-input" type="datetime-local" value={expectedDeliveryAt} onChange={e => setExpectedDeliveryAt(e.target.value)} aria-label="PO scheduled delivery" />
                    </div>
                    <div>
                      <label className="erpnext-label">Supplier barcode on docs</label>
                      <div className="flex gap-2">
                        <input
                          className="erpnext-input flex-1"
                          value={supplierBarcode}
                          onChange={e => setSupplierBarcode(e.target.value)}
                          placeholder="Scan or type"
                          aria-label="Supplier barcode on documents"
                        />
                        <button
                          type="button"
                          className="erpnext-btn-secondary text-xs"
                          onClick={() => { setScanTarget('supplier'); setShowScanner(true) }}
                        >
                          📷
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="erpnext-btn-primary text-xs" disabled={!supplierBarcode.trim()} onClick={() => void scanSupplierCode(supplierBarcode)}>Validate supplier barcode</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('wrong_supplier', { notes: expectedSupplier })} aria-label="Wrong supplier delivers">Wrong supplier delivers</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('unscheduled_delivery')} aria-label="Unscheduled delivery">Unscheduled delivery</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('early_delivery', { notes: expectedDeliveryAt })} aria-label="Early delivery">Early delivery</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('late_delivery', { notes: expectedDeliveryAt })} aria-label="Late delivery">Late delivery</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('split_truck')} aria-label="Multiple trucks same PO">Multiple trucks, same PO</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('outside_hours')} aria-label="Truck arrives outside operating hours">Truck arrives outside operating hours</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('driver_no_docs')} aria-label="Driver has no documents">Driver has no documents</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('rejected_truck_return')} aria-label="Rejected truck returns">Rejected truck returns</button>
                  </div>
                </div>

                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">System / process</h3>
                  <div className="flex flex-wrap gap-2">
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('scanner_down')} aria-label="Scanner not working">Scanner not working</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('system_offline')} aria-label="System down during receiving">System down during receiving</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('network_timeout')} aria-label="Network timeout mid-scan">Network timeout mid-scan</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('concurrent_ops')} aria-label="Concurrent receiving">Concurrent receiving</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('undo_last_box')} aria-label="Undo last box scan">Undo last box scan</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('double_scan_item')} aria-label="Double scan">Double scan</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('resume_session')} aria-label="Resume interrupted session">Resume interrupted session</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('wrong_warehouse')} aria-label="Wrong warehouse selected">Wrong warehouse selected</button>
                  </div>
                  <div className="flex gap-2 items-end flex-wrap">
                    <div>
                      <label className="erpnext-label">Correct warehouse</label>
                      <select className="erpnext-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)} aria-label="Correct warehouse">
                        <option value="">—</option>
                        {warehouses.map((w: any) => (
                          <option key={w.id} value={w.id}>{w.code || w.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="erpnext-btn-primary text-xs"
                      onClick={async () => {
                        if (!session || !warehouseId) return
                        const r = await api.grnUpdate(session.id, { warehouse_id: +warehouseId })
                        if (r.ok) {
                          notify({ type: 'success', title: 'Warehouse corrected', message: warehouses.find((w: any) => String(w.id) === warehouseId)?.code || warehouseId })
                          reloadSession(session.id)
                        } else {
                          notify({ type: 'error', title: 'Warehouse update failed', message: r.error || '' })
                        }
                      }}
                    >
                      Apply warehouse
                    </button>
                  </div>
                </div>

                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">Special receiving</h3>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Return, transfer, consignment, VMI, sample, loan, hazmat, oversized, high-value, serialized. These are not silent PO receipts.
                  </p>
                  <div className="flex gap-2 flex-wrap items-end">
                    <div>
                      <label className="erpnext-label">Receiving type</label>
                      <select className="erpnext-input" value={receivingType} onChange={e => setReceivingType(e.target.value)} aria-label="Receiving type">
                        <option value="return_receipt">Return</option>
                        <option value="transfer_in">Transfer in</option>
                        <option value="consignment">Consignment</option>
                        <option value="vmi">VMI</option>
                        <option value="sample">Sample</option>
                        <option value="loan">Loan</option>
                        <option value="hazmat">Hazmat</option>
                        <option value="oversized">Oversized</option>
                        <option value="high_value">High value</option>
                        <option value="serialized">Serialized</option>
                      </select>
                    </div>
                    <button className="erpnext-btn-primary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy(receivingType)} aria-label="Set receiving type">Set receiving type</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('return_receipt')} aria-label="Return receipt">Return receipt</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('transfer_in')} aria-label="Transfer in">Transfer in</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('consignment')} aria-label="Consignment">Consignment</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('vmi')} aria-label="VMI">VMI</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('sample')} aria-label="Sample">Sample</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('loan')} aria-label="Loan">Loan</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('hazmat')} aria-label="Hazmat">Hazmat</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('oversized')} aria-label="Oversized">Oversized</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('high_value')} aria-label="High value">High value</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('serialized')} aria-label="Serialized receiving">Serialized receiving</button>
                    <Link to="/serial" className="erpnext-btn-secondary text-xs">Open Serial No</Link>
                    <Link to="/transfers" className="erpnext-btn-secondary text-xs">Open Transfers</Link>
                    <Link to="/returns" className="erpnext-btn-secondary text-xs">Open Returns</Link>
                  </div>
                </div>

                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">Post-receiving</h3>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Put-away, cross-dock, quarantine, follow-up, RMA, and stock adjustment after GRN complete.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/putaway" className="erpnext-btn-secondary text-xs">Open Putaway</Link>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('cross_dock')} aria-label="Cross-dock">Cross-dock — do not put away</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('quarantine')} aria-label="Send to quarantine">Send to quarantine</button>
                    <Link to="/follow-up" className="erpnext-btn-secondary text-xs">Open Follow-Up Receipts</Link>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('rma')} aria-label="RMA">RMA</button>
                    <Link to="/returns" className="erpnext-btn-secondary text-xs">Open RMA / Returns</Link>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('stock_adjustment')} aria-label="Stock adjustment">Stock adjustment</button>
                    <Link to="/stock-entries" className="erpnext-btn-secondary text-xs">Open Stock Entry</Link>
                    <Link to="/stock-reconciliations" className="erpnext-btn-secondary text-xs">Open Stock Reconciliation</Link>
                    <Link to="/qi" className="erpnext-btn-secondary text-xs">Open Quarantine / QI</Link>
                  </div>
                </div>
              </div>
            )}

            {/* PO Items Reference */}
            {selectedPO && selectedPO.items && selectedPO.items.length > 0 && (
              <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-3">Part-level reconciliation (PO)</h3>
                <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                  <table className="erpnext-table text-sm">
                    <thead>
                      <tr style={{ background: 'var(--panel-2)' }}>
                        <th>Item</th>
                        <th>Name</th>
                        <th className="text-right">Ordered</th>
                        <th className="text-right">Received</th>
                        <th className="text-right">Pending</th>
                        <th>Variance</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPO.items.map((pi: any) => {
                        const pending = pi.qty - (pi.received_qty || 0)
                        const variance = (pi.received_qty || 0) - pi.qty
                        return (
                          <tr key={pi.id}>
                            <td className="font-medium">{pi.item_code}</td>
                            <td>{pi.item_name}</td>
                            <td className="text-right">{pi.qty}</td>
                            <td className="text-right">{pi.received_qty || 0}</td>
                            <td className="text-right font-medium">{pending}</td>
                            <td>
                              {pending > 0 ? (
                                <span className="erpnext-badge erpnext-badge-red">SHORT {pending}</span>
                              ) : variance > 0 ? (
                                <span className="erpnext-badge erpnext-badge-yellow">EXCESS {variance}</span>
                              ) : (
                                <span className="erpnext-badge erpnext-badge-green">MATCH</span>
                              )}
                            </td>
                            <td>
                              <button onClick={() => fillFromPOItem(pi)} className="erpnext-btn-secondary text-xs">Fill</button>
                            </td>
                          </tr>
                        )
                      })}
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
                          const cmp = payload.data?.comparison
                          const mismatch = payload.data?.mismatch || cmp?.mismatch
                          notify({
                            type: mismatch ? 'warning' : 'success',
                            title: mismatch ? 'XLSX imported — packing list ≠ PO' : 'XLSX imported',
                            message: `${payload.data.cartons_created} cartons, ${payload.data.lines_created} lines${mismatch ? '. Open CHECKS for the line comparison.' : ''}`,
                          })
                          if (mismatch) {
                            setDocCompare(cmp)
                            setGrnTab('checks')
                          }
                          const refreshed = await api.grnSession(session.id)
                          if (refreshed.ok) setSession(refreshed.data)
                          await refreshWorkspace(session.id)
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
                <h3 className="text-sm font-semibold mb-3">Scan box</h3>
                <div className="flex gap-3">
                  <BoxAutocomplete
                    value={cartonNo}
                    onChangeText={setCartonNo}
                    suggestions={boxSuggestions}
                    onSelect={(row) => {
                      setCartonNo(row.carton_no)
                      requestCartonConfirm(row.carton_no)
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); requestCartonConfirm() } }}
                    placeholder="Scan or pick a box / carton ID"
                    ariaLabel="Scan box"
                  />
                  <button onClick={() => { setScanTarget('carton'); setShowScanner(true) }} className="erpnext-btn-secondary" aria-label="Open box scanner">📷 Box</button>
                  <button onClick={() => requestCartonConfirm()} className="erpnext-btn-primary">Receive Box</button>
                  <button
                    className="erpnext-btn-secondary"
                    onClick={() => { setBoxCondition('damaged'); requestCartonConfirm() }}
                    aria-label="Report damage"
                  >
                    Report damage
                  </button>
                  <FileCapture
                    label="📷 Damage photo"
                    accept="image/*"
                    capture
                    onFile={f => void reportThenPhoto('damage', f)}
                  />
                  <button onClick={finishBoxReceiving} className="erpnext-btn-secondary">Finish boxes</button>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>
                  Boxes received {receivedBoxCount}{expectedBoxCount != null ? ` of ${expectedBoxCount} expected` : ''}
                </p>
                {(boxSummary?.boxes?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Box reconciliation</h4>
                    <ListPager pager={boxPager} placeholder="Search boxes…" />
                    <table className="erpnext-table text-sm">
                      <thead>
                        <tr style={{ background: 'var(--panel-2)' }}>
                          <th>Box</th><th>Status</th><th>Expected?</th><th>Condition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boxPager.pageItems.map((b: any) => {
                          const st = String(b.status || '').toLowerCase()
                          const missing = st === 'missing' || st === 'expected' || st === 'pending'
                          const excess = st === 'excess'
                          const damaged = ['damaged', 'wet', 'crushed'].includes(String(b.condition || '').toLowerCase())
                          return (
                          <tr key={b.id}>
                            <td className="font-medium">{b.carton_no}</td>
                            <td>
                              {missing ? <span className="erpnext-badge erpnext-badge-red">MISSING</span>
                                : excess ? <span className="erpnext-badge erpnext-badge-yellow">EXCESS</span>
                                : <span className="erpnext-badge">{b.status}</span>}
                            </td>
                            <td>{b.is_expected ? 'Yes' : 'No'}</td>
                            <td>{damaged ? <span className="erpnext-badge erpnext-badge-red">{b.condition}</span> : (b.condition || 'ok')}</td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )}

              {(grnTab === 'boxes' || grnTab === 'overview') && (
                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">Box / packaging issues</h3>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Outer damage is reported at scan. Use these when the carton looks fine but contents are broken, the barcode is unknown/unreadable, the box was relabeled, has no ID, or contains nested inner boxes.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="erpnext-label">Outer (parent) box</label>
                      <BoxAutocomplete
                        value={parentCartonNo}
                        onChangeText={setParentCartonNo}
                        suggestions={boxSuggestions}
                        placeholder="Outer carton ID"
                        ariaLabel="Outer parent box"
                      />
                    </div>
                    <div>
                      <label className="erpnext-label">Inner / current box</label>
                      <BoxAutocomplete
                        value={cartonNo}
                        onChangeText={setCartonNo}
                        suggestions={boxSuggestions}
                        placeholder="Inner carton ID"
                        ariaLabel="Inner carton ID"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('internal_damage')} aria-label="Report internal damage">Report internal damage</button>
                    <FileCapture
                      label="📷 Damage photo"
                      accept="image/*"
                      capture
                      onFile={f => void reportThenPhoto('internal_damage', f)}
                    />
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('unknown_box')} aria-label="Unknown box not in system">Unknown box not in system</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('relabeled')} aria-label="Report relabeled box">Report relabeled box</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => {
                      const temp = `TEMP-BOX-${session.id}-${Date.now().toString().slice(-6)}`
                      setCartonNo(temp)
                      reportDiscrepancy('no_box_id', { box_no: temp })
                    }} aria-label="Assign temporary box ID">Assign temporary box ID</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('damaged_barcode')} aria-label="Barcode unreadable enter ID manually">Barcode unreadable — enter ID manually</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('nested_box', { other_po: parentCartonNo, box_no: cartonNo })} aria-label="Scan nested inner box">Scan nested inner box</button>
                  </div>
                </div>
              )}

              {(grnTab === 'boxes' || grnTab === 'overview' || grnTab === 'items') && (
                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">Documentation issues</h3>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Missing packing list, invoice to follow, packing list vs PO, and packing list vs physical count.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('no_packing_list')} aria-label="No packing list provided">No packing list provided</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('no_invoice')} aria-label="Invoice to follow">Invoice to follow</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('packing_list_po_mismatch')} aria-label="Validate packing list vs PO">Validate packing list vs PO</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('packing_list_physical_mismatch')} aria-label="Packing list does not match physical">Packing list does not match physical</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('invoice_po_mismatch')} aria-label="Invoice does not match PO">Invoice does not match PO</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('invoice_packing_list_mismatch')} aria-label="Invoice does not match packing list">Invoice does not match packing list</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('wrong_po_referenced')} aria-label="Wrong PO referenced">Wrong PO referenced</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('missing_delivery_note')} aria-label="Missing delivery note">Missing delivery note / challan</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('handwritten_docs')} aria-label="Handwritten unclear documents">Handwritten / unclear documents</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('multiple_invoices')} aria-label="Multiple invoices for one shipment">Multiple invoices for one shipment</button>
                  </div>
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
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                {session.receiving_mode === 'invoice_only' && (
                  <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--panel-2)' }}>
                    <h3 className="text-sm font-semibold">Invoice-only item verification</h3>
                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      Consolidated material — scan items against invoice totals. There is no box-to-item map.
                    </p>
                    {(invoiceExpected.length > 0 || (itemSummary?.parts?.length ?? 0) > 0) && (
                      <table className="erpnext-table text-sm">
                        <thead>
                          <tr>
                            <th>Invoice</th><th>Part</th>
                            <th className="text-right">Expected</th>
                            <th className="text-right">Scanned</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(itemSummary?.parts?.length ? itemSummary.parts : invoiceExpected.map((ln: any) => ({
                            part_no: ln.part_no, expected_qty: ln.expected_qty, scanned_qty: 0, invoice_no: ln.invoice_no, ok: false,
                          }))).map((p: any) => (
                            <tr key={p.part_no}>
                              <td>{p.invoice_no || '—'}</td>
                              <td className="font-medium">{p.part_no}</td>
                              <td className="text-right">{p.expected_qty}</td>
                              <td className="text-right">{p.scanned_qty ?? 0}</td>
                              <td>{p.ok ? '✓' : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div>
                      <label className="erpnext-label">Scan item (invoice-only)</label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <ItemAutocomplete
                            value={verifyItemCode}
                            onSelect={(found) => {
                              rememberItemName(found.code, found.name)
                              setVerifyItemCode(found.code)
                              setScan('1')
                            }}
                            onChangeText={(text) => {
                              const packed = parsePackedQR(text)
                              if (packed) {
                                setVerifyItemCode(text)
                                setScan(String(packed.qty))
                              } else {
                                setVerifyItemCode(text)
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                requestVerifyConfirm(e.currentTarget.value)
                              }
                            }}
                            placeholder="Scan item / part against invoice totals"
                            className="erpnext-input"
                          />
                        </div>
                        <input
                          className="erpnext-input"
                          style={{ width: 80 }}
                          type="number"
                          value={scan}
                          onChange={e => setScan(e.target.value)}
                          aria-label="Invoice-only scan qty"
                        />
                        <button onClick={() => requestVerifyConfirm()} className="erpnext-btn-primary">Verify item</button>
                        <button onClick={() => { setScanTarget('verify'); setShowScanner(true) }} className="erpnext-btn-secondary" aria-label="Scan item">📷 Item</button>
                      </div>
                      <label className="flex items-center gap-2 text-sm mt-2">
                        <input type="checkbox" checked={acceptSubstitute} onChange={e => setAcceptSubstitute(e.target.checked)} />
                        Accept as substitute (needs approval)
                      </label>
                    </div>
                  </div>
                )}
                {session.receiving_mode !== 'invoice_only' && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Open box for verify</h3>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
                    Scan a received carton to load expected packing-list lines, then scan items. Clean boxes auto-close.
                  </p>
                  <div className="flex gap-3">
                    <BoxAutocomplete
                      value={cartonNo}
                      onChangeText={setCartonNo}
                      suggestions={boxSuggestions}
                      onSelect={(row) => setCartonNo(row.carton_no)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); openBoxForVerify() } }}
                      placeholder="Pick or scan carton / box number"
                      ariaLabel="Open box for item verification"
                    />
                    <button onClick={openBoxForVerify} className="erpnext-btn-primary">Open box</button>
                    <button onClick={() => { setScanTarget('verify'); setShowScanner(true) }} className="erpnext-btn-secondary" aria-label="Scan item">📷 Item</button>
                  </div>
                </div>
                )}

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
                            if (r.data.empty_box) {
                              setExceptionAlert({ title: '⚠ EMPTY BOX', detail: 'Sealed/labeled carton contained nothing. Full shortage recorded.' })
                              setLastScanFeedback('EMPTY BOX')
                              setGrnTab('exceptions')
                            } else {
                              notify({ type: 'warning', title: 'Box force-closed', message: activeBox.carton_no })
                            }
                            setActiveBox(null)
                            reloadSession(session.id)
                          } else {
                            notify({ type: 'error', title: 'Close failed', message: r.error || '' })
                          }
                        }}
                      >
                        Force close
                      </button>
                      <button
                        className="erpnext-btn-secondary text-xs"
                        aria-label="Report empty box"
                        disabled={discBusy}
                        onClick={() => reportDiscrepancy('empty_box', { box_no: activeBox.carton_no })}
                      >
                        Report empty box
                      </button>
                    </div>
                    {(activeBox.lines?.length ?? 0) > 0 && (
                      <div className="overflow-x-auto">
                      <table className="erpnext-table text-sm">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Name</th>
                            <th className="text-right">Expected</th>
                            <th className="text-right">Scanned</th>
                            <th className="text-right">Left</th>
                            <th className="text-right">Unit price</th>
                            <th className="text-right">Amount</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeBox.lines.map((l: any) => (
                            <tr key={l.id}>
                              <td className="font-medium">{l.item_code}</td>
                              <td>{l.item_name || lookupItemName(l.item_code) || '—'}</td>
                              <td className="text-right">{l.expected_qty}</td>
                              <td className="text-right">{l.scanned_qty}</td>
                              <td className="text-right">{l.remaining ?? (l.expected_qty - l.scanned_qty)}</td>
                              <td className="text-right">{money(l.unit_price)}</td>
                              <td className="text-right">{money(l.line_amount ?? (+l.unit_price || 0) * (+l.scanned_qty || 0))}</td>
                              <td>{l.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className="erpnext-label">Scan item</label>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <ItemAutocomplete
                              value={verifyItemCode}
                              onSelect={(found) => {
                                rememberItemName(found.code, found.name)
                                setVerifyItemCode(found.code)
                                setScan('1')
                              }}
                              onChangeText={(text) => {
                                const packed = parsePackedQR(text)
                                if (packed) {
                                  setVerifyItemCode(text)
                                  setScan(String(packed.qty))
                                } else {
                                  setVerifyItemCode(text)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  requestVerifyConfirm(e.currentTarget.value)
                                }
                              }}
                              placeholder="Scan case QR or item code"
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
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); requestVerifyConfirm() } }}
                          />
                          <button onClick={() => requestVerifyConfirm()} className="erpnext-btn-primary">Verify</button>
                        </div>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={acceptSubstitute} onChange={e => setAcceptSubstitute(e.target.checked)} />
                      Accept as substitute (needs approval)
                    </label>
                  </div>
                )}

                <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">Item / quantity discrepancies</h3>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Record empty boxes, label vs physical qty, mixed contents, wrong variant/revision, substitutes, counterfeit serials, and items from a different PO. Each exception is independent — net quantity does not cancel a shortage against an excess.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="erpnext-label">Part / item</label>
                      <ItemAutocomplete
                        value={discPart}
                        onSelect={(found) => setDiscPart(found.code)}
                        onChangeText={setDiscPart}
                        placeholder={verifyItemCode || 'PART-A'}
                        className="erpnext-input"
                      />
                    </div>
                    <div>
                      <label className="erpnext-label">Label qty</label>
                      <input className="erpnext-input" type="number" value={discLabelQty} onChange={e => setDiscLabelQty(e.target.value)} aria-label="Label qty" />
                    </div>
                    <div>
                      <label className="erpnext-label">Physical qty</label>
                      <input className="erpnext-input" type="number" value={discPhysicalQty} onChange={e => setDiscPhysicalQty(e.target.value)} aria-label="Physical qty" />
                    </div>
                    <div>
                      <label className="erpnext-label">Expected variant</label>
                      <input className="erpnext-input" value={discExpectedVariant} onChange={e => setDiscExpectedVariant(e.target.value)} placeholder="Blue, Size M" />
                    </div>
                    <div>
                      <label className="erpnext-label">Received variant</label>
                      <input className="erpnext-input" value={discVariant} onChange={e => setDiscVariant(e.target.value)} placeholder="Red, Size M" />
                    </div>
                    <div>
                      <label className="erpnext-label">Expected revision</label>
                      <input className="erpnext-input" value={discExpectedRevision} onChange={e => setDiscExpectedRevision(e.target.value)} placeholder="Rev 2.0" />
                    </div>
                    <div>
                      <label className="erpnext-label">Received revision</label>
                      <input className="erpnext-input" value={discRevision} onChange={e => setDiscRevision(e.target.value)} placeholder="Rev 1.5" />
                    </div>
                    <div>
                      <label className="erpnext-label">Serial</label>
                      <input className="erpnext-input" value={discSerial} onChange={e => setDiscSerial(e.target.value)} placeholder="Manufacturer serial" aria-label="Manufacturer serial" />
                    </div>
                    <div>
                      <label className="erpnext-label">Other PO</label>
                      <input className="erpnext-input" value={discOtherPO} onChange={e => setDiscOtherPO(e.target.value)} placeholder="PO that owns this item" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('empty_box')} aria-label="Report empty box">Report empty box</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('label_mismatch')} aria-label="Report label mismatch">Report label mismatch</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('mixed_items')} aria-label="Report mixed contents">Report mixed contents</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('wrong_variant')} aria-label="Report wrong variant">Report wrong variant</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('wrong_revision')} aria-label="Report wrong revision">Report wrong revision</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('substitute')} aria-label="Accept as substitute">Accept as substitute</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('counterfeit')} aria-label="Check manufacturer records">Check manufacturer records</button>
                    <button className="erpnext-btn-secondary text-xs" disabled={discBusy} onClick={() => reportDiscrepancy('wrong_po')} aria-label="Report item from different PO">Report item from different PO</button>
                  </div>
                </div>

                {/* Manual / invoice-only line entry */}
                {(session.receiving_mode === 'invoice_only') && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Manual line scan (invoice-only / ad-hoc)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="erpnext-label">Item Code</label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <ItemAutocomplete
                            value={item}
                            onSelect={(found) => {
                              rememberItemName(found.code, found.name)
                              setItem(found.code)
                            }}
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
                )}
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
