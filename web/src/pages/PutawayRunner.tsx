import { useState, useCallback, useEffect, useMemo } from 'react'
import { Tag, Box, AlertTriangle, Check, ArrowRight, ArrowLeft, ChevronRight } from 'lucide-react'
import api from '../services/api'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from '../components/ScannerLayout'
import CameraScanner from '../components/CameraScanner'
import { useScanFeedback } from '../hooks/useScanFeedback'
import { useLoadMore } from '../hooks/useLoadMore'
import '../styles/scanner.css'

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

type RunnerMode = 'zone' | 'item'

/* ── Premium progress header (matches Receiving UI pattern) ── */
function ProgressHeader({ placed, total, zone }: { placed: number; total: number; zone?: string }) {
  const pct = total > 0 ? Math.round((placed / total) * 100) : 0
  return (
    <div style={{
      background: '#fff',
      borderBottom: '1px solid #e2e8f0',
      padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {placed}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8' }}>
            / {total} placed
          </span>
        </div>
        {zone && (
          <span style={{
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            background: '#eff6ff',
            color: '#2563eb',
            border: '1px solid #bfdbfe',
          }}>
            Zone {zone}
          </span>
        )}
      </div>
      {/* Progress bar */}
      <div style={{
        height: 6,
        borderRadius: 99,
        background: '#f1f5f9',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          borderRadius: 99,
          background: placed >= total && total > 0
            ? 'linear-gradient(90deg, #10b981, #059669)'
            : 'linear-gradient(90deg, #2563eb, #1d4ed8)',
          width: `${pct}%`,
          transition: 'width 400ms cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  )
}

/* ── Session context chips (matches Receiving doc chips) ── */
function SessionChips({ session, zone, warehouse }: { session?: number; zone?: string; warehouse?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 16px',
      background: '#fff',
      borderBottom: '1px solid #e2e8f0',
      flexWrap: 'wrap',
    }}>
      {session && (
        <span style={chipStyle('#f5f3ff', '#c4b5fd')}>
          <span style={chipLabel}>SESSION</span>
          <span style={chipValue}>#{session}</span>
        </span>
      )}
      {zone && (
        <span style={chipStyle('#eff6ff', '#93c5fd')}>
          <span style={chipLabel}>ZONE</span>
          <span style={chipValue}>{zone}</span>
        </span>
      )}
      {warehouse && (
        <span style={chipStyle('#ecfdf5', '#6ee7b7')}>
          <span style={chipLabel}>WH</span>
          <span style={chipValue}>{warehouse}</span>
        </span>
      )}
    </div>
  )
}

const chipStyle = (bg: string, border: string): React.CSSProperties => ({
  display: 'inline-flex', flexDirection: 'column', gap: 1,
  padding: '3px 10px', borderRadius: 8,
  border: `1px solid ${border}`, background: bg, minWidth: 0,
})
const chipLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
  color: '#64748b', textTransform: 'uppercase' as const,
}
const chipValue: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#0f172a',
  whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' as const,
}

/* ── Premium CTA button (matches Sign off transporter) ── */
function CompletePutawayCTA({ disabled, onClick, remaining }: { disabled: boolean; onClick: () => void; remaining: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        minHeight: 52,
        padding: '14px 20px',
        borderRadius: 12,
        border: 'none',
        background: disabled ? '#e2e8f0' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        color: disabled ? '#94a3b8' : '#fff',
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxShadow: disabled ? 'none' : '0 4px 14px rgba(37,99,235,0.25)',
        transition: 'all 150ms ease-out',
      }}
    >
      {remaining > 0 ? (
        <>Complete Putaway <span style={{ padding: '2px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.2)', fontSize: 13 }}>{remaining} left</span></>
      ) : (
        <><Check size={18} /> Finish Session</>
      )}
      <ChevronRight size={18} style={{ marginLeft: 'auto' }} />
    </button>
  )
}

