import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ScannerInput from '../components/ScannerInput'
import ButtonPress from '../components/ButtonPress'
import { useHaptic } from '../hooks/useHaptic'
import '../styles/putaway-wizard.css'

type WizardStep =
  | 'mode_select'
  | 'zone_select'
  | 'item_pick'
  | 'putaway'
  | 'fit_exception'
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
}

interface ToteItem {
  id: number
  item_code: string
  item_name: string | null
  qty: number
  status: string
  source: string
  source_location_id?: number
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
  const [step, setStep] = useState<WizardStep>('mode_select')
  const [mode, setMode] = useState<'zone' | 'item' | null>(null)
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [zones, setZones] = useState<ZoneInfo[]>([])
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<QueueRow | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [session, setSession] = useState<SessionData | null>(null)
  const [toteItems, setToteItems] = useState<ToteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fitReason, setFitReason] = useState<'too_small' | 'too_large'>('too_small')
  const [fitQty, setFitQty] = useState('')
  const [fitOverride, setFitOverride] = useState('')
  const [fitOverrideId, setFitOverrideId] = useState<number | null>(null)
  const [pickingItemId, setPickingItemId] = useState<number | null>(null)
  const [putawayError, setPutawayError] = useState<{ type: string; message: string; data?: any } | null>(null)
  const [locationScanInput, setLocationScanInput] = useState('')
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false)

  const haptic = useHaptic()

  const loadQueue = useCallback(async () => {
    const r = await api.putawayQueue()
    if (r.ok) setQueue((r.data ?? []) as QueueRow[])
  }, [])

  const loadZones = useCallback(async () => {
    const r = await api.get('/putaway/queue/zones')
    if (r.ok && Array.isArray(r.data)) setZones(r.data)
  }, [])

  useEffect(() => {
    void loadQueue()
    void loadZones()
  }, [loadQueue, loadZones])

  useEffect(() => {
    if (step === 'putaway' && toteItems.length > 0) {
      const currentToteItem = toteItems.find(i => i.status === 'picked')
      if (currentToteItem) {
        void (async () => {
          setLoading(true)
          const r = await api.putawaySuggest(
            currentToteItem.item_code,
            currentToteItem.qty,
            session?.warehouse_id
          )
          if (r.ok && r.data) {
            setSuggestion(r.data)
          } else {
            notify({ type: 'error', title: 'No location found', message: r.error || 'No bins available for this item' })
          }
          setLoading(false)
        })()
      }
    }
  }, [step, toteItems, session])

  const loadSession = useCallback(async (sessionId: number) => {
    const r = await api.get<{ session: SessionData; items: ToteItem[] }>(`/putaway/sessions/${sessionId}`)
    if (r.ok && r.data) {
      setSession(r.data.session)
      setToteItems(r.data.items ?? [])
    }
  }, [])

  useEffect(() => {
    if (locationScanInput.trim().length === 0) {
      setShowLocationSuggestions(false)
      return
    }
    setShowLocationSuggestions(true)
  }, [locationScanInput])

  const ensureSession = useCallback(async () => {
    if (!session && queue.length > 0) {
      const wid = queue[0].warehouse_id
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

  const handlePick = useCallback(async (q: QueueRow) => {
    setPickingItemId(q.id)
    try {
      const sid = await ensureSession()
      if (!sid) {
        notify({ type: 'error', title: 'Error', message: 'Failed to create session. Try again.' })
        return
      }
      const r = await api.post(`/putaway/sessions/${sid}/pick`, {
        item_code: q.item_code,
        source_location_id: q.location_id,
        qty: q.qty
      })
      if (r.ok && r.data) {
        const newItem: ToteItem = {
          id: (r.data as any).id,
          item_code: q.item_code,
          item_name: q.item_name,
          qty: q.qty,
          status: 'picked',
          source: q.location_code,
          source_location_id: q.location_id
        }
        setToteItems(prev => [...prev, newItem])
        setQueue(prev => prev.filter(item => item.id !== q.id))
        setZones(prev => prev.map(z => z.zone === q.zone ? { ...z, count: z.count - 1 } : z).filter(z => z.count > 0))
        haptic(20)
        notify({ type: 'success', title: 'Picked', message: `${q.item_code} × ${q.qty} added to tote` })
      } else {
        notify({ type: 'error', title: 'Pick failed', message: r.error || 'Could not pick this item' })
      }
    } catch {
      notify({ type: 'error', title: 'Network error', message: 'Check your connection and try again' })
    } finally {
      setPickingItemId(null)
    }
  }, [ensureSession, haptic])

  const handleScanPick = useCallback((code: string) => {
    if (!code) return
    const q = code.trim().toLowerCase()
    const match = queue.find(item => item.item_code.toLowerCase() === q)
    if (match) {
      void handlePick(match)
    } else {
      const partial = queue.find(item =>
        item.item_code.toLowerCase().includes(q) ||
        (item.item_name && item.item_name.toLowerCase().includes(q))
      )
      if (partial) {
        void handlePick(partial)
      } else {
        notify({ type: 'warning', title: 'Not found', message: `"${code}" is not in the staging queue` })
      }
    }
  }, [queue, handlePick])

  const handleToteScan = useCallback((code: string) => {
    if (!code) return
    const match = toteItems.find(t => t.item_code.toLowerCase() === code.toLowerCase() && t.status === 'picked')
    if (match) {
      haptic(20)
      setStep('putaway')
    } else {
      notify({ type: 'warning', title: 'Not in tote', message: `"${code}" is not in your tote or already placed` })
    }
  }, [toteItems, haptic])

  function currentToteItem() {
    return toteItems.find(i => i.status === 'picked') || null
  }

  function handleLocationConfirm(code: string, locationId?: number) {
    const item = currentToteItem()
    if (!item) return

    const doPlace = async (targetId: number, isOverride = false, placeQty?: number) => {
      const body: any = { target_location_id: targetId, is_override: isOverride }
      if (placeQty && placeQty > 0) body.qty = placeQty
      const r = await api.post(`/putaway/sessions/${session?.id}/place/${item.id}`, body)
      if (r.ok) {
        haptic(30)
        setToteItems(toteItems.map(i => i.id === item.id ? { ...i, status: 'placed' } : i))
        notify({ type: 'success', title: 'Placed', message: `${item.item_code} × ${item.qty} placed at ${code}` })
        setLocationScanInput('')
        setPutawayError(null)
        if (toteItems.filter(i => i.status === 'picked').length <= 1) setStep('complete')
      } else {
        const errType = r.errorType || (r.data as any)?.error_type || 'unknown'
        setPutawayError({ type: errType, message: r.error || 'Could not place item', data: r.data as any })
        setShowLocationSuggestions(false)
        notify({ type: 'error', title: 'Place failed', message: r.error || 'Could not place item' })
      }
    }

    if (suggestion && (code === suggestion.location_code || locationId === suggestion.location_id)) {
      void doPlace(suggestion.location_id)
    } else if (suggestion?.candidates) {
      const candidate = suggestion.candidates.find((c: any) => c.location_code === code || c.location_id === locationId)
      if (candidate) {
        void doPlace(candidate.location_id)
      } else if (locationId) {
        void doPlace(locationId, true)
      } else {
        void (async () => {
          const r = await api.get<{ id: number; code: string }[]>('/masterdata/locations')
          if (r.ok && r.data) {
            const loc = r.data.find((l: any) => l.code?.toUpperCase() === code.toUpperCase())
            if (loc) {
              void doPlace(loc.id, true)
            } else {
              notify({ type: 'error', title: 'Location not found', message: `No location matching "${code}"` })
            }
          } else {
            notify({ type: 'error', title: 'Location lookup failed', message: 'Could not search locations' })
          }
        })()
      }
    } else {
      void (async () => {
        const r = await api.get<{ id: number; code: string }[]>('/masterdata/locations')
        if (r.ok && r.data) {
          const loc = r.data.find((l: any) => l.code?.toUpperCase() === code.toUpperCase())
          if (loc) {
            void doPlace(loc.id, true)
          } else {
            notify({ type: 'error', title: 'Location not found', message: `No location matching "${code}"` })
          }
        } else {
          notify({ type: 'error', title: 'Location lookup failed', message: 'Could not search locations' })
        }
      })()
    }
  }

  const allCandidates = suggestion?.candidates || []
  const placedCount = toteItems.filter(i => i.status === 'placed').length
  const pickedCount = toteItems.filter(i => i.status === 'picked').length
  const totalCount = toteItems.length
  const progressPct = totalCount > 0 ? (placedCount / totalCount) * 100 : 0

  // ─── MODE SELECT ───
  if (step === 'mode_select') {
    return (
      <div className="desk-page pw-animate-in">
        <div className="desk-head">
          <h1>Putaway</h1>
        </div>

        <div className="pw-mode-grid">
          <ButtonPress className="pw-mode-card" onClick={() => { setMode('zone'); setStep('zone_select') }}>
            <span className="pw-mode-icon">⇨</span>
            <span className="pw-mode-label">By Zone</span>
            <span className="pw-mode-subtitle">Batch putaway by HSN zone</span>
          </ButtonPress>
          <ButtonPress className="pw-mode-card" onClick={() => { setMode('item'); setStep('item_pick') }}>
            <span className="pw-mode-icon">📦</span>
            <span className="pw-mode-label">By Item</span>
            <span className="pw-mode-subtitle">Single item putaway</span>
          </ButtonPress>
        </div>

        <div className="pw-queue-banner">
          <span className="pw-queue-count">{queue.length}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>items pending in staging</div>
            <div className="pw-queue-label">Ready for putaway to storage bins</div>
          </div>
        </div>

        {queue.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text-dim, #888)' }}>Top items:</p>
            {queue.slice(0, 5).map(q => (
              <div key={q.id} className="pw-queue-item">
                <div className="pw-queue-item-info">
                  <span className="pw-queue-item-code">{q.item_code}</span>
                  <span className="pw-queue-item-name">{q.item_name || ''}</span>
                  <span className="pw-queue-item-qty">From {q.location_code}</span>
                  {q.suggested_location_code && (
                    <span className="text-dim text-xs" style={{ marginLeft: 8, color: 'var(--accent)' }}>
                      → {q.suggested_location_code}
                    </span>
                  )}
                </div>
                <div className="pw-queue-item-actions">
                  <span className="pw-qty-badge">{q.qty} pcs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── ZONE SELECT ───
  if (step === 'zone_select') {
    return (
      <div className="desk-page pw-animate-in">
        <div className="desk-head">
          <ButtonPress onClick={() => setStep('mode_select')}>← Back</ButtonPress>
          <h1>Select Zone</h1>
        </div>
        <div className="pw-zone-grid">
          {zones.map(z => (
            <ButtonPress
              key={z.zone}
              className="pw-zone-card"
              onClick={() => { setSelectedZone(z.zone); setStep('item_pick') }}
            >
              <span
                className="pw-zone-letter"
                data-zone={z.zone}
                style={{ background: ZONE_COLORS[z.zone] || '#6b7280' }}
              >
                {z.zone}
              </span>
              <div className="pw-zone-info">
                <div className="pw-zone-name">{ZONE_LABELS[z.zone] || `Zone ${z.zone}`}</div>
                <div className="pw-zone-count">{z.count} items ready</div>
              </div>
              <span className="pw-zone-arrow">→</span>
            </ButtonPress>
          ))}
        </div>
        {zones.length === 0 && <p className="text-dim">No items by zone</p>}
      </div>
    )
  }

  // ─── ITEM PICK ───
  if (step === 'item_pick') {
    const zoneItems = selectedZone
      ? queue.filter(q => q.zone === selectedZone)
      : queue
    const totePicked = toteItems.filter(i => i.status === 'picked')

    return (
      <div className="desk-page pw-animate-in">
        <div className="desk-head">
          <ButtonPress onClick={() => setStep(mode === 'zone' ? 'zone_select' : 'mode_select')}>← Back</ButtonPress>
          <h1>{selectedZone ? `Zone ${selectedZone} · ${ZONE_LABELS[selectedZone] || ''}` : 'Select Items'}</h1>
        </div>

        {toteItems.length > 0 && (
          <div className="pw-tote-section">
            <div className="pw-tote-header">
              <div className="pw-tote-title">
                ⇨ Tote
                <span className="pw-tote-count-badge">{totePicked.length} of {totalCount}</span>
              </div>
              {totePicked.length > 0 && (
                <ButtonPress
                  className="erpnext-btn-primary pw-start-putaway-btn"
                  onClick={() => setStep('putaway')}
                >
                  Start Putaway →
                </ButtonPress>
              )}
            </div>

            <div className="pw-scan-section" style={{ padding: 0, background: 'transparent', border: 'none', marginBottom: 12 }}>
              <ScannerInput
                onScan={handleToteScan}
                placeholder="Scan item to jump to putaway..."
                suggestions={toteItems.map(t => ({ code: t.item_code, name: t.item_name || '', qty: t.qty }))}
                showTorch={false}
                autoFocus={false}
              />
            </div>

            {toteItems.map(item => (
              <div key={item.id} className="pw-tote-item">
                <div className="pw-tote-item-info">
                  <div className="pw-tote-item-top">
                    <span style={{ fontWeight: 600 }}>{item.item_code}</span>
                    {item.status === 'placed'
                      ? <span className="pw-status-badge pw-placed">✓ Placed</span>
                      : <span className="pw-status-badge pw-picked">Ready</span>
                    }
                  </div>
                  <div className="pw-tote-item-bottom">
                    <span>{item.item_name || ''}</span>
                    <span>·</span>
                    <span>From {item.source}</span>
                    <span>·</span>
                    <span style={{ fontWeight: 600 }}>{item.qty} pcs</span>
                  </div>
                </div>
                <div className="pw-tote-item-actions">
                  <ButtonPress
                    className="erpnext-btn-secondary btn-sm"
                    onClick={() => {
                      void api.del(`/putaway/sessions/${session?.id}/items/${item.id}`)
                      setToteItems(toteItems.filter(i => i.id !== item.id))
                      notify({ type: 'success', title: 'Removed', message: `${item.item_code} removed from tote` })
                    }}
                  >✕</ButtonPress>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pw-scan-section">
          <div className="pw-scan-section-title">⇩ Scan or Pick Items from Staging</div>
          <ScannerInput
            onScan={handleScanPick}
            placeholder="Scan item barcode or type item code..."
            suggestions={queue.map(q => ({ code: q.item_code, name: q.item_name || '', qty: q.qty }))}
            showTorch={false}
            autoFocus={false}
          />
        </div>

        <div className="pw-available-section">
          <div className="pw-available-header">
            Available Items <span className="pw-available-count">({zoneItems.length})</span>
          </div>
          {zoneItems.map(q => (
            <div key={q.id} className="pw-item-row">
              <div className="pw-item-row-info">
                <div className="pw-item-row-code">{q.item_code}</div>
                <div className="pw-item-row-name">{q.item_name || ''}</div>
                <div className="pw-item-row-meta">
                  <span>From {q.location_code}</span>
                  {q.batch_no && <span>· Batch {q.batch_no}</span>}
                </div>
                {q.suggested_location_code && (
                  <div className="text-dim text-xs" style={{ marginTop: 4 }}>
                    Suggested: <span style={{ color: 'var(--accent)' }}>{q.suggested_location_code}</span>
                  </div>
                )}
              </div>
              <div className="pw-item-row-actions">
                <span className="pw-qty-badge">{q.qty} pcs</span>
                <ButtonPress
                  className={`erpnext-btn-secondary ${pickingItemId === q.id ? 'pw-picking' : ''}`}
                  disabled={pickingItemId === q.id}
                  onClick={() => void handlePick(q)}
                >
                  {pickingItemId === q.id ? 'Picking...' : 'Pick'}
                </ButtonPress>
              </div>
            </div>
          ))}
          {zoneItems.length === 0 && (
            <p className="text-dim">No items in this zone ready for putaway</p>
          )}
        </div>
      </div>
    )
  }

  // ─── PUTAWAY STEP ───
  if (step === 'putaway') {
    const cti = currentToteItem()

    return (
      <div className="desk-page pw-animate-in">
        <div className="desk-head">
          <ButtonPress onClick={() => setStep('item_pick')}>← Back</ButtonPress>
          <h1>Putaway</h1>
        </div>

        <div className="pw-putaway-progress">
          <span className="pw-progress-text">Placing item {placedCount + 1} of {totalCount}</span>
          <div className="pw-progress-bar">
            <div className="pw-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="pw-progress-text">{pickedCount} remaining</span>
        </div>

        {cti ? (
          <>
            <div className="pw-current-item-card">
              <div className="pw-current-item-header">
                <div>
                  <div className="pw-current-item-code">{cti.item_code}</div>
                  <div className="pw-current-item-name">{cti.item_name || ''}</div>
                </div>
                <span className="pw-qty-badge pw-qty-badge-lg">{cti.qty} pcs</span>
              </div>

              <div className="pw-current-item-flow">
                <div className="pw-flow-from">
                  <span className="pw-flow-label">From</span>
                  <span className="pw-flow-code">{cti.source}</span>
                </div>
                <span className="pw-flow-arrow">→</span>
                <div className="pw-flow-to">
                  <span className="pw-flow-label">To</span>
                  <span className="pw-flow-code" style={{ color: suggestion ? 'var(--accent)' : 'var(--text-dim)' }}>
                    {suggestion ? suggestion.location_code : '...'}
                  </span>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="pw-loading-card">
                <div className="pw-spinner"></div>
                <p className="text-dim">Finding best location...</p>
              </div>
            ) : suggestion ? (
              <div className="pw-suggestion-card">
                <div className="pw-suggestion-label">⇨ Suggested Location</div>
                <div className="pw-location-code">{suggestion.location_code}</div>
                <div className="pw-suggestion-meta">
                  <span className="pw-suggestion-tag"><strong>Reason:</strong> {suggestion.reason}</span>
                  <span className="pw-suggestion-tag"><strong>Velocity:</strong> {suggestion.velocity_tier}</span>
                  <span className="pw-suggestion-tag"><strong>Shelf:</strong> {suggestion.shelf_band}</span>
                  {suggestion.free_capacity != null && (
                    <span className="pw-suggestion-tag"><strong>Free:</strong> {suggestion.free_capacity} pcs</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-dim">No location suggestion available</p>
            )}

            <div className="pw-location-scan-section">
              <div className="pw-scan-section-title">⇨ Scan or type location to confirm</div>
              <ScannerInput
                onScan={(code) => handleLocationConfirm(code)}
                placeholder="Scan bin barcode or type location..."
                suggestions={allCandidates.map((c: any) => ({
                  code: c.location_code,
                  name: c.reason,
                }))}
                onSelectSuggestion={(code) => handleLocationConfirm(code)}
                autoFocus={true}
                showTorch={false}
              />
            </div>

            {putawayError && (
              <div className="pw-exception-panel">
                <div className="pw-exception-title">⚠ Putaway Exception</div>
                <div className="pw-exception-msg">{putawayError.message}</div>
                <div className="pw-exception-actions">
                  {putawayError.type === 'bin_full' && (
                    <>
                      <ButtonPress className="erpnext-btn-secondary pw-exception-btn" onClick={() => {
                        setPutawayError(null)
                        notify({ type: 'info', title: 'Finding next location', message: 'System will suggest another bin' })
                        setLoading(true)
                        void (async () => {
                          const r = await api.putawaySuggest(cti?.item_code || '', cti?.qty || 0, session?.warehouse_id)
                          if (r.ok && r.data) setSuggestion(r.data)
                          setLoading(false)
                        })()
                      }}>⇨ Find another bin</ButtonPress>
                      <ButtonPress className="erpnext-btn-secondary pw-exception-btn" onClick={() => {
                        const maxFit = putawayError.data?.bin_capacity || 0
                        const already = putawayError.data?.bin_on_hand || 0
                        const room = Math.max(0, maxFit - already)
                        setFitQty(String(Math.min(room, cti?.qty || 0)))
                        setStep('fit_exception')
                      }}>
                        ⇩ Split quantity
                      </ButtonPress>
                      <ButtonPress className="erpnext-btn-secondary pw-exception-btn pw-exception-danger" onClick={() => setStep('fit_exception')}>
                        ⚠ Report issue
                      </ButtonPress>
                    </>
                  )}
                  {putawayError.type === 'mixed_items' && (
                    <>
                      <ButtonPress className="erpnext-btn-secondary pw-exception-btn" onClick={() => {
                        setPutawayError(null)
                        setLoading(true)
                        void (async () => {
                          const r = await api.putawaySuggest(cti?.item_code || '', cti?.qty || 0, session?.warehouse_id)
                          if (r.ok && r.data) setSuggestion(r.data)
                          setLoading(false)
                        })()
                      }}>⇨ Find empty bin</ButtonPress>
                      <ButtonPress className="erpnext-btn-secondary pw-exception-btn" onClick={() => {
                        notify({ type: 'warning', title: 'Override blocked', message: 'Mixed items not allowed. Find an empty bin instead.' })
                      }}>
                        ⚠ Override (needs approval)
                      </ButtonPress>
                    </>
                  )}
                  {!['bin_full', 'mixed_items'].includes(putawayError.type) && (
                    <ButtonPress className="erpnext-btn-secondary pw-exception-btn" onClick={() => setPutawayError(null)}>
                      Dismiss
                    </ButtonPress>
                  )}
                </div>
              </div>
            )}

            <ButtonPress className="erpnext-btn-secondary w-full mt-1" onClick={() => setStep('fit_exception')}>
              ⇩ Doesn't fit
            </ButtonPress>
          </>
        ) : (
          <p className="text-dim">No items in tote. Go back and pick items first.</p>
        )}
      </div>
    )
  }

  // ─── FIT EXCEPTION ───
  if (step === 'fit_exception') {
    const cti = currentToteItem()
    return (
      <div className="desk-page pw-animate-in">
        <div className="desk-head">
          <ButtonPress onClick={() => setStep('putaway')}>← Back</ButtonPress>
          <h1>Doesn't Fit</h1>
        </div>
        {cti && (
          <>
            <div className="pw-current-item-card">
              <div className="pw-current-item-code">{cti.item_code}</div>
              <div className="pw-current-item-name">{cti.qty} × into {suggestion?.location_code || 'this bin'}</div>
            </div>

            <div className="pw-fit-panel">
              <div className="pw-fit-panel-title">⚠ What's wrong?</div>
              <div className="pw-fit-fields">
                <ButtonPress
                  className={fitReason === 'too_small' ? 'erpnext-btn-primary flex-1' : 'erpnext-btn-secondary flex-1'}
                  onClick={() => setFitReason('too_small')}
                >Bin too small</ButtonPress>
                <ButtonPress
                  className={fitReason === 'too_large' ? 'erpnext-btn-primary flex-1' : 'erpnext-btn-secondary flex-1'}
                  onClick={() => setFitReason('too_large')}
                >Item too large</ButtonPress>
              </div>
            </div>

            <div className="mb-4">
              <label className="erpnext-label font-semibold">How many fit?</label>
              <input className="erpnext-input" type="number" min={0} max={cti.qty} value={fitQty}
                onChange={e => setFitQty(e.target.value)} placeholder="0 = do not use this bin" />
              <p className="text-xs text-dim mt-1">Suggested {cti.qty} · Enter how many actually fit</p>
            </div>

            <div className="mb-4">
              <label className="erpnext-label font-semibold">Override location (optional)</label>
              <input className="erpnext-input" value={fitOverride}
                onChange={e => { setFitOverride(e.target.value); setFitOverrideId(null) }}
                placeholder="Type location code to override" />
              {suggestion?.candidates && suggestion.candidates.length > 0 && (
                <select className="erpnext-input mt-1" value={fitOverrideId ?? ''}
                  onChange={e => {
                    const id = +e.target.value
                    const c = suggestion.candidates.find((x: any) => x.location_id === id)
                    if (c) { setFitOverride(c.location_code); setFitOverrideId(c.location_id) }
                  }}>
                  <option value="">Suggested other bins</option>
                  {suggestion.candidates.filter((c: any) => c.location_id !== suggestion.location_id).map((c: any) => (
                    <option key={c.location_id} value={c.location_id}>{c.location_code} — {c.reason}</option>
                  ))}
                </select>
              )}
            </div>

            <ButtonPress className="erpnext-btn-primary w-full" onClick={() => {
              void (async () => {
                const fits = +(fitQty || 0)
                const remaining = cti.qty - fits

                const excR = await api.post('/putaway/fit-exception', {
                  item_code: cti.item_code, rejected_location: suggestion?.location_code,
                  rejected_location_id: suggestion?.location_id, reason: fitReason,
                  requested_qty: cti.qty, fits_qty: fits,
                  override_location: fitOverride || undefined, override_location_id: fitOverrideId || undefined
                })
                if (!excR.ok) {
                  notify({ type: 'error', title: 'Error', message: excR.error || 'Failed to record exception' })
                  return
                }

                const targetId = fitOverrideId || suggestion?.location_id
                let placeR: any = { ok: false }
                if (fits > 0 && targetId) {
                  placeR = await api.post(`/putaway/sessions/${session?.id}/place/${cti.id}`, {
                    target_location_id: targetId, is_override: !!fitOverrideId, qty: fits
                  })
                  if (placeR.ok) {
                    haptic(20)
                    notify({ type: 'success', title: 'Partial placed', message: `${fits} × ${cti.item_code} placed at ${fitOverride || suggestion?.location_code}` })
                  } else {
                    notify({ type: 'warning', title: 'Place failed', message: placeR.error || 'Could not place partial qty' })
                  }
                }

                const actualRemaining = (placeR.ok && placeR.data?.remaining != null)
                  ? placeR.data.remaining : remaining

                if (actualRemaining > 0) {
                  setToteItems(toteItems.map(i =>
                    i.id === cti.id ? { ...i, qty: actualRemaining, status: 'picked' } : i
                  ))
                  notify({ type: 'info', title: 'Remainder', message: `${actualRemaining} × ${cti.item_code} remaining — system will suggest new location` })
                } else {
                  setToteItems(toteItems.map(i =>
                    i.id === cti.id ? { ...i, status: 'placed' } : i
                  ))
                  if (toteItems.filter(i => i.status === 'picked').length <= 1) {
                    setStep('complete')
                    return
                  }
                }

                setFitQty('')
                setFitOverride('')
                setFitOverrideId(null)
                setPutawayError(null)
                setStep('putaway')
              })()
            }} disabled={!(+(fitQty || 0) > 0)}>
              {+(fitQty || 0) > 0 ? `Place ${fitQty} here${+(fitQty || 0) < cti.qty ? ` · ${cti.qty - +(fitQty || 0)} remaining` : ''}` : 'Enter how many fit'}
            </ButtonPress>
          </>
        )}
      </div>
    )
  }

  // ─── COMPLETE ───
  if (step === 'complete') {
    const placedItems = toteItems.filter(i => i.status === 'placed')
    return (
      <div className="desk-page pw-animate-in">
        <div className="desk-head">
          <h1>Putaway Complete</h1>
        </div>
        <div className="pw-complete-card">
          <div className="pw-complete-icon">✓</div>
          <div className="pw-complete-count">
            {placedItems.length} item{placedItems.length !== 1 ? 's' : ''} placed successfully
          </div>
          {placedItems.map(item => (
            <div key={item.id} className="pw-complete-item">
              <div>
                <div style={{ fontWeight: 600 }}>{item.item_code}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{item.item_name || ''}</div>
              </div>
              <span className="pw-qty-badge">{item.qty} pcs</span>
            </div>
          ))}
          <ButtonPress className="erpnext-btn-primary mt-6" onClick={() => {
            setSelectedItem(null); setSuggestion(null); setToteItems([])
            setStep(mode === 'zone' ? 'item_pick' : 'mode_select')
          }}>
            {mode === 'zone' ? 'Next Item' : 'Done'}
          </ButtonPress>
        </div>
      </div>
    )
  }

  return (
    <div className="desk-page">
      <h1>Putaway Wizard</h1>
      <p>Step: {step}</p>
    </div>
  )
}
