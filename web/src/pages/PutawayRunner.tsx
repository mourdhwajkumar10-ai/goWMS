import { useState, useCallback, useEffect, useMemo } from 'react'
import { ArrowLeft, Check, ChevronRight, Scan, MapPin, Package } from 'lucide-react'
import api from '../services/api'
import CameraScanner from '../components/CameraScanner'
import { useScanFeedback } from '../hooks/useScanFeedback'
import '../styles/scanner.css'

/* ── Types ── */
interface QueueItem {
  id: number; item_code: string; item_name?: string | null
  warehouse_id: number; warehouse_code: string; location_id: number
  location_code: string; batch_no: string; qty: number; location_type: string
  zone: string; suggested_location_id?: number | null; suggested_location_code?: string | null
}

interface SuggestResult {
  location_id: number; location_code: string; reason: string
  free_capacity: number | null; on_hand_qty: number; candidates: any[]
  velocity_tier: string; shelf_band: string; max_fit_qty?: number
  requires_split?: boolean; remaining_after_fit?: number; requested_qty?: number
}

type PutawayStep = 'mode_select' | 'scan_items' | 'suggest_location' | 'place_items' | 'complete'
type RunnerMode = 'zone' | 'item'

/* ── Receiving-style progress header ── */
function ProgressHeader({ counted, total, label, step, zone }: {
  counted: number; total: number; label: string; step: PutawayStep; zone?: string
}) {
  const pct = total > 0 ? Math.round((counted / total) * 100) : 0
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--border)', background: 'var(--background)', padding: '16px 16px 12px', margin: '-20px -16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Putaway
          </h1>
          {zone && <span style={{ padding: '3px 10px', borderRadius: 9999, background: 'var(--accent-light, #dbeafe)', color: 'var(--accent, #2563eb)', fontSize: 11, fontWeight: 600 }}>Zone {zone}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>{counted}</span>
          <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>/{total}</span>
        </div>
      </div>
      <div className="scan-progress-bar" role="img" aria-label={`${counted} of ${total} ${label}, ${pct} percent`}>
        <div className="scan-progress-fill" style={{ width: `${Math.max(pct, 1.5)}%` }} />
      </div>
      {/* Step dots */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['scan_items', 'suggest_location', 'place_items'] as const).map((s, i) => {
          const steps = ['scan_items', 'suggest_location', 'place_items']
          const currentIdx = steps.indexOf(step === 'complete' ? 'place_items' : step)
          const dotState = i < currentIdx ? 'done' : i === currentIdx ? 'current' : ''
          return <div key={s} className={`scan-progress-dot ${dotState}`} style={{ height: 6, flex: 1, borderRadius: 9999, background: dotState === 'done' || dotState === 'current' ? 'var(--primary)' : 'var(--border)', transition: 'background 0.3s ease', ...(dotState === 'current' ? { animation: 'smPulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite' } : {}) }} />
        })}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground)' }}>{label}</div>
    </div>
  )
}

/* ── Scan result card (matches Receiving box row) ── */
function ScannedItemCard({ item, index, total }: { item: QueueItem; index: number; total: number }) {
  return (
    <div className="rw-box-row" data-status="verified" style={{ cursor: 'default' }}>
      <div className="rw-box-row-dot" />
      <div className="rw-box-row-info">
        <div className="rw-box-row-num">{item.item_code}</div>
        <div className="rw-box-row-meta">{item.item_name || '—'} · {item.qty} @ {item.location_code}</div>
      </div>
      <div className="rw-box-row-badge">{index}/{total}</div>
    </div>
  )
}

