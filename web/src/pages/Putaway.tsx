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

interface Candidate {
  location_id: number
  location_code: string
  warehouse_id: number
  reason: string
  free_capacity: number | null
  on_hand_qty: number
  aisle?: string
  bay?: string
  level?: string
  location_type?: string
  zone?: string
  same_bay?: boolean
}

const REASON_LABEL: Record<string, string> = {
  home_bin: 'Home bin',
  consolidate_same_item: 'Same item already here',
  empty_pick_face_dedicated_bay: 'Empty pick-face on dedicated bay',
  empty_pick_face: 'Empty pick-face',
  empty_storage_dedicated_bay: 'Empty storage on dedicated bay',
  empty_storage: 'Empty storage',
}

function reasonLabel(reason?: string) {
  if (!reason) return ''
  return REASON_LABEL[reason] || reason.replace(/_/g, ' ')
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
  const [suggestion, setSuggestion] = useState<any>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [allBins, setAllBins] = useState<any[]>([])
  const [prefAisle, setPrefAisle] = useState('')
  const [prefBay, setPrefBay] = useState('')
  const [excludeIds, setExcludeIds] = useState<number[]>([])
  const [fitOpen, setFitOpen] = useState(false)
  const [fitReason, setFitReason] = useState<'too_small' | 'too_large'>('too_small')
  const [fitQty, setFitQty] = useState('')
  const [fitRemainder, setFitRemainder] = useState<'override' | 'incoming'>('override')
  const [fitOverride, setFitOverride] = useState('')
  const [fitOverrideId, setFitOverrideId] = useState<number | null>(null)
  const [fitNotes, setFitNotes] = useState('')
  const [fitBusy, setFitBusy] = useState(false)

  const loadRules = () => api.putawayRules().then(r => { if (r.ok) setRules(r.data ?? []) })
  const loadQueue = () => api.putawayQueue().then(r => { if (r.ok) setQueue(r.data ?? []) })
  useEffect(() => { loadRules(); loadQueue() }, [])

  const loadBins = async (warehouseId: number) => {
    const r = await api.warehouseLocations(warehouseId)
    if (r.ok) {
      setAllBins((r.data ?? []).filter((l: any) =>
        l.location_type === 'pick_face' || l.location_type === 'storage'
      ))
    }
  }

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

  const suggest = async (qtyOverride?: number, extraExclude?: number[]) => {
    if (!putawayItem) return
    const qty = qtyOverride ?? (+putawayQty || 1)
    const exclude = extraExclude ?? excludeIds
    const r = await api.putawaySuggest(
      putawayItem,
      qty,
      putawayWarehouseId || undefined,
      { aisle: prefAisle || undefined, bay: prefBay || undefined, excludeLocationIds: exclude },
    )
    if (r.ok && r.data) {
      setSuggestion(r.data)
      setCandidates(r.data.candidates || [])
      setPutawayTarget(r.data.location_code)
      setPutawayTargetId(r.data.location_id)
      setPutawayWarehouseId(r.data.warehouse_id)
      if (r.data.preferred_aisle) setPrefAisle(r.data.preferred_aisle)
      if (r.data.preferred_bay) setPrefBay(r.data.preferred_bay)
      if (r.data.warehouse_id) loadBins(r.data.warehouse_id)
      notify({
        type: 'success',
        title: 'Suggested',
        message: `${r.data.location_code} — ${reasonLabel(r.data.reason)}`,
      })
    } else {
      setSuggestion(null)
      setCandidates([])
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
    setCandidates([])
    setExcludeIds([])
    loadBins(row.warehouse_id)
  }

  const selectCandidate = (c: Candidate) => {
    setPutawayTarget(c.location_code)
    setPutawayTargetId(c.location_id)
    setPutawayWarehouseId(c.warehouse_id)
  }

  const clearPutawayForm = () => {
    setPutawayItem(''); setPutawayQty(''); setPutawayTarget(''); setPutawayTargetId(null)
    setPutawayBatch(''); setSuggestion(null); setCandidates([])
    setExcludeIds([])
    setFitOpen(false)
    setFitQty(''); setFitOverride(''); setFitOverrideId(null); setFitNotes('')
  }

  const doPutaway = async (opts?: {
    qty?: number
    target?: string
    targetId?: number | null
    isOverride?: boolean
    reason?: string
    skipClear?: boolean
  }) => {
    const qty = opts?.qty ?? +putawayQty
    const target = (opts?.target ?? putawayTarget).trim()
    const targetId = opts?.targetId === undefined ? putawayTargetId : opts.targetId
    if (!putawayItem || !qty || (!target && !targetId)) return { ok: false as const }
    if (!putawaySource.trim()) {
      notify({ type: 'error', title: 'Source required', message: 'Pick a queue row or enter source location (e.g. INCOMING-01)' })
      return { ok: false as const }
    }
    const r = await api.putawayCreate({
      item_code: putawayItem,
      source_warehouse: putawaySource || undefined,
      source_location: putawaySource || undefined,
      target_location: target,
      target_location_id: targetId || undefined,
      warehouse_id: putawayWarehouseId || undefined,
      batch_no: putawayBatch || undefined,
      quantity: qty,
      is_override: !!opts?.isOverride,
      exception_reason: opts?.reason || undefined,
    })
    if (r.ok) {
      if (!opts?.skipClear) {
        setMsg(`Putaway complete: ${qty} x ${putawayItem} → ${r.data.target_location || target}`)
        clearPutawayForm()
        loadQueue()
        notify({ type: 'success', title: 'Putaway Complete', message: `${putawayItem} → ${r.data.target_location}` })
      }
      return { ok: true as const, data: r.data }
    }
    notify({ type: 'error', title: 'Putaway failed', message: r.error || '' })
    return { ok: false as const }
  }

  const openFitPanel = () => {
    if (!putawayItem || !putawayQty) {
      notify({ type: 'warning', title: 'Scan an item first', message: 'Pick a queue row or enter item and qty' })
      return
    }
    if (putawayWarehouseId) loadBins(putawayWarehouseId)
    setFitReason('too_small')
    setFitQty('')
    setFitRemainder('override')
    setFitOverride('')
    setFitOverrideId(null)
    setFitNotes('')
    setFitOpen(true)
  }

  const applyFitOverride = (code: string, id: number | null) => {
    setFitOverride(code)
    setFitOverrideId(id)
  }

  const confirmFit = async () => {
    const requested = +putawayQty
    if (!putawayItem || !(requested > 0)) return
    let fits = +(fitQty || 0)
    if (Number.isNaN(fits) || fits < 0) fits = 0
    if (fits > requested) fits = requested
    const leftover = requested - fits
    if (leftover > 0 && fitRemainder === 'override' && !fitOverride.trim() && !fitOverrideId) {
      notify({ type: 'error', title: 'Choose a location', message: 'Pick another bin for the remaining qty, or keep it in incoming' })
      return
    }
    if (fits > 0 && !putawayTarget && !putawayTargetId) {
      notify({ type: 'error', title: 'Current bin missing', message: 'Suggest or enter the bin that is too small, then enter how many fit' })
      return
    }
    setFitBusy(true)
    const rejectedId = putawayTargetId || undefined
    const rejectedCode = putawayTarget || undefined
    const ex = await api.putawayFitException({
      item_code: putawayItem,
      rejected_location: rejectedCode,
      rejected_location_id: rejectedId,
      reason: fitReason,
      requested_qty: requested,
      fits_qty: fits,
      override_location: fitOverride || undefined,
      notes: fitNotes || undefined,
    })
    if (!ex.ok) {
      setFitBusy(false)
      notify({ type: 'error', title: 'Could not record exception', message: ex.error || 'Apply migration 023_putaway_fit_exceptions.sql' })
      return
    }

    const nextExclude = rejectedId ? [...excludeIds, rejectedId] : excludeIds
    if (rejectedId) setExcludeIds(nextExclude)

    if (fits > 0) {
      const placed = await doPutaway({
        qty: fits,
        target: putawayTarget,
        targetId: putawayTargetId,
        isOverride: false,
        reason: fitReason,
        skipClear: true,
      })
      if (!placed.ok) {
        setFitBusy(false)
        return
      }
    }

    if (leftover > 0 && fitRemainder === 'override') {
      const moved = await doPutaway({
        qty: leftover,
        target: fitOverride,
        targetId: fitOverrideId,
        isOverride: true,
        reason: fitReason,
        skipClear: true,
      })
      setFitBusy(false)
      if (!moved.ok) {
        setPutawayQty(String(leftover))
        loadQueue()
        notify({ type: 'warning', title: 'Partial putaway', message: `${fits} placed. Remaining ${leftover} still on ${putawaySource}` })
        return
      }
      setMsg(`${putawayItem}: ${fits} in ${putawayTarget || 'current'} · ${leftover} override → ${moved.data?.target_location || fitOverride}`)
      notify({
        type: 'success',
        title: 'Split putaway complete',
        message: `${fits || 0} in original bin, ${leftover} in ${moved.data?.target_location || fitOverride}`,
      })
      clearPutawayForm()
      loadQueue()
      return
    }

    setFitBusy(false)
    if (leftover > 0) {
      setPutawayQty(String(leftover))
      setPutawayTarget('')
      setPutawayTargetId(null)
      setFitOpen(false)
      loadQueue()
      await suggest(leftover, nextExclude)
      notify({
        type: 'warning',
        title: leftover === requested ? 'Bin skipped' : 'Partial putaway',
        message: `${leftover} still on ${putawaySource || 'incoming'}. Next suggested bin is ready — confirm or override again.`,
      })
      return
    }

    setMsg(`Putaway complete: ${fits} x ${putawayItem} → ${putawayTarget}`)
    notify({ type: 'success', title: 'Putaway complete', message: `${putawayItem} → ${putawayTarget}` })
    clearPutawayForm()
    loadQueue()
  }

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {fitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="erpnext-card max-w-lg w-full mx-4 p-6 space-y-4" style={{ background: 'var(--panel)', maxHeight: '90vh', overflow: 'auto' }}>
            <h2 className="text-xl font-semibold">Bin too big / too small</h2>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              Suggested <strong>{putawayTarget || '—'}</strong> for <strong>{putawayQty}</strong> × {putawayItem}.
              Put what fits here, then send the rest to another bin or keep it in incoming.
            </p>
            <div>
              <label className="erpnext-label">What is wrong with this bin?</label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  className={fitReason === 'too_small' ? 'erpnext-btn-primary flex-1' : 'erpnext-btn-secondary flex-1'}
                  onClick={() => setFitReason('too_small')}
                >
                  Too small (does not fit)
                </button>
                <button
                  type="button"
                  className={fitReason === 'too_large' ? 'erpnext-btn-primary flex-1' : 'erpnext-btn-secondary flex-1'}
                  onClick={() => { setFitReason('too_large'); setFitQty('0') }}
                >
                  Too large (wrong size)
                </button>
              </div>
            </div>
            <div>
              <label className="erpnext-label">How many of {putawayQty} fit in {putawayTarget || 'this bin'}?</label>
              <input
                className="erpnext-input"
                type="number"
                min={0}
                max={putawayQty}
                value={fitQty}
                onChange={e => setFitQty(e.target.value)}
                placeholder="0 = do not use this bin"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                Example: suggested 10, only 5 fit → enter 5. Remaining 5 go to the location below.
              </p>
            </div>
            {(+putawayQty - +(fitQty || 0)) > 0 && (
              <div className="space-y-2">
                <label className="erpnext-label">
                  Remaining {Math.max(0, +putawayQty - +(fitQty || 0))} qty
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={fitRemainder === 'override' ? 'erpnext-btn-primary flex-1' : 'erpnext-btn-secondary flex-1'}
                    onClick={() => setFitRemainder('override')}
                  >
                    Move to another location
                  </button>
                  <button
                    type="button"
                    className={fitRemainder === 'incoming' ? 'erpnext-btn-primary flex-1' : 'erpnext-btn-secondary flex-1'}
                    onClick={() => setFitRemainder('incoming')}
                  >
                    Keep in incoming
                  </button>
                </div>
                {fitRemainder === 'override' && (
                  <div className="space-y-2">
                    <input
                      className="erpnext-input"
                      value={fitOverride}
                      onChange={e => { setFitOverride(e.target.value); setFitOverrideId(null) }}
                      placeholder="Type location code to override"
                    />
                    {candidates.filter(c => c.location_id !== putawayTargetId).length > 0 && (
                      <select
                        className="erpnext-input"
                        value={fitOverrideId ?? ''}
                        onChange={e => {
                          const id = +e.target.value
                          const c = candidates.find(x => x.location_id === id)
                          if (c) applyFitOverride(c.location_code, c.location_id)
                        }}
                      >
                        <option value="">Suggested other bins</option>
                        {candidates.filter(c => c.location_id !== putawayTargetId).map(c => (
                          <option key={c.location_id} value={c.location_id}>
                            {c.location_code} · {c.zone || c.location_type}
                          </option>
                        ))}
                      </select>
                    )}
                    {allBins.length > 0 && (
                      <select
                        className="erpnext-input"
                        value={fitOverrideId ?? ''}
                        onChange={e => {
                          const id = +e.target.value
                          const loc = allBins.find((x: any) => x.id === id)
                          if (loc) applyFitOverride(loc.code, loc.id)
                        }}
                      >
                        <option value="">Or any pick / storage bin</option>
                        {allBins.filter((l: any) => l.id !== putawayTargetId).map((l: any) => (
                          <option key={l.id} value={l.id}>{l.code} ({l.location_type} · L{l.level})</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {fitRemainder === 'incoming' && (
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Leftover stays unallocatable on {putawaySource || 'INCOMING-01'}. We will suggest the next bin (home, same-item, then empty).
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="erpnext-label">Notes (optional)</label>
              <input className="erpnext-input" value={fitNotes} onChange={e => setFitNotes(e.target.value)} placeholder="Carton does not fit shelf…" />
            </div>
            <div className="flex gap-2">
              <button className="erpnext-btn-primary flex-1" disabled={fitBusy} onClick={() => { void confirmFit() }}>
                {fitBusy ? 'Recording…' : 'Confirm & move'}
              </button>
              <button className="erpnext-btn-secondary" disabled={fitBusy} onClick={() => setFitOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Putaway</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Home bin (if bin-controlled) → same-item bins with remaining cap → empty pick-face → empty storage.
            Mixed bins and warehouse / item-bin caps are enforced on confirm.
          </p>
        </div>
        <button onClick={() => setShowScanner(true)} className="erpnext-btn-secondary">📷 Scan Item</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="erpnext-card lg:col-span-1">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Pending queue ({queue.length})</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Incoming / hold / damaged — unallocatable</p>
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
                <label className="erpnext-label">Preferred aisle (dedicated bay)</label>
                <input className="erpnext-input" value={prefAisle} onChange={e => setPrefAisle(e.target.value.toUpperCase())} placeholder="A" />
              </div>
              <div>
                <label className="erpnext-label">Preferred bay</label>
                <input className="erpnext-input" value={prefBay} onChange={e => setPrefBay(e.target.value)} placeholder="01" />
              </div>
              <div>
                <label className="erpnext-label">Target Location *</label>
                <input
                  className="erpnext-input"
                  value={putawayTarget}
                  onChange={e => { setPutawayTarget(e.target.value); setPutawayTargetId(null) }}
                  placeholder="A-01-01-01"
                />
              </div>
              <div className="flex items-end">
                <button onClick={() => { void suggest() }} className="erpnext-btn-secondary w-full">Suggest location</button>
              </div>
            </div>

            {suggestion && (
              <div className="p-3 rounded-lg text-sm space-y-1" style={{ background: 'rgba(36,144,239,0.08)', border: '1px solid rgba(36,144,239,0.25)' }}>
                <div>
                  Suggested <strong>{suggestion.location_code}</strong> — {reasonLabel(suggestion.reason)}
                  {suggestion.zone && <> · {suggestion.zone === 'pick_face' ? 'pick-face' : 'storage'}</>}
                  {suggestion.same_bay && <> · dedicated bay</>}
                  {suggestion.on_hand_qty > 0 && <> · already {suggestion.on_hand_qty} here</>}
                  {suggestion.free_capacity != null && <> · free {suggestion.free_capacity}</>}
                </div>
                {suggestion.control_mode === 'bin_controlled' && (
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Bin-controlled item — home bin is tried first.</div>
                )}
                {suggestion.putaway_rule && suggestion.putaway_rule.stock_capacity > 0 && (
                  <div className="text-xs" style={{ color: suggestion.putaway_rule.remaining < (+putawayQty || 1) ? 'var(--orange, #c2410c)' : 'var(--text-dim)' }}>
                    Warehouse rule: {suggestion.putaway_rule.current_qty}/{suggestion.putaway_rule.stock_capacity} sellable
                    {' '}({suggestion.putaway_rule.remaining} remaining
                    {suggestion.putaway_rule.remaining < (+putawayQty || 1) ? ' — reduce qty or split before confirm' : ''})
                  </div>
                )}
              </div>
            )}

            {(candidates.length > 0 || allBins.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {candidates.length > 0 && (
                  <div>
                    <label className="erpnext-label">Suggested candidates</label>
                    <select
                      className="erpnext-input"
                      value={putawayTargetId ?? ''}
                      onChange={e => {
                        const id = +e.target.value
                        const c = candidates.find(x => x.location_id === id)
                        if (c) selectCandidate(c)
                      }}
                    >
                      {candidates.map(c => (
                        <option key={c.location_id} value={c.location_id}>
                          {c.location_code} · {reasonLabel(c.reason)}{c.on_hand_qty > 0 ? ` · ${c.on_hand_qty} here` : ''}{c.free_capacity != null ? ` · free ${c.free_capacity}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {allBins.length > 0 && (
                  <div>
                    <label className="erpnext-label">Or select any bin</label>
                    <select
                      className="erpnext-input"
                      value={putawayTargetId ?? ''}
                      onChange={e => {
                        const id = +e.target.value
                        const loc = allBins.find((x: any) => x.id === id)
                        if (loc) {
                          setPutawayTarget(loc.code)
                          setPutawayTargetId(loc.id)
                        }
                      }}
                    >
                      <option value="">— choose location —</option>
                      {allBins.map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.code} ({l.location_type} · L{l.level})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { void doPutaway() }} className="erpnext-btn-primary">Confirm putaway</button>
              <button
                type="button"
                onClick={openFitPanel}
                className="erpnext-btn-secondary"
                disabled={!putawayItem}
              >
                Bin too big / too small
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              If the suggested bin does not fit this SKU, report it — put what fits, then override the rest to another location or leave it in incoming.
            </p>
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
            <h3 className="font-semibold">Warehouse putaway rules</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
              Caps sellable stock (pick-face + storage) for an item in a warehouse. 0 = unlimited. Suggest and confirm both honour this.
            </p>
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
                <label className="erpnext-label">Warehouse max qty</label>
                <input className="erpnext-input" type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="0" />
              </div>
            </div>
            <button onClick={addRule} className="erpnext-btn-primary">Add Rule</button>
          </div>
        </div>

        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Active Rules</h3>
          </div>
          <div className="p-3 overflow-auto" style={{ maxHeight: 220 }}>
            {rules.length === 0 && <p className="text-sm p-2" style={{ color: 'var(--text-dim)' }}>No rules</p>}
            {rules.map(r => (
              <div key={r.id} className="text-sm p-2 mb-1 rounded" style={{ background: 'var(--panel-2)' }}>
                {r.item_code} · {r.warehouse || 'any'} · P{r.priority} · cap {r.stock_capacity}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
