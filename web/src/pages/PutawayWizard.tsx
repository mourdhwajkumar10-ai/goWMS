import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ScannerInput from '../components/ScannerInput'
import ButtonPress from '../components/ButtonPress'
import { useHaptic } from '../hooks/useHaptic'
import '../styles/putaway-wizard.css'

function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="pw-skeleton pw-skeleton-card">
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="pw-skeleton pw-skeleton-line" style={{ width: '50%' }} />
            <div className="pw-skeleton pw-skeleton-line" style={{ width: '30%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <div className="pw-empty-state">
      <div className="pw-empty-icon">{icon}</div>
      <div className="pw-empty-title">{title}</div>
      <div className="pw-empty-msg">{message}</div>
    </div>
  )
}

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
  const [transitionDir, setTransitionDir] = useState<'forward' | 'backward'>('forward')
  const [mode, setMode] = useState<'zone' | 'item' | null>(null)
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [zones, setZones] = useState<ZoneInfo[]>([])
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<QueueRow | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [session, setSession] = useState<SessionData | null>(null)
  const [toteItems, setToteItems] = useState<ToteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [fitReason, setFitReason] = useState<'too_small' | 'too_large'>('too_small')
  const [fitQty, setFitQty] = useState('')
  const [fitOverride, setFitOverride] = useState('')
  const [fitOverrideId, setFitOverrideId] = useState<number | null>(null)
  const [pickingItemId, setPickingItemId] = useState<number | null>(null)
  const [putawayError, setPutawayError] = useState<{ type: string; message: string; data?: any } | null>(null)
  const [locationScanInput, setLocationScanInput] = useState('')
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false)
  const [usedLocationIds, setUsedLocationIds] = useState<number[]>([])
  const [placeQty, setPlaceQty] = useState<number | null>(null)
  const [confirmPlace, setConfirmPlace] = useState<{ targetId: number; targetCode: string; qty: number; isOverride: boolean } | null>(null)

  const haptic = useHaptic()

  const animClass = transitionDir === 'forward' ? 'pw-animate-in' : 'pw-animate-out'

  const navigate = useCallback((next: WizardStep, dir: 'forward' | 'backward' = 'forward') => {
    setTransitionDir(dir)
    setStep(next)
  }, [])

  const handleCancelSession = useCallback(async () => {
    if (!session) return
    const r = await api.del(`/putaway/sessions/${session.id}`)
    if (r.ok) {
      notify({ type: 'info', title: 'Session cancelled', message: 'Session items preserved for resume' })
      setSession(null)
      setToteItems([])
      setUsedLocationIds([])
      setSuggestion(null)
      navigate('mode_select', 'backward')
    } else {
      notify({ type: 'error', title: 'Cancel failed', message: r.error || 'Could not cancel session' })
    }
  }, [session, navigate])

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

  useEffect(() => {
    if (step === 'putaway' && toteItems.length > 0) {
      const currentToteItem = toteItems.find(i => i.status === 'picked')
      if (currentToteItem) {
        void (async () => {
          setLoading(true)
          const r = await api.putawaySuggest(
            currentToteItem.item_code,
            currentToteItem.qty,
            session?.warehouse_id,
            usedLocationIds.length > 0 ? { excludeLocationIds: usedLocationIds } : undefined
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
  }, [step, toteItems, session, usedLocationIds])

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
      navigate('putaway', 'forward')
    } else {
      notify({ type: 'warning', title: 'Not in tote', message: `"${code}" is not in your tote or already placed` })
    }
  }, [toteItems, haptic, navigate])

  function currentToteItem() {
    return toteItems.find(i => i.status === 'picked') || null
  }

  const doPlace = useCallback(async (targetId: number, isOverride = false, placeQty?: number, targetCode?: string) => {
    const item = currentToteItem()
    if (!item) return
    const code = targetCode || ''
    const body: any = { target_location_id: targetId, is_override: isOverride }
    if (placeQty && placeQty > 0) body.qty = placeQty
    const r = await api.post(`/putaway/sessions/${session?.id}/place/${item.id}`, body)
    if (r.ok) {
      haptic(30)
      const newUsedIds = [...usedLocationIds, targetId]
      setUsedLocationIds(newUsedIds)
      const resp = r.data as any
      const remaining = resp?.remaining ?? 0
      setToteItems(toteItems.map(i => i.id === item.id ? { ...i, status: remaining > 0 ? 'picked' : 'placed', qty: remaining > 0 ? remaining : i.qty } : i))
      notify({ type: 'success', title: 'Placed', message: `${item.item_code} × ${placeQty || item.qty} placed at ${code}${remaining > 0 ? ` · ${remaining} remaining` : ''}` })
      setLocationScanInput('')
      setPutawayError(null)
      if (remaining > 0) {
        setLoading(true)
        const sr = await api.putawaySuggest(item.item_code, remaining, session?.warehouse_id, {
          excludeLocationIds: newUsedIds
        })
        if (sr.ok && sr.data) {
          setSuggestion(sr.data)
          notify({ type: 'info', title: 'Next bin suggested', message: `Remaining ${remaining} → ${sr.data.location_code}` })
        }
        setLoading(false)
      } else if (toteItems.filter(i => i.status === 'picked').length <= 1) {
        navigate('complete', 'forward')
      }
    } else {
      const errType = r.errorType || (r.data as any)?.error_type || 'unknown'
      setPutawayError({ type: errType, message: r.error || 'Could not place item', data: r.data as any })
      setShowLocationSuggestions(false)
      notify({ type: 'error', title: 'Place failed', message: r.error || 'Could not place item' })
    }
  }, [session, usedLocationIds, toteItems, haptic, navigate])

  function handleLocationConfirm(code: string, locationId?: number) {
    if (suggestion && (code === suggestion.location_code || locationId === suggestion.location_id)) {
      setConfirmPlace({
        targetId: suggestion.location_id,
        targetCode: suggestion.location_code,
        qty: suggestion.max_fit_qty != null && suggestion.max_fit_qty < (currentToteItem()?.qty || 0)
          ? (placeQty ?? suggestion.max_fit_qty)
          : (currentToteItem()?.qty || 0),
        isOverride: false
      })
    } else if (suggestion?.candidates) {
      const candidate = suggestion.candidates.find((c: any) => c.location_code === code || c.location_id === locationId)
      if (candidate) {
        setConfirmPlace({
          targetId: candidate.location_id,
          targetCode: candidate.location_code,
          qty: currentToteItem()?.qty || 0,
          isOverride: true
        })
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
      <div className={`desk-page ${animClass}`}>
        <div className="desk-head">
          <h1>Putaway</h1>
        </div>

        <div className="pw-mode-grid">
          <ButtonPress className="pw-mode-card" onClick={() => { setMode('zone'); navigate('zone_select', 'forward') }}>
            <span className="pw-mode-icon">⇨</span>
            <span className="pw-mode-label">By Zone</span>
            <span className="pw-mode-subtitle">Batch putaway by HSN zone</span>
          </ButtonPress>
          <ButtonPress className="pw-mode-card" onClick={() => { setMode('item'); navigate('item_pick', 'forward') }}>
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

        {dataLoading ? (
          <SkeletonCards count={2} />
        ) : queue.length > 0 ? (
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
        ) : (
          <EmptyState
            icon="⇨"
            title="No items staged"
            message="Items must be staged before putaway"
          />
        )}
      </div>
    )
  }

  // ─── ZONE SELECT ───
  if (step === 'zone_select') {
    return (
      <div className={`desk-page ${animClass}`}>
        <div className="desk-head">
          <ButtonPress onClick={() => navigate('mode_select', 'backward')}>← Back</ButtonPress>
          <h1>Select Zone</h1>
        </div>
        {dataLoading ? (
          <SkeletonCards count={4} />
        ) : (
          <>
            <div className="pw-zone-grid">
              {zones.map(z => (
                <ButtonPress
                  key={z.zone}
                  className="pw-zone-card"
                  onClick={() => { setSelectedZone(z.zone); navigate('item_pick', 'forward') }}
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
          {zones.length === 0 && (
            <EmptyState icon="⇨" title="No zones ready" message="No items are staged for putaway" />
          )}
          </>
        )}
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
      <div className={`desk-page ${animClass}`}>
        <div className="desk-head">
          <ButtonPress onClick={() => navigate(mode === 'zone' ? 'zone_select' : 'mode_select', 'backward')}>← Back</ButtonPress>
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
                  onClick={() => navigate('putaway', 'forward')}
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
          {dataLoading ? (
            <SkeletonCards count={3} />
          ) : zoneItems.length === 0 ? (
            <EmptyState
              icon="📦"
              title={selectedZone ? `No items in Zone ${selectedZone}` : "No items staged"}
              message="Pick items from staging to start putaway"
            />
          ) : (
            zoneItems.map(q => (
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
          )))}
        </div>
      </div>
    )
  }

  // ─── PUTAWAY STEP ───
  if (step === 'putaway') {
    const cti = currentToteItem()

    return (
      <div className={`desk-page ${animClass}`}>
        <div className="desk-head">
          <ButtonPress onClick={() => navigate('item_pick', 'backward')}>← Back</ButtonPress>
          <h1>Putaway</h1>
          {session && (
            <ButtonPress className="erpnext-btn-secondary pw-cancel-btn" onClick={handleCancelSession}>
              ✕ Cancel
            </ButtonPress>
          )}
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
                  {(suggestion as any).last_picked_by && (
                    <span className="pw-suggestion-tag pw-last-picked">👤 Last picked by {(suggestion as any).last_picked_by}</span>
                  )}
                </div>
                {suggestion.max_fit_qty != null && suggestion.max_fit_qty < (cti?.qty || 0) && (
                  <div className="pw-split-indicator">
                    <span className="pw-split-badge">⚠ Split required</span>
                    <span className="pw-split-detail">
                      {suggestion.max_fit_qty > 0
                        ? <>Bin fits <strong>{suggestion.max_fit_qty}</strong> of {cti?.qty} · {suggestion.remaining_after_fit ?? (cti?.qty ?? 0) - suggestion.max_fit_qty} will need another bin</>
                        : <>Bin is full ({suggestion.free_capacity ?? 0} free) — find another bin</>
                      }
                    </span>
                    {(suggestion.max_fit_qty ?? 0) > 0 && (
                      <div className="pw-qty-override">
                        <label className="erpnext-label" style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, display: 'block' }}>Qty to place:</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="number"
                            className="erpnext-input"
                            style={{ width: 80, fontSize: 16, fontWeight: 700, textAlign: 'center' }}
                            min={1}
                            max={suggestion.max_fit_qty}
                            value={placeQty ?? suggestion.max_fit_qty}
                            onChange={e => {
                              const v = Math.max(1, Math.min(Number(e.target.value) || 1, suggestion.max_fit_qty || 1))
                              setPlaceQty(v)
                            }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--pw-text-dim, #6b7280)' }}>of {cti?.qty}</span>
                          <ButtonPress
                            className="erpnext-btn-primary"
                            onClick={() => {
                              const qty = placeQty ?? suggestion.max_fit_qty ?? cti?.qty ?? 0
                              setConfirmPlace({
                                targetId: suggestion.location_id,
                                targetCode: suggestion.location_code,
                                qty,
                                isOverride: qty > (suggestion.max_fit_qty || 0)
                              })
                            }}
                          >
                            Place {placeQty ?? suggestion.max_fit_qty ?? '?'} here
                          </ButtonPress>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {suggestion && (suggestion.max_fit_qty == null || suggestion.max_fit_qty >= (cti?.qty || 0)) && (
                  <ButtonPress
                    className="erpnext-btn-primary flex-1"
                    onClick={() => {
                      setConfirmPlace({
                        targetId: suggestion.location_id,
                        targetCode: suggestion.location_code,
                        qty: cti?.qty || 0,
                        isOverride: false
                      })
                    }}
                  >
                    Place all {cti?.qty} here
                  </ButtonPress>
                )}
                <ButtonPress
                  className="erpnext-btn-secondary flex-1"
                  onClick={() => {
                    setFitQty(String(suggestion?.max_fit_qty || cti?.qty || 0))
                    navigate('fit_exception', 'forward')
                  }}
                >
                  ⇩ Doesn't fit
                </ButtonPress>
              </div>
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
                        setLoading(true)
                        void (async () => {
                          const r = await api.putawaySuggest(cti?.item_code || '', cti?.qty || 0, session?.warehouse_id, {
                            excludeLocationIds: [...usedLocationIds, suggestion?.location_id].filter(Boolean) as number[]
                          })
                          if (r.ok && r.data) setSuggestion(r.data)
                          setLoading(false)
                        })()
                      }}>⇨ Find another bin</ButtonPress>
                      <ButtonPress className="erpnext-btn-secondary pw-exception-btn" onClick={() => {
                        const maxFit = putawayError.data?.bin_capacity || 0
                        const already = putawayError.data?.bin_on_hand || 0
                        const room = Math.max(0, maxFit - already)
                        setFitQty(String(Math.min(room, cti?.qty || 0)))
                        navigate('fit_exception', 'forward')
                      }}>
                        ⇩ Split quantity
                      </ButtonPress>
                      <ButtonPress className="erpnext-btn-secondary pw-exception-btn pw-exception-override" onClick={() => {
                        void (async () => {
                          const targetId = suggestion?.location_id
                          const fits = suggestion?.max_fit_qty || cti?.qty || 0
                          if (!targetId) return
                          const r = await api.post(`/putaway/sessions/${session?.id}/place/${cti?.id}`, {
                            target_location_id: targetId, is_override: true, qty: fits
                          })
                          if (r.ok) {
                            haptic(30)
                            const resp = r.data as any
                            const remaining = resp?.remaining ?? 0
                            const placed = resp?.quantity ?? cti?.qty ?? 0
                            setUsedLocationIds([...usedLocationIds, targetId])
                            if (remaining > 0) {
                              setToteItems(toteItems.map(i => i.id === cti?.id ? { ...i, qty: remaining, status: 'picked' } : i))
                              setPutawayError(null)
                              notify({ type: 'info', title: 'Partial override', message: `${placed} placed, ${remaining} remaining → suggesting next bin` })
                              setLoading(true)
                              const sr = await api.putawaySuggest(cti?.item_code || '', remaining, session?.warehouse_id, {
                                excludeLocationIds: [...usedLocationIds, targetId]
                              })
                              if (sr.ok && sr.data) setSuggestion(sr.data)
                              setLoading(false)
                            } else {
                              setToteItems(toteItems.map(i => i.id === cti?.id ? { ...i, status: 'placed' } : i))
                              setPutawayError(null)
                              notify({ type: 'success', title: 'Override placed', message: `${placed} × ${cti?.item_code} forced into ${suggestion?.location_code}` })
                              if (toteItems.filter(i => i.status === 'picked').length <= 1) navigate('complete', 'forward')
                            }
                          } else {
                            notify({ type: 'error', title: 'Override failed', message: r.error || 'Could not place' })
                          }
                        })()
                      }}>
                        ⚡ Force place (up to {suggestion?.max_fit_qty || cti?.qty} pcs)
                      </ButtonPress>
                      <ButtonPress className="erpnext-btn-secondary pw-exception-btn pw-exception-danger" onClick={() => navigate('fit_exception', 'forward')}>
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


          </>
        ) : (
          <EmptyState
            icon="⇨"
            title="Tote is empty"
            message="Go back and pick items first"
          />
        )}

        {/* Confirmation Modal */}
        {confirmPlace && (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
            }}
            onClick={() => setConfirmPlace(null)}
          >
            <div
              style={{
                background: '#fff', borderRadius: 12, padding: 24, maxWidth: 400, width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
              }}
              onClick={e => e.stopPropagation()}
            >
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Confirm Placement</h3>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, marginBottom: 8 }}>
                  Place <strong>{confirmPlace.qty}</strong> × <strong>{cti?.item_code}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--pw-text-dim, #6b7280)' }}>
                  <span>{cti?.source}</span>
                  <span>→</span>
                  <span style={{ fontWeight: 700, color: 'var(--pw-accent, #2563eb)', fontFamily: 'monospace' }}>{confirmPlace.targetCode}</span>
                </div>
                {confirmPlace.isOverride && (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                    ⚠ Override — qty exceeds suggested capacity
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ButtonPress
                  className="erpnext-btn-secondary flex-1"
                  onClick={() => setConfirmPlace(null)}
                >
                  Cancel
                </ButtonPress>                  <ButtonPress
                  className="erpnext-btn-primary flex-1"
                  onClick={() => {
                    const cp = confirmPlace
                    setConfirmPlace(null)
                    void doPlace(cp.targetId, cp.isOverride, cp.qty, cp.targetCode)
                  }}
                >
                  ✓ Place {confirmPlace.qty}
                </ButtonPress>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── FIT EXCEPTION ───
  if (step === 'fit_exception') {
    const cti = currentToteItem()
    return (
      <div className={`desk-page ${animClass}`}>
        <div className="desk-head">
          <ButtonPress onClick={() => navigate('putaway', 'backward')}>← Back</ButtonPress>
          <h1>Doesn't Fit</h1>
        </div>
        {cti && (
          <>
            <div className="pw-current-item-card">
              <div className="pw-current-item-code">{cti.item_code}</div>
              <div className="pw-current-item-name">{cti.qty} × into {suggestion?.location_code || 'this bin'}</div>
            </div>

            <div className="mb-4">
              <label className="erpnext-label font-semibold">How many actually fit in this bin?</label>
              <input className="erpnext-input" type="number" min={1} max={cti.qty} value={fitQty}
                onChange={e => setFitQty(e.target.value)} placeholder="Enter quantity" style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
              <p className="text-xs text-dim mt-1">System estimated {suggestion?.max_fit_qty || cti.qty} · Adjust if different</p>
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
                  rejected_location_id: suggestion?.location_id, reason: 'too_small',
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

                const newUsedIds = fits > 0 && targetId ? [...usedLocationIds, targetId] : usedLocationIds
                setUsedLocationIds(newUsedIds)

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
                    navigate('complete', 'forward')
                    return
                  }
                }

                setFitQty('')
                setFitOverride('')
                setFitOverrideId(null)
                setPutawayError(null)
                navigate('putaway', 'backward')
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
      <div className={`desk-page ${animClass}`}>
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
            navigate(mode === 'zone' ? 'item_pick' : 'mode_select', 'forward')
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