/* ── Suggestion card (matches Receiving route flash) ── */
function SuggestionCard({ suggestion, onReject, onTryNext }: {
  suggestion: SuggestResult; onReject: () => void; onTryNext: () => void
}) {
  return (
    <div className="rw-route-flash" style={{ margin: '0 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <MapPin size={16} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
          Go to {suggestion.location_code}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>
        {suggestion.reason?.replace(/_/g, ' ')} · free: {suggestion.free_capacity ?? '—'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onTryNext} className="scan-btn scan-btn-outline scan-btn-sm" style={{ flex: 1 }}>
          Try next →
        </button>
        <button onClick={onReject} className="scan-btn scan-btn-outline scan-btn-sm" style={{ flex: 1 }}>
          Reject
        </button>
      </div>
    </div>
  )
}

/* ── Main Component ── */
export default function PutawayRunner() {
  const fb = useScanFeedback()
  const [mode, setMode] = useState<RunnerMode | null>(null)
  const [step, setStep] = useState<PutawayStep>('mode_select')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [scannedItems, setScannedItems] = useState<QueueItem[]>([])
  const [currentItem, setCurrentItem] = useState<QueueItem | null>(null)
  const [suggestion, setSuggestion] = useState<SuggestResult | null>(null)
  const [scannedLocation, setScannedLocation] = useState<{ id: number; code: string } | null>(null)
  const [totalToPlace, setTotalToPlace] = useState(0)
  const [zone, setZone] = useState('')
  const [zones, setZones] = useState<{ zone: string; count: number }[]>([])
  const [session, setSession] = useState<{ id: number; warehouse_id: number } | null>(null)
  const [pickedItemId, setPickedItemId] = useState<number | null>(null)
  const [scanCode, setScanCode] = useState('')
  const [toasts, setToasts] = useState<{ id: number; text: string; type: string }[]>([])
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)
  const [placeQty, setPlaceQty] = useState(0)

  const totalPending = zones.reduce((sum, z) => sum + z.count, 0)

  const toast = useCallback((text: string, type: 'success' | 'warning' | 'error' = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, text, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }, [])

  const doFlash = useCallback((t: 'success' | 'error') => { setFlash(t); setTimeout(() => setFlash(null), 300) }, [])

  const refreshZones = useCallback(async () => {
    try { const r: any = await api.get('/putaway/queue/zones'); if (r.ok) setZones(r.data ?? []) } catch {}
  }, [])

  const refreshQueue = useCallback(async () => {
    if (!mode) return
    const useZone = mode === 'zone' && zone
    const zoneParam = useZone ? `?zone=${encodeURIComponent(zone)}` : ''
    const r: any = await api.get(`/putaway/queue${zoneParam}`)
    if (r.ok) setQueue(Array.isArray(r.data) ? r.data : [])
  }, [mode, zone])

  useEffect(() => { void refreshZones() }, [refreshZones])
  useEffect(() => { void refreshQueue() }, [refreshQueue])

  const dedupedQueue = useMemo(() => {
    const map = new Map<string, QueueItem>()
    for (const q of queue) {
      const key = `${q.item_code.toUpperCase()}|${q.location_id}`
      const existing = map.get(key)
      if (!existing || q.qty > existing.qty) map.set(key, q)
    }
    return Array.from(map.values())
  }, [queue])

  const ensureSession = useCallback(async (warehouseId: number) => {
    if (session) return session.id
    const r: any = await api.post('/putaway/sessions', { warehouse_id: warehouseId, zone })
    if (!r.ok || !r.data?.id) { toast(r.error ?? 'Could not start session', 'error'); return null }
    setSession({ id: r.data.id, warehouse_id: warehouseId })
    return r.data.id as number
  }, [session, zone, toast])

  /* ── Handle camera/keyboard scan ── */
  const handleScan = useCallback(async (code: string) => {
    const clean = code.trim().toUpperCase()
    if (!clean) return
    setScanCode('')

    // STEP: scan_items — scan item barcodes → immediately suggest location
    if (step === 'scan_items') {
      const match = dedupedQueue.find(q => q.item_code.toUpperCase() === clean)
      if (!match) {
        doFlash('error'); toast(`Not in queue: ${clean}`, 'error'); return
      }
      if (scannedItems.some(s => s.item_code.toUpperCase() === clean && s.location_id === match.location_id)) {
        doFlash('error'); toast(`Already scanned: ${clean}`, 'error'); return
      }
      doFlash('success')
      const newScanned = [...scannedItems, match]
      setScannedItems(newScanned)
      toast(`✓ ${match.item_code} scanned (${newScanned.length}/${dedupedQueue.length})`, 'success')

      // Immediately pick this item and get suggestion
      setCurrentItem(match)
      setTotalToPlace(match.qty)
      setPlaceQty(0)
      const sid = await ensureSession(match.warehouse_id)
      if (sid) {
        const r: any = await api.post(`/putaway/sessions/${sid}/pick`, {
          item_code: match.item_code, source_location_id: match.location_id, qty: match.qty,
        })
        if (r.ok && r.data?.id) {
          setPickedItemId(r.data.id)
          const s: any = await api.get(`/putaway/suggest?item_code=${encodeURIComponent(match.item_code)}&qty=${match.qty}&warehouse_id=${match.warehouse_id}`)
          if (s.ok) setSuggestion(s.data as SuggestResult)
          setStep('suggest_location')
        } else {
          toast(r.error ?? 'Pick failed', 'error')
        }
      }
      return
    }

    // STEP: suggest_location — scan destination bin
    if (step === 'suggest_location') {
      const r: any = await api.get('/masterdata/locations')
      const location = r.ok && Array.isArray(r.data) ? r.data.find((l: any) => String(l.code ?? '').toUpperCase() === clean) : null
      if (!location) { doFlash('error'); toast(`Location not found: ${clean}`, 'error'); return }
      setScannedLocation({ id: location.id, code: location.code })
      doFlash('success')
      toast(`✓ Bin ${location.code} confirmed`, 'success')
      setStep('place_items')
      return
    }

    // STEP: place_items — scan item barcode to confirm placement
    if (step === 'place_items' && currentItem && pickedItemId && session) {
      if (clean !== currentItem.item_code.toUpperCase()) {
        doFlash('error'); toast(`Scan ${currentItem.item_code} to place`, 'error'); return
      }
      const r: any = await api.post(`/putaway/sessions/${session.id}/place/${pickedItemId}`, {
        target_location_id: scannedLocation!.id, qty: 1,
      })
      if (!r.ok) { doFlash('error'); toast(r.error ?? 'Place failed', 'error'); return }
      doFlash('success')
      const newPlaced = placeQty + 1
      setPlaceQty(newPlaced)
      toast(`✓ ${currentItem.item_code} placed (${newPlaced}/${totalToPlace})`, 'success')

      if (newPlaced >= totalToPlace) {
        // This item done — check for next unscanned items
        const remaining = dedupedQueue.filter(q => !scannedItems.some(s => s.item_code.toUpperCase() === q.item_code.toUpperCase() && s.location_id === q.location_id) || q.item_code.toUpperCase() !== currentItem!.item_code.toUpperCase())
        if (remaining.length > 0) {
          // Go back to scan step for next item
          setCurrentItem(null)
          setPickedItemId(null)
          setScannedLocation(null)
          setSuggestion(null)
          setPlaceQty(0)
          setStep('scan_items')
        } else {
          setStep('complete')
        }
      }
      return
    }
  }, [step, dedupedQueue, scannedItems, mode, currentItem, pickedItemId, session, scannedLocation, placeQty, totalToPlace, ensureSession, doFlash, toast])

  /* ── Mode select ── */
  if (!mode) {
    return (
      <div className="rw-page" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 12, fontWeight: 500 }}>Choose a putaway mode</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" onClick={() => { setMode('zone'); setStep('scan_items') }} className="scan-select-card" style={{ textAlign: 'left', width: '100%' }}>
            <div className="scan-select-card-title">By Zone</div>
            <div className="scan-select-card-sub">Scan all items in a zone, then place them</div>
            <div className="scan-select-card-meta">
              <span>{totalPending} pending</span>
              <span>{zones.length} zones</span>
            </div>
          </button>
          <button type="button" onClick={() => { setMode('item'); setStep('scan_items') }} className="scan-select-card" style={{ textAlign: 'left', width: '100%' }}>
            <div className="scan-select-card-title">By Item</div>
            <div className="scan-select-card-sub">Scan an item, get location, place it</div>
            <div className="scan-select-card-meta">
              <span>{totalPending} in queue</span>
            </div>
          </button>
        </div>
        {totalPending === 0 && (
          <div className="scan-empty" style={{ marginTop: 8 }}>
            <div className="scan-empty-icon"><Check size={40} strokeWidth={1.8} /></div>
            <div className="scan-empty-title">All clear!</div>
            <div className="scan-empty-msg">No items waiting for putaway</div>
          </div>
        )}
      </div>
    )
  }

  /* ── Scan items step ── */
  if (step === 'scan_items') {
    return (
      <div className="rw-page">
        {flash && <div className={`scan-flash show ${flash}`} />}
        <div style={{ padding: '0 16px' }}>
          <ProgressHeader counted={scannedItems.length} total={dedupedQueue.length} label="items scanned" step={step} zone={zone || undefined} />
        </div>

        {/* Back button */}
        <div style={{ padding: '8px 16px 0' }}>
          <button type="button" onClick={() => { setMode(null); setStep('mode_select'); setScannedItems([]); setQueue([]); setZone('') }} className="scan-btn scan-btn-outline scan-btn-sm" style={{ width: 'auto', alignSelf: 'flex-start' }}>
            <ArrowLeft size={14} /> Modes
          </button>
        </div>

        {/* Camera — hero */}
        <div style={{ padding: '8px 16px' }}>
          <div style={{ borderRadius: 12, overflow: 'hidden', minHeight: 180, background: '#111' }}>
            <CameraScanner
              open embedded continuous onClose={() => {}}
              onScan={(scanned) => { const clean = String(scanned || '').trim(); if (clean) void handleScan(clean) }}
            />
          </div>
        </div>

        {/* Scan prompt */}
        <div className="rw-scan-prompt" style={{ padding: '0 16px 8px' }}>
          <Scan size={16} style={{ verticalAlign: -3, marginRight: 4 }} />
          {mode === 'zone' ? 'Scan item barcode in this zone' : 'Scan item barcode'}
        </div>

        {/* Manual input */}
        <div className="rw-manual-row" style={{ padding: '0 16px 8px' }}>
          <input
            type="text" className="rw-manual-field"
            value={scanCode} onChange={e => setScanCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleScan(scanCode) } }}
            placeholder="Type barcode..." autoFocus autoComplete="off"
          />
          <button className="rw-manual-go" onClick={() => void handleScan(scanCode)} disabled={!scanCode.trim()}>Go</button>
        </div>

        {/* Scanned items list */}
        {scannedItems.length > 0 && (
          <div style={{ padding: '0 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Scanned ({scannedItems.length})
            </div>
            {scannedItems.map((item, i) => (
              <ScannedItemCard key={`${item.item_code}-${item.location_id}`} item={item} index={i + 1} total={dedupedQueue.length} />
            ))}
          </div>
        )}

        {/* Signoff CTA */}
        <div style={{ padding: '12px 16px', marginTop: 'auto' }}>
          <button
            className="scan-btn scan-btn-primary"
            style={{ width: '100%', minHeight: 56, fontSize: 16, gap: 10 }}
            disabled={scannedItems.length === 0}
            onClick={() => {
              if (scannedItems.length > 0) {
                const firstItem = scannedItems[0]
                setCurrentItem(firstItem)
                setTotalToPlace(firstItem.qty)
                setPlaceQty(0)
                void (async () => {
                  const sid = await ensureSession(firstItem.warehouse_id)
                  if (!sid) return
                  const r: any = await api.post(`/putaway/sessions/${sid}/pick`, {
                    item_code: firstItem.item_code, source_location_id: firstItem.location_id, qty: firstItem.qty,
                  })
                  if (r.ok && r.data?.id) {
                    setPickedItemId(r.data.id)
                    const s: any = await api.get(`/putaway/suggest?item_code=${encodeURIComponent(firstItem.item_code)}&qty=${firstItem.qty}&warehouse_id=${firstItem.warehouse_id}`)
                    if (s.ok) setSuggestion(s.data as SuggestResult)
                    setStep('suggest_location')
                  }
                })()
              }
            }}
          >
            <span>Continue to placement</span>
            <span style={{ borderRadius: 9999, background: 'oklch(1 0 0 / 0.15)', padding: '4px 10px', fontSize: 12, fontWeight: 500 }}>
              {scannedItems.length} scanned
            </span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    )
  }

  /* ── Suggest location step ── */
  if (step === 'suggest_location' && currentItem && suggestion) {
    return (
      <div className="rw-page">
        {flash && <div className={`scan-flash show ${flash}`} />}
        <div style={{ padding: '0 16px' }}>
          <ProgressHeader counted={scannedItems.indexOf(currentItem)} total={scannedItems.length} label={`Placing ${currentItem.item_code}`} step={step} zone={zone || undefined} />
        </div>

        <div style={{ padding: '8px 16px 0' }}>
          <button type="button" onClick={() => setStep('scan_items')} className="scan-btn scan-btn-outline scan-btn-sm" style={{ width: 'auto' }}>
            <ArrowLeft size={14} /> Back to scanning
          </button>
        </div>

        {/* Camera */}
        <div style={{ padding: '8px 16px' }}>
          <div style={{ borderRadius: 12, overflow: 'hidden', minHeight: 180, background: '#111' }}>
            <CameraScanner
              open embedded continuous onClose={() => {}}
              onScan={(scanned) => { const clean = String(scanned || '').trim(); if (clean) void handleScan(clean) }}
            />
          </div>
        </div>

        <div className="rw-scan-prompt" style={{ padding: '0 16px 8px' }}>
          <MapPin size={16} style={{ verticalAlign: -3, marginRight: 4 }} />
          Scan destination bin
        </div>

        <div className="rw-manual-row" style={{ padding: '0 16px 8px' }}>
          <input type="text" className="rw-manual-field" value={scanCode} onChange={e => setScanCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleScan(scanCode) } }}
            placeholder="Scan or type bin code..." autoFocus autoComplete="off" />
          <button className="rw-manual-go" onClick={() => void handleScan(scanCode)} disabled={!scanCode.trim()}>Go</button>
        </div>

        <div style={{ padding: '0 16px' }}>
          <SuggestionCard
            suggestion={suggestion}
            onReject={() => { setSuggestion(null); toast('Location rejected', 'warning') }}
            onTryNext={() => {
              const next = suggestion.candidates?.[1]
              if (next) setSuggestion({ ...suggestion, location_id: next.location_id, location_code: next.location_code, reason: next.reason })
            }}
          />
        </div>

        <div className="rw-route-flash" style={{ margin: '8px 16px 0', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
            Place: {currentItem.item_code} ({currentItem.qty} pcs)
          </div>
          <div style={{ fontSize: 12, color: '#3b82f6' }}>
            Scan the destination bin shown above
          </div>
        </div>
      </div>
    )
  }

  /* ── Place items step ── */
  if (step === 'place_items' && currentItem && scannedLocation) {
    return (
      <div className="rw-page">
        {flash && <div className={`scan-flash show ${flash}`} />}
        <div style={{ padding: '0 16px' }}>
          <ProgressHeader counted={placeQty} total={totalToPlace} label={`${currentItem.item_code} → ${scannedLocation.code}`} step={step} zone={zone || undefined} />
        </div>

        <div style={{ padding: '8px 16px 0' }}>
          <button type="button" onClick={() => setStep('suggest_location')} className="scan-btn scan-btn-outline scan-btn-sm" style={{ width: 'auto' }}>
            <ArrowLeft size={14} /> Change location
          </button>
        </div>

        {/* Camera */}
        <div style={{ padding: '8px 16px' }}>
          <div style={{ borderRadius: 12, overflow: 'hidden', minHeight: 180, background: '#111' }}>
            <CameraScanner
              open embedded continuous onClose={() => {}}
              onScan={(scanned) => { const clean = String(scanned || '').trim(); if (clean) void handleScan(clean) }}
            />
          </div>
        </div>

        <div className="rw-scan-prompt" style={{ padding: '0 16px 8px' }}>
          <Package size={16} style={{ verticalAlign: -3, marginRight: 4 }} />
          Scan {currentItem.item_code} to place ({placeQty}/{totalToPlace})
        </div>

        <div className="rw-manual-row" style={{ padding: '0 16px 8px' }}>
          <input type="text" className="rw-manual-field" value={scanCode} onChange={e => setScanCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleScan(scanCode) } }}
            placeholder={`Scan ${currentItem.item_code}...`} autoFocus autoComplete="off" />
          <button className="rw-manual-go" onClick={() => void handleScan(scanCode)} disabled={!scanCode.trim()}>Go</button>
        </div>

        {/* Placed items progress */}
        <div style={{ padding: '0 16px' }}>
          <div className="rw-route-flash" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>
              Placing at {scannedLocation.code}
            </div>
            <div style={{ fontSize: 12, color: '#059669' }}>
              {placeQty} of {totalToPlace} items placed
            </div>
            <div className="scan-progress-bar" style={{ marginTop: 8 }}>
              <div className="scan-progress-fill" style={{ width: `${totalToPlace > 0 ? (placeQty / totalToPlace) * 100 : 0}%`, background: '#10b981' }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Complete ── */
  if (step === 'complete') {
    return (
      <div className="rw-page" style={{ padding: 16 }}>
        <div className="rw-complete">
          <div className="rw-complete-icon">✓</div>
          <div className="rw-complete-title">Putaway Complete!</div>
          <div className="rw-complete-stats">
            <div className="rw-complete-stat">
              <div className="rw-complete-stat-value">{scannedItems.length}</div>
              <div className="rw-complete-stat-label">Items placed</div>
            </div>
            <div className="rw-complete-stat">
              <div className="rw-complete-stat-value">{scannedLocation?.code || '—'}</div>
              <div className="rw-complete-stat-label">Last bin</div>
            </div>
          </div>
          <div className="rw-complete-actions">
            <button className="rw-btn rw-btn-primary" onClick={() => {
              setMode(null); setStep('mode_select'); setScannedItems([]); setQueue([])
              setCurrentItem(null); setSuggestion(null); setScannedLocation(null)
              setPlaceQty(0); setPickedItemId(null); setZone('')
            }}>
              New putaway
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