export default function PutawayRunner() {
  const fb = useScanFeedback()
  const { toasts, toast } = useScannerToasts()
  const [mode, setMode] = useState<RunnerMode | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [suggestion, setSuggestion] = useState<SuggestResult | null>(null)
  const [scanCode, setScanCode] = useState('')
  const [selected, setSelected] = useState<QueueItem | null>(null)
  const [zone, setZone] = useState('')
  const [zones, setZones] = useState<{ zone: string; count: number }[]>([])
  const [qtyOverride, setQtyOverride] = useState<number | null>(null)
  const [doneToday, setDoneToday] = useState(0)
  const [showZoneFilterInItem, setShowZoneFilterInItem] = useState(false)
  const [session, setSession] = useState<{ id: number; warehouse_id: number } | null>(null)
  const [pickedItemId, setPickedItemId] = useState<number | null>(null)
  const [scanStep, setScanStep] = useState<'item' | 'location' | 'item_confirm'>('item')
  const [scannedLocation, setScannedLocation] = useState<{ id: number; code: string } | null>(null)

  const totalPending = zones.reduce((sum, z) => sum + z.count, 0)

  const refreshZones = useCallback(async () => {
    try {
      const r: any = await api.get('/putaway/queue/zones')
      if (r.ok) setZones(r.data ?? [])
    } catch { /* ignore */ }
  }, [])

  const refreshQueue = useCallback(async () => {
    if (!mode) return
    const useZone = (mode === 'zone' || showZoneFilterInItem) && zone
    const zoneParam = useZone ? `?zone=${encodeURIComponent(zone)}` : ''
    const r: any = await api.get(`/putaway/queue${zoneParam}`)
    if (r.ok) setQueue(Array.isArray(r.data) ? r.data : [])
  }, [mode, zone, showZoneFilterInItem])

  useEffect(() => { void refreshZones() }, [refreshZones])
  useEffect(() => { void refreshQueue() }, [refreshQueue])

  /* Deduplicate queue: same item_code + location_id → keep highest qty */
  const dedupedQueue = useMemo(() => {
    const map = new Map<string, QueueItem>()
    for (const q of queue) {
      const key = `${q.item_code.toUpperCase()}|${q.location_id}`
      const existing = map.get(key)
      if (!existing || q.qty > existing.qty) map.set(key, q)
    }
    return Array.from(map.values())
  }, [queue])

  const clearSelection = () => {
    setSelected(null); setSuggestion(null); setQtyOverride(null)
    setPickedItemId(null); setScannedLocation(null); setScanStep('item')
  }

  const pickMode = (next: RunnerMode) => {
    setMode(next); setZone(''); setShowZoneFilterInItem(false); clearSelection()
  }

  const backToModes = () => {
    setMode(null); setZone(''); setShowZoneFilterInItem(false); clearSelection(); setQueue([])
  }

  const selectItem = useCallback(async (item: QueueItem) => {
    setSelected(item); setQtyOverride(null); setScanStep('item')
    fb.ok(); toast(`Found: ${item.item_code}`, 'ok')
  }, [fb, toast])

  const ensureSession = useCallback(async (warehouseId: number) => {
    if (session) return session.id
    const r: any = await api.post('/putaway/sessions', { warehouse_id: warehouseId, zone })
    if (!r.ok || !r.data?.id) { toast(r.error ?? 'Could not start putaway session', 'err'); return null }
    setSession({ id: r.data.id, warehouse_id: warehouseId })
    return r.data.id as number
  }, [session, zone, toast])

  const pickSelected = useCallback(async () => {
    if (!selected) return
    const sid = await ensureSession(selected.warehouse_id)
    if (!sid) return
    const r: any = await api.post(`/putaway/sessions/${sid}/pick`, {
      item_code: selected.item_code, source_location_id: selected.location_id,
      qty: qtyOverride ?? selected.qty,
    })
    if (!r.ok || !r.data?.id) { fb.err(); toast(r.error ?? 'Pick failed', 'err'); return }
    setPickedItemId(r.data.id)
    const s: any = await api.get(
      `/putaway/suggest?item_code=${encodeURIComponent(selected.item_code)}&qty=${qtyOverride ?? selected.qty}&warehouse_id=${selected.warehouse_id}`,
    )
    if (s.ok) setSuggestion(s.data as SuggestResult)
    setScanStep('location'); fb.ok()
    toast(`Picked ${selected.item_code}. Scan the destination bin.`, 'ok')
  }, [selected, qtyOverride, ensureSession, fb, toast])

  const handleScan = useCallback(async (code: string) => {
    const clean = code.trim()
    if (!clean) return
    setScanCode('')

    if (scanStep === 'location' && selected && pickedItemId) {
      const r: any = await api.get('/masterdata/locations')
      const location = r.ok && Array.isArray(r.data)
        ? r.data.find((l: any) => String(l.code ?? '').toUpperCase() === clean.toUpperCase())
        : null
      if (!location) { fb.warn(); toast(`Location not found: ${clean}`, 'warn'); return }
      setScannedLocation({ id: location.id, code: location.code })
      setScanStep('item_confirm'); fb.ok()
      toast(`Bin ${location.code} scanned. Scan the item again to confirm.`, 'ok')
      return
    }

    if (scanStep === 'item_confirm' && selected && pickedItemId) {
      if (clean.toUpperCase() !== selected.item_code.toUpperCase()) {
        fb.warn(); toast(`Scan ${selected.item_code} to confirm placement`, 'warn'); return
      }
      const sid = session?.id
      if (!sid || !scannedLocation) return
      const r: any = await api.post(`/putaway/sessions/${sid}/place/${pickedItemId}`, {
        target_location_id: scannedLocation.id, qty: qtyOverride ?? selected.qty,
      })
      if (!r.ok) { fb.err(); toast(r.error ?? 'Putaway failed', 'err'); return }
      fb.ok(); toast(`Placed ${selected.item_code} at ${scannedLocation.code}`, 'ok')
      setDoneToday(d => d + 1); clearSelection()
      await Promise.all([refreshQueue(), refreshZones()])
      return
    }

    const match = dedupedQueue.find(q => q.item_code.toUpperCase() === clean.toUpperCase())
    if (match) { await selectItem(match); return }

    const full: any = await api.get('/putaway/queue')
    const fullList: QueueItem[] = full.ok && Array.isArray(full.data) ? full.data : []
    const anywhere = fullList.find(q => q.item_code.toUpperCase() === clean.toUpperCase())
    if (anywhere) { await selectItem(anywhere); return }

    fb.warn(); toast(`Not in queue: ${clean}`, 'warn')
  }, [dedupedQueue, selectItem, scanStep, selected, pickedItemId, session, scannedLocation, qtyOverride, fb, toast, refreshQueue, refreshZones])

  const completeSession = useCallback(async () => {
    if (!session) return
    const r: any = await api.post(`/putaway/sessions/${session.id}/complete`)
    if (!r.ok) { toast(r.error ?? 'Could not complete session', 'err'); return }
    toast('Putaway session completed!', 'ok')
    setSession(null); setDoneToday(0); clearSelection()
    await Promise.all([refreshQueue(), refreshZones()])
  }, [session, toast, refreshQueue, refreshZones])

  const queueMore = useLoadMore(dedupedQueue, 10, `${mode ?? ''}|${zone}|${showZoneFilterInItem}`)

  // ═══ MODE SELECT ═══
  if (!mode) {
    return (
      <ScannerLayout title="Putaway">
        <ScannerToastBar toasts={toasts} />
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12, fontWeight: 500 }}>
            Choose a putaway mode
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={() => pickMode('zone')} style={modeCardStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>By Zone</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Pick an HSN zone, then work its staging queue</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: '#2563eb' }}>{totalPending} pending</span>
                <span style={{ color: '#94a3b8' }}>{zones.length} zones</span>
              </div>
            </button>
            <button type="button" onClick={() => pickMode('item')} style={modeCardStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>By Item</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Scan or pick any staged item, then place it</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: '#2563eb' }}>{totalPending} in queue</span>
              </div>
            </button>
          </div>
          {totalPending === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}><Check size={40} /></div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>All clear!</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>No items waiting for putaway</div>
            </div>
          )}
        </div>
      </ScannerLayout>
    )
  }

  const placedCount = doneToday
  const remainingCount = dedupedQueue.length

  return (
    <ScannerLayout title="Putaway">
      <ScannerToastBar toasts={toasts} />

      {/* Progress header */}
      <ProgressHeader
        placed={placedCount}
        total={placedCount + remainingCount}
        zone={zone || undefined}
      />

      {/* Session chips */}
      {(session || zone) && (
        <SessionChips
          session={session?.id}
          zone={zone}
          warehouse={session ? 'Main' : undefined}
        />
      )}

      {/* Back button */}
      <div style={{ padding: '8px 16px 0' }}>
        <button type="button" onClick={backToModes} style={backBtnStyle}>
          <ArrowLeft size={14} strokeWidth={2} /> Modes
        </button>
      </div>

      {/* Camera scanner */}
      {!selected && (
        <div style={{ padding: '8px 16px' }}>
          <div style={{ borderRadius: 12, overflow: 'hidden', minHeight: 140, background: '#111' }}>
            <CameraScanner
              open embedded minimal continuous onClose={() => {}}
              onScan={(scanned) => {
                const clean = String(scanned || '').trim()
                if (clean) void handleScan(clean)
              }}
            />
          </div>
        </div>
      )}

      {/* Scan input */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 8px', alignItems: 'center' }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          border: '2px solid #e2e8f0', borderRadius: 10, padding: '0 12px',
          background: '#f8fafc', minHeight: 44,
          transition: 'border-color 150ms ease-out',
        }}>
          <Tag size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input
            type="text"
            value={scanCode}
            onChange={e => setScanCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleScan(scanCode) } }}
            placeholder={
              scanStep === 'location' ? 'Scan destination bin…' :
              scanStep === 'item_confirm' ? 'Scan item again to confirm…' :
              'Scan or type item code…'
            }
            autoFocus
            autoComplete="off"
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontSize: 14, color: '#0f172a', fontFamily: 'ui-monospace, monospace',
            }}
          />
        </div>
        <button
          onClick={() => void handleScan(scanCode)}
          disabled={!scanCode.trim()}
          style={{
            width: 44, height: 44, borderRadius: 10, border: 'none',
            background: scanCode.trim() ? '#2563eb' : '#e2e8f0',
            color: scanCode.trim() ? '#fff' : '#94a3b8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: scanCode.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 150ms ease-out', flexShrink: 0,
          }}
        >
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Selected item card */}
      {selected && (
        <div style={{ margin: '0 16px 8px', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Box size={16} style={{ color: '#16a34a' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace', color: '#0f172a' }}>{selected.item_code}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{selected.item_name || selected.item_code} · {selected.qty} @ {selected.location_code}</div>
          </div>
          <button onClick={clearSelection} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {/* Suggestion card */}
      {suggestion && selected && (
        <div style={{ margin: '0 16px 8px', padding: 12, borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {scanStep === 'location' ? 'Scan destination' : scanStep === 'item_confirm' ? 'Confirm item' : 'Suggested bin'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', fontFamily: 'ui-monospace', marginBottom: 4 }}>
            {suggestion.location_code}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            {suggestion.reason?.replace(/_/g, ' ')} · free: {suggestion.free_capacity ?? '—'}
          </div>
          {suggestion.requires_split && (
            <div style={{ fontSize: 12, color: '#975a16', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={14} /> Will need split
            </div>
          )}
          {suggestion.candidates?.length > 1 && (
            <button
              onClick={() => {
                const next = suggestion.candidates?.[1]
                if (next) setSuggestion({ ...suggestion, location_id: next.location_id, location_code: next.location_code, reason: next.reason })
              }}
              style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid #93c5fd', background: '#fff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Try next location →
            </button>
          )}
          {scanStep === 'location' && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Scan the physical destination bin shown above.</div>}
          {scanStep === 'item_confirm' && scannedLocation && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Destination {scannedLocation.code} verified. Scan {selected.item_code} to place.</div>}
        </div>
      )}

      {/* Queue list */}
      {dedupedQueue.length > 0 && (
        <div style={{ padding: '4px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Available Items ({dedupedQueue.length})
          </div>
          {queueMore.visible.map(q => {
            const isActive = selected?.id === q.id
            return (
              <div
                key={q.id}
                onClick={() => { if (!isActive) void selectItem(q) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', marginBottom: 6, borderRadius: 10,
                  border: isActive ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  background: isActive ? '#eff6ff' : '#fff',
                  cursor: isActive ? 'default' : 'pointer',
                  transition: 'all 120ms ease-out',
                  borderLeft: `3px solid ${q.zone === 'A' ? '#2563eb' : q.zone === 'B' ? '#7c3aed' : q.zone === 'C' ? '#059669' : q.zone === 'D' ? '#d97706' : '#6b7280'}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace', color: '#0f172a' }}>{q.item_code}</div>
                  <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {q.item_name || '—'} · {q.location_code}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    {q.qty} pcs
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isActive) {
                        setSelected(q)
                        setQtyOverride(null)
                        setScanStep('item')
                        // Auto-pick immediately
                        void (async () => {
                          const sid = await ensureSession(q.warehouse_id)
                          if (!sid) return
                          const r: any = await api.post(`/putaway/sessions/${sid}/pick`, {
                            item_code: q.item_code,
                            source_location_id: q.location_id,
                            qty: q.qty,
                          })
                          if (!r.ok || !r.data?.id) { fb.err(); toast(r.error ?? 'Pick failed', 'err'); return }
                          setPickedItemId(r.data.id)
                          const s: any = await api.get(
                            `/putaway/suggest?item_code=${encodeURIComponent(q.item_code)}&qty=${q.qty}&warehouse_id=${q.warehouse_id}`,
                          )
                          if (s.ok) setSuggestion(s.data as SuggestResult)
                          setScanStep('location')
                          fb.ok()
                          toast(`Picked ${q.item_code}. Scan destination bin.`, 'ok')
                        })()
                      }
                    }}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: '1px solid #2563eb',
                      background: isActive ? '#2563eb' : '#fff',
                      color: isActive ? '#fff' : '#2563eb',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      transition: 'all 120ms ease-out',
                    }}
                  >
                    Pick
                  </button>
                </div>
              </div>
            )
          })}
          {queueMore.hasMore && (
            <button
              type="button"
              onClick={queueMore.loadMore}
              style={{
                width: '100%', padding: 10, borderRadius: 8, border: '1px dashed #e2e8f0',
                background: 'transparent', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginTop: 4,
              }}
            >
              Load more ({queueMore.remaining} left)
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {dedupedQueue.length === 0 && !selected && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}><Check size={40} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>All clear!</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {mode === 'zone' && zone ? `No items in zone ${zone}` : 'No items waiting for putaway'}
          </div>
        </div>
      )}

      {/* Complete Putaway CTA — pinned to bottom */}
      <div style={{ padding: '12px 16px', marginTop: 'auto' }}>
        <CompletePutawayCTA
          disabled={!session || dedupedQueue.length > 0}
          onClick={() => void completeSession()}
          remaining={dedupedQueue.length}
        />
      </div>
    </ScannerLayout>
  )
}

/* ── Styles ── */
const modeCardStyle: React.CSSProperties = {
  width: '100%', textAlign: 'left', cursor: 'pointer',
  padding: '14px 16px', borderRadius: 12,
  border: '1px solid #e2e8f0', background: '#fff',
  transition: 'border-color 120ms ease-out, transform 120ms ease-out',
}
const backBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', borderRadius: 8,
  border: '1px solid #e2e8f0', background: '#fff',
  fontSize: 12, fontWeight: 600, color: '#475569',
  cursor: 'pointer',
}
