import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

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
}

interface SessionData {
  id: number
  warehouse_id: number
  zone: string | null
  status: string
  started_at: string
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

  const createSession = useCallback(async (warehouseId: number, zone?: string) => {
    const r = await api.post<SessionData>('/putaway/sessions', { warehouse_id: warehouseId, zone: zone || '' })
    if (r.ok && r.data) {
      setSession(r.data)
      return r.data.id
    }
    return null
  }, [])

  if (step === 'mode_select') {
    return (
      <div className="desk-page">
        <div className="desk-head">
          <h1>Putaway</h1>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <button
            className="erpnext-btn-primary"
            style={{ flex: 1, padding: '24px 16px', fontSize: 18 }}
            onClick={() => { setMode('zone'); setStep('zone_select') }}
          >
            By Zone
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Batch putaway with tote</div>
          </button>
          <button
            className="erpnext-btn-primary"
            style={{ flex: 1, padding: '24px 16px', fontSize: 18 }}
            onClick={() => { setMode('item'); setStep('item_pick') }}
          >
            By Item
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Single item putaway</div>
          </button>
        </div>
        <p style={{ color: 'var(--text-dim)', marginBottom: 8 }}>
          {queue.length} items pending in staging
        </p>
        {queue.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Top 5:</p>
            {queue.slice(0, 5).map(q => (
              <div key={q.id} style={{ padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, marginBottom: 4 }}>
                {q.item_code} — {q.qty} units
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

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
            className="erpnext-btn-secondary"
            style={{ width: '100%', textAlign: 'left', padding: '16px', marginBottom: 8 }}
            onClick={() => { setSelectedZone(z.zone); setStep('item_pick') }}
          >
            Zone {z.zone} — {z.count} items
          </button>
        ))}
        {zones.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No items by zone</p>}
      </div>
    )
  }

  if (step === 'item_pick') {
    const zoneItems = selectedZone
      ? queue.filter(q => {
          return true // placeholder for actual zone filtering
        })
      : queue

    return (
      <div className="desk-page">
        <div className="desk-head">
          <button onClick={() => setStep(mode === 'zone' ? 'zone_select' : 'mode_select')}>← Back</button>
          <h1>{selectedZone ? `Zone ${selectedZone}` : 'Select Items'}</h1>
        </div>

        {toteItems.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Tote ({toteItems.length} items)</p>
            {toteItems.map(item => (
              <div key={item.id} style={{ padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{item.item_code} — {item.qty} units</span>
                <button
                  className="erpnext-btn-secondary"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => {
                    void api.del(`/putaway/sessions/${session?.id}/items/${item.id}`)
                    setToteItems(toteItems.filter(i => i.id !== item.id))
                    notify({ type: 'success', title: 'Removed', message: `${item.item_code} removed from tote` })
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="erpnext-btn-primary"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => setStep('putaway')}
            >
              Start Putaway →
            </button>
          </div>
        )}

        <div>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Available Items:</p>
          {zoneItems.map(q => (
            <div key={q.id} style={{ padding: '12px', background: 'var(--bg)', borderRadius: 6, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{q.item_code}</div>
                <div style={{ color: 'var(--text-dim)' }}>{q.qty} units from {q.location_code}</div>
              </div>
              <button
                className="erpnext-btn-secondary"
                onClick={() => {
                  void (async () => {
                    const r = await api.post(`/putaway/sessions/${session?.id}/pick`, {
                      item_code: q.item_code,
                      source_location_id: q.location_id,
                      qty: q.qty
                    })
                    if (r.ok && r.data) {
                      setToteItems([...toteItems, { ...r.data as ToteItem, item_code: q.item_code, qty: q.qty, source: q.location_code }])
                      notify({ type: 'success', title: 'Picked', message: `${q.item_code} added to tote` })
                    }
                  })()
                }}
              >
                Pick
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'putaway') {
    const currentToteItem = toteItems.find(i => i.status === 'picked')

    return (
      <div className="desk-page">
        <div className="desk-head">
          <button onClick={() => setStep('item_pick')}>← Back</button>
          <h1>Putaway</h1>
        </div>

        {currentToteItem ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, fontSize: 18 }}>{currentToteItem.item_code}</p>
              <p style={{ color: 'var(--text-dim)' }}>
                {currentToteItem.qty} units from {currentToteItem.source}
              </p>
            </div>

            {suggestion ? (
              <div style={{ padding: 16, background: 'var(--bg)', borderRadius: 8, marginBottom: 16 }}>
                <p style={{ fontWeight: 600 }}>Suggested location:</p>
                <p style={{ fontSize: 20 }}>{suggestion.location_code}</p>
                <p style={{ color: 'var(--text-dim)' }}>{suggestion.reason}</p>
                <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                  Velocity: {suggestion.velocity_tier} | Shelf: {suggestion.shelf_band}
                </p>
              </div>
            ) : (
              <p style={{ color: 'var(--text-dim)' }}>Finding location...</p>
            )}

            <button
              className="erpnext-btn-primary"
              style={{ width: '100%', padding: 16, fontSize: 16 }}
              onClick={() => setShowScanner(true)}
            >
              Scan location to confirm
            </button>

            <button
              className="erpnext-btn-secondary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => setStep('fit_exception')}
            >
              Doesn't fit
            </button>
          </>
        ) : (
          <p style={{ color: 'var(--text-dim)' }}>No items in tote</p>
        )}

        {/* Barcode Scanner Modal */}
        {showScanner && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', padding: 24, borderRadius: 12, width: '90%', maxWidth: 400 }}>
              <h2 style={{ marginBottom: 16 }}>Scan Location Barcode</h2>
              <input
                className="erpnext-input"
                autoFocus
                placeholder="Type or scan location code..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const code = (e.target as HTMLInputElement).value.trim()
                    if (code) {
                      // Validate scanned location matches suggestion
                      if (suggestion && code === suggestion.location_code) {
                        void (async () => {
                          const r = await api.post(`/putaway/sessions/${session?.id}/place/${currentToteItem?.id}`, {
                            target_location_id: suggestion.location_id
                          })
                          if (r.ok) {
                            setToteItems(toteItems.map(i =>
                              i.id === currentToteItem?.id ? { ...i, status: 'placed' } : i
                            ))
                            notify({ type: 'success', title: 'Placed', message: `${currentToteItem?.item_code} placed at ${code}` })
                            setShowScanner(false)
                            setStep('complete')
                          }
                        })()
                      } else {
                        notify({ type: 'error', title: 'Wrong location', message: `Expected ${suggestion?.location_code}, got ${code}` })
                      }
                    }
                  }
                }}
              />
              <button
                className="erpnext-btn-secondary"
                style={{ marginTop: 12, width: '100%' }}
                onClick={() => setShowScanner(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (step === 'fit_exception') {
    const currentToteItem = toteItems.find(i => i.status === 'picked')

    return (
      <div className="desk-page">
        <div className="desk-head">
          <button onClick={() => setStep('putaway')}>← Back</button>
          <h1>Doesn't Fit</h1>
        </div>

        {currentToteItem && (
          <>
            <p style={{ marginBottom: 16 }}>
              {currentToteItem.qty} × {currentToteItem.item_code} into {suggestion?.location_code || 'this bin'}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label className="erpnext-label">What's wrong?</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  className={fitReason === 'too_small' ? 'erpnext-btn-primary' : 'erpnext-btn-secondary'}
                  style={{ flex: 1 }}
                  onClick={() => setFitReason('too_small')}
                >
                  Too small (does not fit)
                </button>
                <button
                  className={fitReason === 'too_large' ? 'erpnext-btn-primary' : 'erpnext-btn-secondary'}
                  style={{ flex: 1 }}
                  onClick={() => setFitReason('too_large')}
                >
                  Too large (wrong size)
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="erpnext-label">How many fit?</label>
              <input
                className="erpnext-input"
                type="number"
                min={0}
                max={currentToteItem.qty}
                value={fitQty}
                onChange={e => setFitQty(e.target.value)}
                placeholder="0 = do not use this bin"
              />
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                Example: suggested {currentToteItem.qty}, only 8 fit → enter 8. Remaining will go to another location.
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="erpnext-label">Override location (optional)</label>
              <input
                className="erpnext-input"
                value={fitOverride}
                onChange={e => { setFitOverride(e.target.value); setFitOverrideId(null) }}
                placeholder="Type location code to override"
              />
              {suggestion?.candidates && suggestion.candidates.length > 0 && (
                <select
                  className="erpnext-input"
                  style={{ marginTop: 8 }}
                  value={fitOverrideId ?? ''}
                  onChange={e => {
                    const id = +e.target.value
                    const c = suggestion.candidates.find((x: any) => x.location_id === id)
                    if (c) {
                      setFitOverride(c.location_code)
                      setFitOverrideId(c.location_id)
                    }
                  }}
                >
                  <option value="">Suggested other bins</option>
                  {suggestion.candidates.filter((c: any) => c.location_id !== suggestion.location_id).map((c: any) => (
                    <option key={c.location_id} value={c.location_id}>
                      {c.location_code} — {c.reason}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              className="erpnext-btn-primary"
              style={{ width: '100%' }}
              onClick={() => {
                void (async () => {
                  const fits = +(fitQty || 0)
                  const r = await api.post('/putaway/fit-exception', {
                    item_code: currentToteItem.item_code,
                    rejected_location: suggestion?.location_code,
                    rejected_location_id: suggestion?.location_id,
                    reason: fitReason,
                    requested_qty: currentToteItem.qty,
                    fits_qty: fits,
                    override_location: fitOverride || undefined,
                    override_location_id: fitOverrideId || undefined
                  })
                  if (r.ok) {
                    notify({ type: 'success', title: 'Exception recorded', message: 'System will suggest new location' })
                    setStep('putaway')
                  }
                })()
              }}
            >
              Confirm & move
            </button>
          </>
        )}
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
