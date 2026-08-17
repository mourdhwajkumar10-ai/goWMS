import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
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
  const [showScanner, setShowScanner] = useState(false)
  const [fitReason, setFitReason] = useState<'too_small' | 'too_large'>('too_small')
  const [fitQty, setFitQty] = useState('')
  const [fitOverride, setFitOverride] = useState('')
  const [fitOverrideId, setFitOverrideId] = useState<number | null>(null)
  const [pickingItemId, setPickingItemId] = useState<number | null>(null)
  const [scanInput, setScanInput] = useState('')
  const [scanSuggestions, setScanSuggestions] = useState<QueueRow[]>([])
  const [showScanSuggestions, setShowScanSuggestions] = useState(false)
  const [toteScanInput, setToteScanInput] = useState('')
  const [toteScanSuggestions, setToteScanSuggestions] = useState<ToteItem[]>([])
  const [showToteSuggestions, setShowToteSuggestions] = useState(false)
  const [locationScanInput, setLocationScanInput] = useState('')
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false)
  const [putawayError, setPutawayError] = useState<{ type: string; message: string; data?: any } | null>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const toteScanRef = useRef<HTMLInputElement>(null)

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

  // Filter scan input suggestions from queue
  useEffect(() => {
    if (scanInput.trim().length === 0) {
      setScanSuggestions([])
      return
    }
    const q = scanInput.trim().toLowerCase()
    const matches = queue.filter(item =>
      item.item_code.toLowerCase().includes(q) ||
      (item.item_name && item.item_name.toLowerCase().includes(q)) ||
      item.location_code.toLowerCase().includes(q)
    ).slice(0, 8)
    setScanSuggestions(matches)
    setShowScanSuggestions(matches.length > 0)
  }, [scanInput, queue])

  // Filter tote scan suggestions
  useEffect(() => {
    if (toteScanInput.trim().length === 0) {
      setToteScanSuggestions([])
      return
    }
    const q = toteScanInput.trim().toLowerCase()
    const matches = toteItems.filter(item =>
      item.item_code.toLowerCase().includes(q) ||
      (item.item_name && item.item_name.toLowerCase().includes(q))
    ).slice(0, 8)
    setToteScanSuggestions(matches)
    setShowToteSuggestions(matches.length > 0)
  }, [toteScanInput, toteItems])

  // Filter location scan suggestions from suggestion candidates
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
        notify({ type: 'success', title: 'Picked', message: `${q.item_code} × ${q.qty} added to tote` })
      } else {
        notify({ type: 'error', title: 'Pick failed', message: r.error || 'Could not pick this item' })
      }
    } catch {
      notify({ type: 'error', title: 'Network error', message: 'Check your connection and try again' })
    } finally {
      setPickingItemId(null)
    }
  }, [ensureSession])

  // Handle scan input — pick the matched item
  const handleScanPick = useCallback((itemCode?: string) => {
    const code = (itemCode || scanInput.trim()).toLowerCase()
    if (!code) return
    const match = queue.find(q => q.item_code.toLowerCase() === code)
    if (match) {
      void handlePick(match)
      setScanInput('')
      setShowScanSuggestions(false)
    } else {
      const partial = queue.find(q =>
        q.item_code.toLowerCase().includes(code) ||
        (q.item_name && q.item_name.toLowerCase().includes(code))
      )
      if (partial) {
        void handlePick(partial)
        setScanInput('')
        setShowScanSuggestions(false)
      } else {
        notify({ type: 'warning', title: 'Not found', message: `"${scanInput}" is not in the staging queue` })
      }
    }
  }, [scanInput, queue, handlePick])

  // Handle tote scan — navigate to putaway for a specific item
  const handleToteScan = useCallback((itemCode?: string) => {
    const code = (itemCode || toteScanInput.trim()).toLowerCase()
    if (!code) return
    const match = toteItems.find(t => t.item_code.toLowerCase() === code && t.status === 'picked')
    if (match) {
      setToteScanInput('')
      setShowToteSuggestions(false)
      setStep('putaway')
    } else {
      notify({ type: 'warning', title: 'Not in tote', message: `"${toteScanInput}" is not in your tote or already placed` })
    }
  }, [toteScanInput, toteItems])

  // ─── MODE SELECT ───
  if (step === 'mode_select') {
    return (
      <div className="desk-page">
        <div className="desk-head">
          <h1>Putaway</h1>
        </div>

        <div className="flex gap-4 mb-6">
          <button
            className="pw-mode-card"
            onClick={() => { setMode('zone'); setStep('zone_select') }}
          >
            <span className="pw-mode-icon">⇨</span>
            <span>By Zone</span>
            <span className="pw-mode-subtitle">Batch putaway by HSN zone</span>
          </button>
          <button
            className="pw-mode-card"
            onClick={() => { setMode('item'); setStep('item_pick') }}
          >
            <span className="pw-mode-icon">⇨</span>
            <span>By Item</span>
            <span className="pw-mode-subtitle">Single item putaway</span>
          </button>
        </div>

        {/* Queue summary */}
        <div className="pw-queue-banner">
          <span className="pw-queue-count">{queue.length}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>items pending in staging</div>
            <div className="pw-queue-label">Ready for putaway to storage bins</div>
          </div>
        </div>

        {/* Top items preview */}
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
      <div className="desk-page">
        <div className="desk-head">
          <button onClick={() => setStep('mode_select')}>← Back</button>
          <h1>Select Zone</h1>
        </div>
        {zones.map(z => (
          <button
            key={z.zone}
            className="pw-zone-card"
            onClick={() => { setSelectedZone(z.zone); setStep('item_pick') }}
          >
            <span className="pw-zone-letter">{z.zone}</span>
            <div className="pw-zone-info">
              <div className="pw-zone-name">{ZONE_LABELS[z.zone] || `Zone ${z.zone}`}</div>
              <div className="pw-zone-count">{z.count} items ready</div>
            </div>
            <span className="pw-zone-arrow">→</span>
          </button>
        ))}
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
      <div className="desk-page">
        <div className="desk-head">
          <button onClick={() => setStep(mode === 'zone' ? 'zone_select' : 'mode_select')}>← Back</button>
          <h1>{selectedZone ? `Zone ${selectedZone} · ${ZONE_LABELS[selectedZone] || ''}` : 'Select Items'}</h1>
        </div>

        {/* TOTE SECTION */}
        {toteItems.length > 0 && (
          <div className="pw-tote-section">
            <div className="pw-tote-header">
              <div className="pw-tote-title">
                ⇨ Tote
                <span className="pw-tote-count-badge">{totePicked.length}</span>
              </div>
              {totePicked.length > 0 && (
                <button
                  className="erpnext-btn-primary pw-start-putaway-btn"
                  onClick={() => setStep('putaway')}
                >
                  Start Putaway →
                </button>
              )}
            </div>

            {/* Tote scan input */}
            <div className="pw-scan-input-wrap" style={{ marginBottom: 12 }}>
              <div className="pw-scan-input-row">
                <input
                  ref={toteScanRef}
                  className="erpnext-input pw-scan-field"
                  placeholder="Scan item to jump to putaway..."
                  value={toteScanInput}
                  onChange={e => setToteScanInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleToteScan() }}
                  onFocus={() => toteScanInput.trim() && setShowToteSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowToteSuggestions(false), 200)}
                />
                <button className="erpnext-btn-primary pw-scan-btn" onClick={() => handleToteScan()}>⌕ Find</button>
              </div>
              {showToteSuggestions && toteScanSuggestions.length > 0 && (
                <div className="pw-suggestions-dropdown">
                  {toteScanSuggestions.map(item => (
                    <button key={item.id} className="pw-suggestion-item"
                      onMouseDown={(e) => { e.preventDefault(); handleToteScan(item.item_code) }}>
                      <span className="pw-sug-code">{item.item_code}</span>
                      <span className="pw-sug-name">{item.item_name || ''}</span>
                      <span className="pw-sug-qty">{item.qty} pcs</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tote items list */}
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
                  <button
                    className="erpnext-btn-secondary btn-sm"
                    onClick={() => {
                      void api.del(`/putaway/sessions/${session?.id}/items/${item.id}`)
                      setToteItems(toteItems.filter(i => i.id !== item.id))
                      notify({ type: 'success', title: 'Removed', message: `${item.item_code} removed from tote` })
                    }}
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SCAN INPUT FOR ADDING ITEMS TO TOTE */}
        <div className="pw-scan-section">
          <div className="pw-scan-section-title">⇩ Scan or Pick Items from Staging</div>
          <div className="pw-scan-input-wrap">
            <div className="pw-scan-input-row">
              <input
                ref={scanInputRef}
                className="erpnext-input pw-scan-field"
                placeholder="Scan item barcode or type item code..."
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScanPick() }}
                onFocus={() => scanInput.trim() && setShowScanSuggestions(true)}
                onBlur={() => setTimeout(() => setShowScanSuggestions(false), 200)}
              />
              <button className="erpnext-btn-primary pw-scan-btn" onClick={() => handleScanPick()}>⇩ Pick</button>
            </div>
            {showScanSuggestions && scanSuggestions.length > 0 && (
              <div className="pw-suggestions-dropdown">
                {scanSuggestions.map(item => (
                  <button key={item.id} className="pw-suggestion-item"
                    onMouseDown={(e) => { e.preventDefault(); handleScanPick(item.item_code) }}>
                    <span className="pw-sug-code">{item.item_code}</span>
                    <span className="pw-sug-name">{item.item_name || ''}</span>
                    <span className="pw-sug-qty">{item.qty} pcs · {item.location_code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AVAILABLE ITEMS LIST */}
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
                <button
                  className={`erpnext-btn-secondary ${pickingItemId === q.id ? 'pw-picking' : ''}`}
                  disabled={pickingItemId === q.id}
                  onClick={() => void handlePick(q)}
                >
                  {pickingItemId === q.id ? 'Picking...' : 'Pick'}
                </button>
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
    const currentToteItem = toteItems.find(i => i.status === 'picked')
    const placedCount = toteItems.filter(i => i.status === 'placed').length
    const pickedCount = toteItems.filter(i => i.status === 'picked').length
    const totalCount = toteItems.length
    const allCandidates = suggestion?.candidates || []
    const progressPct = totalCount > 0 ? (placedCount / totalCount) * 100 : 0

    return (
      <div className="desk-page">
        <div className="desk-head">
          <button onClick={() => setStep('item_pick')}>← Back</button>
          <h1>Putaway</h1>
        </div>

        {/* Progress bar */}
        <div className="pw-putaway-progress">
          <span className="pw-progress-text">{placedCount} placed</span>
          <div className="pw-progress-bar">
            <div className="pw-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="pw-progress-sep">·</span>
          <span className="pw-progress-text">{pickedCount} remaining</span>
        </div>

        {currentToteItem ? (
          <>
            {/* Current item card */}
            <div className="pw-current-item-card">
              <div className="pw-current-item-header">
                <div>
                  <div className="pw-current-item-code">{currentToteItem.item_code}</div>
                  <div className="pw-current-item-name">{currentToteItem.item_name || ''}</div>
                </div>
                <span className="pw-qty-badge pw-qty-badge-lg">{currentToteItem.qty} pcs</span>
              </div>

              {/* Source → Target flow */}
              <div className="pw-current-item-flow">
                <div className="pw-flow-from">
                  <span className="pw-flow-label">From</span>
                  <span className="pw-flow-code">{currentToteItem.source}</span>
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

            {/* Suggestion card */}
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

            {/* Location scan input */}
            <div className="pw-location-scan-section">
              <div className="pw-scan-section-title">⇨ Scan or type location to confirm</div>
              <div className="pw-scan-input-wrap">
                <div className="pw-scan-input-row">
                  <input
                    className="erpnext-input pw-scan-field"
                    placeholder="Scan bin barcode or type location..."
                    value={locationScanInput}
                    onChange={e => setLocationScanInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const code = locationScanInput.trim()
                        if (!code) return
                        handleLocationConfirm(code)
                      }
                    }}
                    autoFocus
                  />
                  <button
                    className="erpnext-btn-primary pw-scan-btn"
                    onClick={() => { const code = locationScanInput.trim(); if (code) handleLocationConfirm(code) }}
                  >⇨ Confirm</button>
                </div>
                {showLocationSuggestions && allCandidates.length > 1 && (
                  <div className="pw-suggestions-dropdown">
                    {allCandidates.slice(0, 6).map((c: any) => (
                      <button key={c.location_id}
                        className={`pw-suggestion-item ${suggestion && c.location_id === suggestion.location_id ? 'pw-sug-recommended' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); handleLocationConfirm(c.location_code, c.location_id) }}>
                        <span className="pw-sug-code">{c.location_code}</span>
                        <span className="pw-sug-name">{c.reason}</span>
                        {suggestion && c.location_id === suggestion.location_id && (
                          <span className="pw-sug-badge">★ Best</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Exception buttons when putaway fails */}
            {putawayError && (
              <div className="pw-exception-panel">
                <div className="pw-exception-title">⚠ Putaway Exception</div>
                <div className="pw-exception-msg">{putawayError.message}</div>
                <div className="pw-exception-actions">
                  {putawayError.type === 'bin_full' && (
                    <>
                      <button className="erpnext-btn-secondary pw-exception-btn" onClick={() => {
                        setPutawayError(null)
                        notify({ type: 'info', title: 'Finding next location', message: 'System will suggest another bin' })
                        setLoading(true)
                        void (async () => {
                          const r = await api.putawaySuggest(currentToteItem?.item_code || '', currentToteItem?.qty || 0, session?.warehouse_id)
                          if (r.ok && r.data) setSuggestion(r.data)
                          setLoading(false)
                        })()
                      }}>⇨ Find another bin</button>
                      <button className="erpnext-btn-secondary pw-exception-btn" onClick={() => {
                        // Pre-fill with how many actually fit in this bin
                        const maxFit = putawayError.data?.bin_capacity || 0
                        const already = putawayError.data?.bin_on_hand || 0
                        const room = Math.max(0, maxFit - already)
                        setFitQty(String(Math.min(room, currentToteItem?.qty || 0)))
                        setStep('fit_exception')
                      }}>
                        ⇩ Split quantity
                      </button>
                      <button className="erpnext-btn-secondary pw-exception-btn pw-exception-danger" onClick={() => setStep('fit_exception')}>
                        ⚠ Report issue
                      </button>
                    </>
                  )}
                  {putawayError.type === 'mixed_items' && (
                    <>
                      <button className="erpnext-btn-secondary pw-exception-btn" onClick={() => {
                        setPutawayError(null)
                        setLoading(true)
                        void (async () => {
                          const r = await api.putawaySuggest(currentToteItem?.item_code || '', currentToteItem?.qty || 0, session?.warehouse_id)
                          if (r.ok && r.data) setSuggestion(r.data)
                          setLoading(false)
                        })()
                      }}>⇨ Find empty bin</button>
                      <button className="erpnext-btn-secondary pw-exception-btn" onClick={() => {
                        notify({ type: 'warning', title: 'Override blocked', message: 'Mixed items not allowed. Find an empty bin instead.' })
                      }}>
                        ⚠ Override (needs approval)
                      </button>
                    </>
                  )}
                  {!['bin_full', 'mixed_items'].includes(putawayError.type) && (
                    <button className="erpnext-btn-secondary pw-exception-btn" onClick={() => setPutawayError(null)}>
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            )}

            <button className="erpnext-btn-secondary w-full mt-1" onClick={() => setStep('fit_exception')}>
              ⇩ Doesn't fit
            </button>
          </>
        ) : (
          <p className="text-dim">No items in tote. Go back and pick items first.</p>
        )}

        {/* Scanner Modal */}
        {showScanner && (
          <div className="pw-scanner-overlay">
            <div className="pw-scanner-modal">
              <h2 className="mb-4">Scan Location Barcode</h2>
              <input className="erpnext-input" autoFocus placeholder="Type or scan location code..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const code = (e.target as HTMLInputElement).value.trim()
                    if (code) { handleLocationConfirm(code); setShowScanner(false) }
                  }
                }} />
              <button className="erpnext-btn-secondary w-full mt-3" onClick={() => setShowScanner(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  function handleLocationConfirm(code: string, locationId?: number) {
    if (!currentToteItem()) return
    const item = currentToteItem()!

    const doPlace = async (targetId: number, isOverride = false, placeQty?: number) => {
      const body: any = { target_location_id: targetId, is_override: isOverride }
      if (placeQty && placeQty > 0) body.qty = placeQty
      const r = await api.post(`/putaway/sessions/${session?.id}/place/${item.id}`, body)
      if (r.ok) {
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
        // Look up location by code — allows manual entry when no suggestion
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
      // No suggestion loaded — look up location by code
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

  function currentToteItem() {
    return toteItems.find(i => i.status === 'picked') || null
  }

  // ─── FIT EXCEPTION ───
  if (step === 'fit_exception') {
    const cti = currentToteItem()
    return (
      <div className="desk-page">
        <div className="desk-head">
          <button onClick={() => setStep('putaway')}>← Back</button>
          <h1>Doesn't Fit</h1>
        </div>
        {cti && (
          <>
            <div className="pw-current-item-card">
              <div className="pw-current-item-code">{cti.item_code}</div>
              <div className="pw-current-item-name">{cti.qty} × into {suggestion?.location_code || 'this bin'}</div>
            </div>

            <div className="mb-4">
              <label className="erpnext-label font-semibold">What's wrong?</label>
              <div className="pw-fit-fields">
                <button className={fitReason === 'too_small' ? 'erpnext-btn-primary flex-1' : 'erpnext-btn-secondary flex-1'}
                  onClick={() => setFitReason('too_small')}>Bin too small</button>
                <button className={fitReason === 'too_large' ? 'erpnext-btn-primary flex-1' : 'erpnext-btn-secondary flex-1'}
                  onClick={() => setFitReason('too_large')}>Item too large</button>
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

            <button className="erpnext-btn-primary w-full" onClick={() => {
              void (async () => {
                const fits = +(fitQty || 0)
                const remaining = cti.qty - fits

                // 1. Record the exception
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

                // 2. Place the fitting qty in the current bin (or override bin)
                const targetId = fitOverrideId || suggestion?.location_id
                let placeR: any = { ok: false }
                if (fits > 0 && targetId) {
                  placeR = await api.post(`/putaway/sessions/${session?.id}/place/${cti.id}`, {
                    target_location_id: targetId, is_override: !!fitOverrideId, qty: fits
                  })
                  if (placeR.ok) {
                    notify({ type: 'success', title: 'Partial placed', message: `${fits} × ${cti.item_code} placed at ${fitOverride || suggestion?.location_code}` })
                  } else {
                    notify({ type: 'warning', title: 'Place failed', message: placeR.error || 'Could not place partial qty' })
                  }
                }

                // 3. Use remaining from API response if available, otherwise calculate
                const actualRemaining = (placeR.ok && placeR.data?.remaining != null)
                  ? placeR.data.remaining : remaining

                // 4. Update tote item with remaining qty (or mark placed if none remaining)
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

                // 4. Reset form and go back to putaway for next suggestion
                setFitQty('')
                setFitOverride('')
                setFitOverrideId(null)
                setPutawayError(null)
                setStep('putaway')
              })()
            }} disabled={!(+(fitQty || 0) > 0)}>
              {+(fitQty || 0) > 0 ? `Place ${fitQty} here${+(fitQty || 0) < cti.qty ? ` · ${cti.qty - +(fitQty || 0)} remaining` : ''}` : 'Enter how many fit'}
            </button>
          </>
        )}
      </div>
    )
  }

  // ─── COMPLETE ───
  if (step === 'complete') {
    const placedItems = toteItems.filter(i => i.status === 'placed')
    return (
      <div className="desk-page">
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
          <button className="erpnext-btn-primary mt-6" onClick={() => {
            setSelectedItem(null); setSuggestion(null); setToteItems([])
            setStep(mode === 'zone' ? 'item_pick' : 'mode_select')
          }}>
            {mode === 'zone' ? 'Next Item' : 'Done'}
          </button>
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
