import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import CameraScanner from '../components/CameraScanner'
import ButtonPress from '../components/ButtonPress'
import { useHaptic } from '../hooks/useHaptic'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from '../components/ScannerLayout'
import VerificationHeader from '../components/scan/VerificationHeader'
import ScanCard from '../components/scan/ScanCard'
import { useScanFeedback } from '../hooks/useScanFeedback'

function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="scan-skeleton">
          <div className="scan-skeleton-line" style={{ width: '50%' }} />
          <div className="scan-skeleton-line" style={{ width: '30%' }} />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <div className="scan-empty">
      <div className="scan-empty-icon">{icon}</div>
      <div className="scan-empty-title">{title}</div>
      <div className="scan-empty-msg">{message}</div>
    </div>
  )
}

type WizardStep =
  | 'mode_select'
  | 'zone_select'
  | 'scan_items'
  | 'suggest_location'
  | 'item_confirm'
  | 'complete'

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
  zone: string
  suggested_location_id?: number | null
  suggested_location_code?: string | null
}

interface ZoneInfo {
  zone: string
  count: number
}

interface Suggestion {
  location_id: number
  location_code: string
  reason: string
  free_capacity: number | null
  on_hand_qty: number
  candidates: any[]
  velocity_tier: string
  shelf_band: string
  max_fit_qty?: number
  requires_split?: boolean
  remaining_after_fit?: number
  requested_qty?: number
  preferred_aisle?: string
  preferred_bay?: string
}

interface ToteItem {
  id: number
  item_code: string
  item_name: string | null
  qty: number
  status: string
  source: string
  source_location_id?: number
  target_location_code?: string
}

interface SessionData {
  id: number
  warehouse_id: number
  zone: string | null
  status: string
  started_at: string
}

const ZONE_LABELS: Record<string, string> = {
  A: 'Bicycle/Motorcycle Parts',
  B: 'Tapes & Films',
  C: 'Other Cycle Parts',
  D: 'Fasteners',
  E: 'Rubber Parts',
  F: 'Electrical',
  G: 'Miscellaneous',
}

const ZONE_COLORS: Record<string, string> = {
  A: '#2563eb',
  B: '#059669',
  C: '#7c3aed',
  D: '#db2777',
  E: '#ea580c',
  F: '#0891b2',
  G: '#65a30d',
}

export default function PutawayWizard() {
  const { toasts, toast } = useScannerToasts()
  const fb = useScanFeedback()
  const haptic = useHaptic()

  const [step, setStep] = useState<WizardStep>('mode_select')
  const [mode, setMode] = useState<'zone' | 'item' | null>(null)
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [zones, setZones] = useState<ZoneInfo[]>([])
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [session, setSession] = useState<SessionData | null>(null)
  const [toteItems, setToteItems] = useState<ToteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [usedLocationIds, setUsedLocationIds] = useState<number[]>([])
  const [selectedToteItemId, setSelectedToteItemId] = useState<number | null>(null)
  const [scannedLocation, setScannedLocation] = useState<{ id: number; code: string } | null>(null)
  const [placedAtBin, setPlacedAtBin] = useState(0)
  const [scanState, setScanState] = useState<'idle' | 'accepted' | 'rejected'>('idle')
  const [scanReason, setScanReason] = useState<string | undefined>()
  const [lastScanCode, setLastScanCode] = useState('')
  const [cameraKey, setCameraKey] = useState(0)
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null)

  const doFlash = useCallback((t: 'ok' | 'err') => { setFlash(t); setTimeout(() => setFlash(null), 300) }, [])

  const loadQueue = useCallback(async () => {
    const r = await api.putawayQueue()
    if (r.ok) setQueue((r.data ?? []) as QueueRow[])
  }, [])

  const loadZones = useCallback(async () => {
    const r = await api.get('/putaway/queue/zones')
    if (r.ok && Array.isArray(r.data)) setZones(r.data)
  }, [])

  useEffect(() => {
    setDataLoading(true)
    Promise.all([loadQueue(), loadZones()]).finally(() => setDataLoading(false))
  }, [loadQueue, loadZones])

  const dedupedQueue = useMemo(() => {
    const m = new Map<string, QueueRow>()
    for (const q of queue) {
      const key = `${q.item_code.toUpperCase()}|${q.location_id}|${(q.batch_no || '').toUpperCase()}`
      const prev = m.get(key)
      if (!prev || q.qty > prev.qty) m.set(key, q)
    }
    return Array.from(m.values())
  }, [queue])

  const ensureSession = useCallback(async () => {
    if (!session && dedupedQueue.length > 0) {
      const wid = dedupedQueue[0].warehouse_id
      const r = await api.post<SessionData>('/putaway/sessions', { warehouse_id: wid, zone: selectedZone || '' })
      if (r.ok && r.data) {
        setSession(r.data)
        return r.data.id
      }
      notify({ type: 'error', title: 'Session error', message: r.error || 'Failed to create putaway session' })
      return null
    }
    return session?.id ?? null
  }, [session, queue, selectedZone])

  const restartScanner = useCallback(() => {
    setScanState('idle')
    setScanReason(undefined)
    setLastScanCode('')
    setCameraKey(k => k + 1)
  }, [])

  function currentToteItem() {
    if (selectedToteItemId != null) {
      const sel = toteItems.find(i => i.id === selectedToteItemId && i.status === 'picked')
      if (sel) return sel
    }
    return toteItems.find(i => i.status === 'picked') || null
  }

  // Suggest-location auto-fetch (must be top-level hook, not inside conditional branch)
  useEffect(() => {
    if (step !== 'suggest_location') return
    const cti = currentToteItem()
    if (!cti || !session || suggestion || loading) return
    setLoading(true)
    void (async () => {
      const r = await api.putawaySuggest(
        cti.item_code,
        cti.qty,
        session.warehouse_id,
        usedLocationIds.length > 0 ? { excludeLocationIds: usedLocationIds } : undefined
      )
      if (r.ok && r.data) {
        setSuggestion(r.data)
      } else {
        notify({ type: 'error', title: 'No location found', message: (r as any).error || 'No bins available for this item' })
      }
      setLoading(false)
    })()
  }, [step, session, selectedToteItemId, toteItems, usedLocationIds, suggestion, loading])

  // ─── SCAN HANDLERS (top-level hooks) ───
  const onItemScan = useCallback(async (code: string): Promise<boolean> => {
    if (!code) return false
    const clean = code.trim().toLowerCase()
    const zoneItems = selectedZone ? dedupedQueue.filter(q => q.zone === selectedZone) : dedupedQueue
    const match = zoneItems.find(item => item.item_code.toLowerCase() === clean)
    if (!match) {
      setScanState('rejected')
      setScanReason(`"${code}" not in this zone`)
      fb.warn()
      toast(`Not in queue: ${code}`, 'warn')
      return false
    }
    const existing = toteItems.find(t => t.item_code.toLowerCase() === clean && t.status === 'picked')
    const currentQty = existing ? existing.qty : 0
    if (currentQty + 1 > match.qty) {
      setScanState('rejected')
      setScanReason(`Already picked max ${match.qty}`)
      fb.warn()
      toast(`Already picked max ${match.qty}`, 'warn')
      return false
    }

    setScanState('accepted')
    fb.ok()
    doFlash('ok')
    haptic(20)

    const sid = await ensureSession()
    if (!sid) return false
    const r = await api.post<{ id: number }>(`/putaway/sessions/${sid}/pick`, {
      item_code: match.item_code,
      source_location_id: match.location_id,
      qty: 1
    })
    if (!r.ok || !r.data?.id) {
      fb.err()
      toast(r.error || 'Pick failed', 'err')
      return false
    }

    if (existing) {
      setToteItems(prev => prev.map(t => t.item_code.toLowerCase() === clean && t.status === 'picked' ? { ...t, qty: t.qty + 1, id: r.data!.id } : t))
      const totalPickedQty = toteItems.filter(i => i.status === 'picked').reduce((s, i) => s + i.qty, 0) + 1
      toast(`✓ ${match.item_code} ${existing.qty + 1}/${match.qty} (tote ${totalPickedQty})`, 'ok')
    } else {
      const newItem: ToteItem = {
        id: r.data.id,
        item_code: match.item_code,
        item_name: match.item_name,
        qty: 1,
        status: 'picked',
        source: match.location_code,
        source_location_id: match.location_id
      }
      setToteItems(prev => [...prev, newItem])
      const totePicked = toteItems.filter(i => i.status === 'picked')
      const totalItems = zoneItems.length
      toast(`✓ ${match.item_code} added to tote (${totePicked.length + 1}/${totalItems}) qty 1/${match.qty}`, 'ok')
    }
    setLastScanCode(match.item_code)
    setScanState('accepted')
    return true
  }, [dedupedQueue, selectedZone, toteItems, ensureSession, fb, toast, doFlash, haptic])

  const onLocationScan = useCallback(async (code: string): Promise<boolean> => {
    if (!code || !suggestion) return false
    const clean = code.trim().toUpperCase()
    const targetCode = suggestion.location_code.toUpperCase()

    if (clean !== targetCode) {
      const cand = suggestion.candidates?.find((c: any) => c.location_code.toUpperCase() === clean)
      if (!cand) {
        setScanState('rejected')
        setScanReason(`Must scan ${suggestion.location_code}`)
        fb.warn()
        doFlash('err')
        toast(`Must scan ${suggestion.location_code}`, 'err')
        return false
      }
      setScannedLocation({ id: cand.location_id, code: cand.location_code })
    } else {
      setScannedLocation({ id: suggestion.location_id, code: suggestion.location_code })
    }

    setScanState('accepted')
    fb.ok()
    doFlash('ok')
    setLastScanCode(suggestion.location_code)
    setPlacedAtBin(0)
    toast(`✓ Bin ${suggestion.location_code} confirmed`, 'ok')
    setStep('item_confirm')
    return true
  }, [suggestion, fb, doFlash, toast])

  const onItemConfirm = useCallback(async (code: string): Promise<boolean> => {
    if (!code) return false
    const cti = currentToteItem()
    if (!cti || !scannedLocation || !session) return false
    const clean = code.trim().toUpperCase()

    if (clean !== cti.item_code.toUpperCase()) {
      setScanState('rejected')
      setScanReason(`Scan ${cti.item_code} to place`)
      fb.warn()
      doFlash('err')
      toast(`Scan ${cti.item_code} to place`, 'err')
      return false
    }

    const r = await api.post(`/putaway/sessions/${session.id}/place/${cti.id}`, {
      target_location_id: scannedLocation.id,
      qty: 1
    })
    if (!r.ok) {
      fb.err()
      doFlash('err')
      toast(r.error || 'Place failed', 'err')
      return false
    }

    fb.ok()
    doFlash('ok')
    haptic(30)
    const newPlaced = placedAtBin + 1
    setPlacedAtBin(newPlaced)
    setLastScanCode(cti.item_code)
    toast(`✓ ${cti.item_code} placed (${newPlaced}/${cti.qty})`, 'ok')

    const resp = r.data as any
    const remaining = resp?.remaining ?? 0

    if (remaining > 0) {
      // Backend updated qty to remaining; reflect in tote — keep same bin candidate (do not exclude, suggest will skip if full)
      setToteItems(prev => prev.map(it => it.id === cti.id ? { ...it, qty: remaining } : it))
      setSuggestion(null)
      setScannedLocation(null)
      setPlacedAtBin(0)
      setScanState('idle')
      setScanReason(undefined)
      setLastScanCode('')
      setStep('suggest_location')
      toast(`Remaining ${remaining} → next bin`, 'ok')
    } else {
      // Mark this item placed
      setToteItems(prev => prev.map(it => it.id === cti.id ? { ...it, status: 'placed', target_location_code: scannedLocation.code } : it))
      const nextItem = toteItems.find(i => i.id !== cti.id && i.status === 'picked')
      if (nextItem) {
        setSelectedToteItemId(nextItem.id)
        setUsedLocationIds(prev => [...prev, scannedLocation.id])
        setSuggestion(null)
        setScannedLocation(null)
        setPlacedAtBin(0)
        setScanState('idle')
        setScanReason(undefined)
        setLastScanCode('')
        setStep('suggest_location')
      } else {
        setUsedLocationIds(prev => [...prev, scannedLocation.id])
        setScannedLocation(null)
        setPlacedAtBin(0)
        // Close session server-side so queue refresh hides ghost GRN rows
        if (session) {
          void api.post(`/putaway/sessions/${session.id}/complete`, {}).then(r => {
            if (!r.ok) toast(r.error || 'Complete failed', 'warn')
            void loadQueue()
            void loadZones()
          })
        }
        setStep('complete')
      }
    }
    return true
  }, [toteItems, scannedLocation, session, placedAtBin, usedLocationIds, fb, doFlash, toast, haptic, loadQueue, loadZones])

  // ─── MODE SELECT ───
  if (step === 'mode_select') {
    return (
      <ScannerLayout title="Putaway" noBack flash={flash}>
        <ScannerToastBar toasts={toasts} />
        <div className="scan-select-list" style={{ padding: 16 }}>
          <button
            type="button"
            className="scan-select-card"
            onClick={() => { setMode('zone'); setStep('zone_select') }}
            style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
          >
            <div className="scan-select-card-title">By Zone</div>
            <div className="scan-select-card-sub">Batch putaway by HSN zone</div>
            <div className="scan-select-card-meta">
              <span>{dedupedQueue.length} pending</span>
              <span>{zones.length} zones</span>
              <span style={{ color: 'var(--primary)' }}>Open →</span>
            </div>
          </button>
          <button
            type="button"
            className="scan-select-card"
            onClick={() => { setMode('item'); setStep('scan_items') }}
            style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
          >
            <div className="scan-select-card-title">By Item</div>
            <div className="scan-select-card-sub">Single item putaway</div>
            <div className="scan-select-card-meta">
              <span>{dedupedQueue.length} in queue</span>
              <span style={{ color: 'var(--primary)' }}>Open →</span>
            </div>
          </button>
        </div>
        {dedupedQueue.length === 0 && !dataLoading && (
          <div className="scan-empty" style={{ marginTop: 8 }}>
            <div className="scan-empty-icon"><span style={{ fontSize: 40, opacity: 0.5 }}>⇨</span></div>
            <div className="scan-empty-title">All clear!</div>
            <div className="scan-empty-msg">No items waiting for putaway</div>
          </div>
        )}
        {dedupedQueue.length > 0 && (
          <div style={{ marginTop: 8, padding: '0 16px' }}>
            <div className="scan-section-title">Queue ({dedupedQueue.length})</div>
            {dedupedQueue.slice(0, 10).map(q => (
              <div key={q.id} className="scan-row">
                <div className="scan-row-info">
                  <div className="scan-row-code">{q.item_code}</div>
                  <div className="scan-row-desc">{q.item_name || ''} · {q.location_code}</div>
                </div>
                <div className="scan-row-meta">
                  <div className="scan-row-qty">{q.qty}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScannerLayout>
    )
  }

  // ─── ZONE SELECT ───
  if (step === 'zone_select') {
    return (
      <ScannerLayout title="Select Zone" hideHeader noBack flash={flash}>
        <ScannerToastBar toasts={toasts} />
        <VerificationHeader
          counted={0}
          total={0}
          po="PUTAWAY"
          pl="—"
          grn="—"
          tab="boxes"
          onTabChange={() => {}}
          onBack={() => setStep('mode_select')}
          title="Select Zone"
        />
        {dataLoading ? (
          <SkeletonCards count={4} />
        ) : (
          <>
            <div className="scan-select-list" style={{ padding: 16 }}>
              {zones.map(z => (
                <button
                  key={z.zone}
                  type="button"
                  className="scan-select-card"
                  onClick={() => { setSelectedZone(z.zone); setStep('scan_items') }}
                  style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
                >
                  <div className="scan-select-card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: ZONE_COLORS[z.zone] || '#6b7280',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 13, flexShrink: 0,
                      }}
                    >{z.zone}</span>
                    {ZONE_LABELS[z.zone] || `Zone ${z.zone}`}
                  </div>
                  <div className="scan-select-card-sub">{z.count} items ready for putaway</div>
                  <div className="scan-select-card-meta">
                    <span>{z.count} items</span>
                    <span style={{ color: 'var(--primary)' }}>Open →</span>
                  </div>
                </button>
              ))}
            </div>
            {zones.length === 0 && (
              <div className="scan-empty" style={{ marginTop: 8, padding: 16 }}>
                <div className="scan-empty-icon"><span style={{ fontSize: 40, opacity: 0.5 }}>⇨</span></div>
                <div className="scan-empty-title">No zones ready</div>
                <div className="scan-empty-msg">No items are staged for putaway</div>
              </div>
            )}
          </>
        )}
      </ScannerLayout>
    )
  }

  // ─── SCAN ITEMS (build tote) ───
  if (step === 'scan_items') {
    const zoneItems = selectedZone ? dedupedQueue.filter(q => q.zone === selectedZone) : dedupedQueue
    const totePicked = toteItems.filter(i => i.status === 'picked')
    const totalItems = zoneItems.length
    const totalPendingQty = zoneItems.reduce((s, q) => s + (Number(q.qty) || 0), 0)
    const totalPickedQty = totePicked.reduce((s, i) => s + (Number(i.qty) || 0), 0)

    return (
      <ScannerLayout title="Scan Items" hideHeader noBack flash={scanState === 'rejected' || flash === 'err' ? 'err' : scanState === 'accepted' || flash === 'ok' ? 'ok' : null}>
        <ScannerToastBar toasts={toasts} />
        <VerificationHeader
          counted={totalPickedQty}
          total={totalPendingQty}
          po="PUTAWAY"
          pl={selectedZone ? `Zone ${selectedZone}` : 'All'}
          grn={session?.id ? `#${session.id}` : '—'}
          tab="boxes"
          onTabChange={() => {}}
          onBack={() => setStep(mode === 'zone' ? 'zone_select' : 'mode_select')}
          title="Scan Items"
        />
        <ScanCard
          state={scanState}
          code={lastScanCode}
          reason={scanReason}
          onMarkDamaged={() => {}}
          canMarkDamaged={false}
          onRestart={restartScanner}
          onManualEntry={onItemScan}
          placeholder="Scan item barcode..."
          viewport={
            <div className="scan-live-viewport">
              <CameraScanner
                key={cameraKey}
                open={true}
                embedded
                continuous
                onClose={restartScanner}
                onScan={onItemScan}
              />
            </div>
          }
        />
        <div style={{ padding: '0 16px 8px' }}>
          {toteItems.length > 0 && (
            <div className="scan-section-title">Tote ({totalPickedQty} of {totalPendingQty})</div>
          )}
        </div>
        <div style={{ padding: '0 16px' }}>
          <div className="scan-section-title">Available ({totalItems} items, {totalPendingQty} pcs)</div>
          {dataLoading ? (
            <SkeletonCards count={3} />
          ) : totalItems === 0 ? (
            <EmptyState
              icon="📦"
              title={selectedZone ? `No items in Zone ${selectedZone}` : "No items staged"}
              message="Pick items from staging to start putaway"
            />
          ) : (
            zoneItems.map(q => {
              const inTote = toteItems.some(t => t.item_code === q.item_code && t.status === 'picked')
              return (
                <div key={q.id} className={`scan-row ${inTote ? 'ring-accent' : ''}`}>
                  <div className="scan-row-info">
                    <div className="scan-row-code">{q.item_code}</div>
                    <div className="scan-row-desc">{q.item_name || ''} · {q.location_code}</div>
                  </div>
                  <div className="scan-row-meta">
                    <div className="scan-row-qty">{q.qty}</div>
                    <div className="scan-row-label">{inTote ? 'Scanned' : 'Pending'}</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div style={{ padding: '12px 16px', marginTop: 'auto' }}>
          <div style={{ width: '100%', minHeight: 52 }}>
            <ButtonPress
              className="erpnext-btn-primary"
              disabled={totePicked.length === 0}
              onClick={() => setStep('suggest_location')}
            >
              Start Putaway →
            </ButtonPress>
          </div>
        </div>
      </ScannerLayout>
    )
  }

  // ─── SUGGEST LOCATION ───
  if (step === 'suggest_location') {
    const cti = currentToteItem()
    if (!cti) {
      return (
        <ScannerLayout title="Putaway" hideHeader noBack flash={flash}>
          <ScannerToastBar toasts={toasts} />
          <VerificationHeader counted={0} total={0} po="PUTAWAY" pl="" grn="" tab="boxes" onTabChange={() => {}} onBack={() => setStep('scan_items')} title="Putaway" />
          <div className="scan-empty">
            <div className="scan-empty-icon">⇨</div>
            <div className="scan-empty-title">Tote is empty</div>
            <div className="scan-empty-msg">Go back and pick items first</div>
          </div>
        </ScannerLayout>
      )
    }

    return (
      <ScannerLayout title={`Place ${cti.item_code}`} hideHeader noBack flash={scanState === 'rejected' || flash === 'err' ? 'err' : scanState === 'accepted' || flash === 'ok' ? 'ok' : null}>
        <ScannerToastBar toasts={toasts} />
        <VerificationHeader
          counted={toteItems.filter(i => i.status === 'placed').length}
          total={toteItems.length}
          po="PUTAWAY"
          pl={suggestion?.location_code || ''}
          grn={session?.id ? `#${session.id}` : '—'}
          tab="boxes"
          onTabChange={() => {}}
          onBack={() => setStep('scan_items')}
          title={`Place ${cti.item_code}`}
        />
        {loading ? (
          <div className="scan-skeleton">
            <div className="scan-skeleton-line" />
            <div className="scan-skeleton-line" />
          </div>
        ) : suggestion ? (
          <>
            <div className="suggest-card best" style={{ margin: 0 }}>
              <div className="suggest-card-loc">{suggestion.location_code}</div>
              <div className="suggest-card-reason">{suggestion.reason?.replace(/_/g, ' ')} · free: {suggestion.free_capacity ?? '—'}</div>
              <div className="suggest-card-meta">
                <span className="suggest-card-stat"><strong>Velocity:</strong> {suggestion.velocity_tier}</span>
                <span className="suggest-card-stat"><strong>Shelf:</strong> {suggestion.shelf_band}</span>
                {suggestion.free_capacity != null && <span className="suggest-card-stat"><strong>Free:</strong> {suggestion.free_capacity} pcs</span>}
              </div>
            </div>
            <ScanCard
              state={scanState}
              code={lastScanCode}
              reason={scanReason}
              onMarkDamaged={() => {}}
              canMarkDamaged={false}
              onRestart={restartScanner}
              onManualEntry={onLocationScan}
              placeholder="Scan destination bin..."
              viewport={
                <div className="scan-live-viewport">
                  <CameraScanner
                    key={cameraKey}
                    open={true}
                    embedded
                    continuous
                    onClose={restartScanner}
                    onScan={onLocationScan}
                  />
                </div>
              }
            />
          </>
        ) : (
          <div className="scan-empty">
            <div className="scan-empty-icon">📦</div>
            <div className="scan-empty-title">No location suggestion</div>
            <div className="scan-empty-msg">No bins available for this item</div>
          </div>
        )}
      </ScannerLayout>
    )
  }

  // ─── ITEM CONFIRM (re-scan item, place one by one) ───
  if (step === 'item_confirm') {
    const cti = currentToteItem()

    if (!cti || !scannedLocation) {
      return (
        <ScannerLayout title="Putaway" hideHeader noBack flash={flash}>
          <ScannerToastBar toasts={toasts} />
          <VerificationHeader counted={0} total={0} po="PUTAWAY" pl="" grn="" tab="boxes" onTabChange={() => {}} onBack={() => setStep('suggest_location')} title="Putaway" />
          <div className="scan-empty">
            <div className="scan-empty-icon">⇨</div>
            <div className="scan-empty-title">Ready to place</div>
            <div className="scan-empty-msg">Scan location first</div>
          </div>
        </ScannerLayout>
      )
    }

    return (
      <ScannerLayout title={`Place ${cti.item_code} at ${scannedLocation.code}`} hideHeader noBack flash={scanState === 'rejected' ? 'err' : scanState === 'accepted' ? 'ok' : flash === 'err' ? 'err' : flash === 'ok' ? 'ok' : null}>
        <ScannerToastBar toasts={toasts} />
        <VerificationHeader
          counted={placedAtBin}
          total={cti.qty}
          po="PUTAWAY"
          pl={scannedLocation.code}
          grn={session?.id ? `#${session.id}` : '—'}
          tab="boxes"
          onTabChange={() => {}}
          onBack={() => setStep('suggest_location')}
          title={`Place ${cti.item_code} at ${scannedLocation.code}`}
        />
        <ScanCard
          state={scanState}
          code={lastScanCode}
          reason={scanReason}
          onMarkDamaged={() => {}}
          canMarkDamaged={false}
          onRestart={restartScanner}
          onManualEntry={onItemConfirm}
          placeholder={`Scan ${cti.item_code} to place...`}
          viewport={
            <div className="scan-live-viewport">
              <CameraScanner
                key={cameraKey}
                open={true}
                embedded
                continuous
                onClose={restartScanner}
                onScan={onItemConfirm}
              />
            </div>
          }
        />
        <div className="scan-progress-bar" style={{ marginTop: 8 }}>
          <div className="scan-progress-fill" style={{ width: `${cti.qty > 0 ? (placedAtBin / cti.qty) * 100 : 0}%` }} />
        </div>
        <div className="scan-badge ok" style={{ alignSelf: 'center' }}>{placedAtBin} of {cti.qty} at {scannedLocation.code}</div>
      </ScannerLayout>
    )
  }

  // ─── COMPLETE ───
  if (step === 'complete') {
    const placedItems = toteItems.filter(i => i.status === 'placed')

    return (
      <ScannerLayout title="Putaway Complete" hideHeader noBack flash={flash}>
        <ScannerToastBar toasts={toasts} />
        <div className="rw-complete">
          <div className="rw-complete-icon">✓</div>
          <div className="rw-complete-title">Putaway Complete!</div>
          <div className="rw-complete-stats">
            <div className="rw-complete-stat">
              <div className="rw-complete-stat-value">{placedItems.length}</div>
              <div className="rw-complete-stat-label">Items placed</div>
            </div>
            <div className="rw-complete-stat">
              <div className="rw-complete-stat-value">{usedLocationIds.length}</div>
              <div className="rw-complete-stat-label">Bins used</div>
            </div>
          </div>
          {placedItems.length > 0 && (
            <div className="scan-section-card" style={{ marginTop: 12 }}>
              <div className="scan-section-title">Placed Items</div>
              {placedItems.map(item => (
                <div key={item.id} className="scan-row" style={{ marginTop: 8 }}>
                  <div className="scan-row-info">
                    <div className="scan-row-code">{item.item_code}</div>
                    <div className="scan-row-desc">{item.item_name || ''} → {item.target_location_code || 'placed'}</div>
                  </div>
                  <div className="scan-row-meta">
                    <div className="scan-row-qty">{item.qty}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rw-complete-actions">
            <button
              className="scan-btn scan-btn-primary"
              onClick={() => {
                setSelectedZone(null)
                setSuggestion(null)
                setToteItems([])
                setUsedLocationIds([])
                setScannedLocation(null)
                setSelectedToteItemId(null)
                setPlacedAtBin(0)
                setSession(null)
                setStep('mode_select')
                void loadQueue()
                void loadZones()
              }}
            >
              New Putaway
            </button>
          </div>
        </div>
      </ScannerLayout>
    )
  }

  return (
    <ScannerLayout title="Putaway">
      <ScannerToastBar toasts={toasts} />
      <p>Step: {step}</p>
    </ScannerLayout>
  )
}