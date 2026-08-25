import { useState, useCallback, useEffect } from 'react'
import { Tag, Box, AlertTriangle, Check, ArrowRight, ArrowLeft } from 'lucide-react'
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

export default function PutawayRunner() {
  const fb = useScanFeedback()
  const { toasts, toast } = useScannerToasts()
  /** null = mode select (RF scan-select cards, same pattern as Pick/Pack) */
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

  const totalPending = zones.reduce((sum, z) => sum + z.count, 0)

  const refreshZones = useCallback(async () => {
    try {
      const r: any = await api.get('/putaway/queue/zones')
      if (r.ok) setZones(r.data ?? [])
    } catch {
      /* ignore */
    }
  }, [])

  const refreshQueue = useCallback(async () => {
    if (!mode) return
    const useZone = (mode === 'zone' || showZoneFilterInItem) && zone
    const zoneParam = useZone ? `?zone=${encodeURIComponent(zone)}` : ''
    const r: any = await api.get(`/putaway/queue${zoneParam}`)
    if (r.ok) {
      setQueue(Array.isArray(r.data) ? r.data : [])
    }
  }, [mode, zone, showZoneFilterInItem])

  useEffect(() => {
    void refreshZones()
  }, [refreshZones])

  useEffect(() => {
    void refreshQueue()
  }, [refreshQueue])

  const clearSelection = () => {
    setSelected(null)
    setSuggestion(null)
    setQtyOverride(null)
  }

  const pickMode = (next: RunnerMode) => {
    setMode(next)
    setZone('')
    setShowZoneFilterInItem(false)
    clearSelection()
  }

  const backToModes = () => {
    setMode(null)
    setZone('')
    setShowZoneFilterInItem(false)
    clearSelection()
    setQueue([])
  }

  const selectItem = useCallback(async (item: QueueItem) => {
    setSelected(item)
    setQtyOverride(null)
    fb.ok()
    toast(`Found: ${item.item_code}`, 'ok')
    const s: any = await api.get(
      `/putaway/suggest?item_code=${encodeURIComponent(item.item_code)}&qty=${item.qty}&warehouse_id=${item.warehouse_id}`,
    )
    if (s.ok) setSuggestion(s.data as SuggestResult)
    else setSuggestion(null)
  }, [fb, toast])

  const handleScan = useCallback(async (code: string) => {
    const clean = code.trim()
    if (!clean) return
    setScanCode('')
    // Prefer exact queue row match (id-stable); first by code if scanning
    const match = queue.find(q => q.item_code.toUpperCase() === clean.toUpperCase())
    if (match) {
      await selectItem(match)
      return
    }
    // By-item: allow suggest even if not in current filtered list — search full queue once
    const full: any = await api.get('/putaway/queue')
    const fullList: QueueItem[] = full.ok && Array.isArray(full.data) ? full.data : []
    const anywhere = fullList.find(q => q.item_code.toUpperCase() === clean.toUpperCase())
    if (anywhere) {
      await selectItem(anywhere)
      return
    }
    fb.warn()
    toast(`Not in queue: ${clean}`, 'warn')
  }, [queue, selectItem, fb, toast])

  const confirmPutaway = useCallback(async () => {
    if (!selected || !suggestion) return
    const r = await api.post('/putaway/', {
      item_code: selected.item_code,
      quantity: qtyOverride ?? selected.qty,
      source_location_id: selected.location_id,
      target_location_id: suggestion.location_id,
      warehouse_id: selected.warehouse_id,
    })
    if (r.ok) {
      fb.ok()
      toast(`→ ${suggestion.location_code}`, 'ok')
      setDoneToday(d => d + 1)
      clearSelection()
      await Promise.all([refreshQueue(), refreshZones()])
    } else {
      fb.err()
      toast(r.error ?? 'Putaway failed', 'err')
    }
  }, [selected, suggestion, qtyOverride, fb, toast, refreshQueue, refreshZones])

  const queueMore = useLoadMore(queue, 10, `${mode ?? ''}|${zone}|${showZoneFilterInItem}`)

  // Header: never show a bare "0". Prefer done-today when > 0, else pending queue count.
  const headerStat =
    doneToday > 0 ? String(doneToday) : totalPending > 0 ? String(totalPending) : undefined
  const headerMeta =
    doneToday > 0 ? 'today' : totalPending > 0 ? 'pending' : undefined

  // ─── MODE SELECT (RF scan-select, same language as Pick / Pack) ───
  if (!mode) {
    return (
      <ScannerLayout title="Putaway" stat={headerStat} meta={headerMeta}>
        <ScannerToastBar toasts={toasts} />

        <div className="scan-hint">Choose a putaway mode</div>
        <div className="scan-select-list">
          <button
            type="button"
            className="scan-select-card"
            onClick={() => pickMode('zone')}
            style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
          >
            <div className="scan-select-card-title">By zone</div>
            <div className="scan-select-card-sub">Pick an HSN zone, then work its staging queue</div>
            <div className="scan-select-card-meta">
              <span>{totalPending} pending</span>
              <span>{zones.length} zones</span>
              <span style={{ color: 'var(--primary)' }}>Open →</span>
            </div>
          </button>

          <button
            type="button"
            className="scan-select-card"
            onClick={() => pickMode('item')}
            style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
          >
            <div className="scan-select-card-title">By item</div>
            <div className="scan-select-card-sub">Scan or pick any staged item, then place it</div>
            <div className="scan-select-card-meta">
              <span>{totalPending} in queue</span>
              <span style={{ color: 'var(--primary)' }}>Open →</span>
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
      </ScannerLayout>
    )
  }

  const showZoneTabs = mode === 'zone' || (mode === 'item' && showZoneFilterInItem)

  return (
    <ScannerLayout title="Putaway" stat={headerStat} meta={headerMeta}>
      <ScannerToastBar toasts={toasts} />

      <button
        type="button"
        className="scan-btn scan-btn-outline scan-btn-sm"
        onClick={backToModes}
        style={{ alignSelf: 'flex-start', width: 'auto', marginBottom: 4 }}
      >
        <ArrowLeft size={16} strokeWidth={1.8} /> Modes
      </button>

      <div className="scan-tabs" style={{ marginBottom: 8 }}>
        <button type="button" className={`scan-tab ${mode === 'zone' ? 'active' : ''}`} onClick={() => pickMode('zone')}>
          By zone
        </button>
        <button type="button" className={`scan-tab ${mode === 'item' ? 'active' : ''}`} onClick={() => pickMode('item')}>
          By item
        </button>
      </div>

      {mode === 'item' && zones.length > 0 && (
        <button
          type="button"
          className="scan-btn scan-btn-outline scan-btn-sm"
          style={{ width: 'auto', alignSelf: 'flex-start', marginBottom: 4 }}
          onClick={() => {
            setShowZoneFilterInItem(v => !v)
            if (showZoneFilterInItem) setZone('')
          }}
        >
          {showZoneFilterInItem ? 'Hide zone filter' : 'Filter by zone (optional)'}
        </button>
      )}

      {showZoneTabs && zones.length > 0 && (
        <div className="scan-tabs">
          <button
            type="button"
            className={`scan-tab ${zone === '' ? 'active' : ''}`}
            onClick={() => { setZone(''); clearSelection() }}
          >
            All ({totalPending || queue.length})
          </button>
          {zones.map(z => (
            <button
              type="button"
              key={z.zone}
              className={`scan-tab ${zone === z.zone ? 'active' : ''}`}
              onClick={() => { setZone(z.zone); clearSelection() }}
            >
              {z.zone} ({z.count})
            </button>
          ))}
        </div>
      )}

      {/* Item barcode camera: both By zone and By item (hidden once a row is selected) */}
      {!selected && (
        <div className="scan-live-viewport" style={{ borderRadius: 12, overflow: 'hidden', minHeight: 140, marginBottom: 8 }}>
          <CameraScanner
            open
            embedded
            minimal
            continuous
            onClose={() => {}}
            onScan={(scanned) => {
              const clean = String(scanned || '').trim()
              if (clean) void handleScan(clean)
            }}
          />
        </div>
      )}

      <div className="scan-bottom-bar">
        <div className="scan-input-chip">
          <Tag size={16} strokeWidth={1.8} style={{ flexShrink: 0, color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            value={scanCode}
            onChange={e => setScanCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleScan(scanCode) } }}
            placeholder={mode === 'item' ? 'Scan or type item code…' : 'Scan item in this zone…'}
            autoFocus
            autoComplete="off"
          />
        </div>
        <button className="scan-icon-btn primary" onClick={() => void handleScan(scanCode)} disabled={!scanCode.trim()} aria-label="Find">
          <ArrowRight size={18} strokeWidth={1.8} />
        </button>
      </div>

      {selected && (
        <div className="scan-card">
          <div className="scan-card-icon green"><Box size={20} strokeWidth={1.8} /></div>
          <div className="scan-card-body">
            <div className="scan-card-code">{selected.item_code}</div>
            <div className="scan-card-detail">
              {selected.item_name || selected.item_code} · {selected.qty} qty @ {selected.location_code}
              {selected.zone ? ` · zone ${selected.zone}` : ''}
            </div>
          </div>
          <button className="scan-btn-outline scan-btn-sm" onClick={clearSelection} style={{ width: 'auto', minHeight: 36 }}>
            Cancel
          </button>
        </div>
      )}

      {suggestion && selected && (
        <>
          <div className="scan-section-title">Suggested location</div>
          <div className="suggest-card best">
            <div className="suggest-card-loc">{suggestion.location_code}</div>
            <div className="suggest-card-reason">
              {suggestion.reason?.replace(/_/g, ' ')} · {suggestion.shelf_band} · {suggestion.velocity_tier}
            </div>
            <div className="suggest-card-meta">
              <div className="suggest-card-stat">Free: <strong>{suggestion.free_capacity ?? '—'}</strong></div>
              <div className="suggest-card-stat">On hand: <strong>{suggestion.on_hand_qty ?? 0}</strong></div>
            </div>
            {suggestion.requires_split && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#975a16', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={14} /> Will need split
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--sm-muted-fg)', whiteSpace: 'nowrap' }}>Qty:</span>
            <input
              type="number"
              className="scan-count-input"
              value={qtyOverride ?? selected.qty}
              onChange={e => setQtyOverride(e.target.value ? Number(e.target.value) : null)}
              style={{ minHeight: 42, maxWidth: 100, fontSize: 18 }}
            />
            <span style={{ fontSize: 11, color: 'var(--sm-muted-fg)' }}>/{selected.qty}</span>
          </div>

          <button className="scan-btn scan-btn-success" onClick={() => void confirmPutaway()}>
            Place in {suggestion.location_code}
          </button>
          {suggestion.candidates?.length > 1 && (
            <button
              className="scan-btn scan-btn-outline scan-btn-sm"
              onClick={() => {
                const next = suggestion.candidates?.[1]
                if (next) {
                  setSuggestion({
                    ...suggestion,
                    location_id: next.location_id,
                    location_code: next.location_code,
                    reason: next.reason,
                  })
                }
              }}
            >
              Try next location →
            </button>
          )}
        </>
      )}

      {queue.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="scan-section-title">
            Queue ({queue.length})
            {selected ? ' · tap another to switch' : ''}
          </div>
          {queueMore.visible.map(q => {
            const isActive = selected?.id === q.id
            return (
              <div
                key={q.id}
                className="scan-row"
                onClick={() => { if (!isActive) void selectItem(q) }}
                style={{
                  padding: '8px 10px',
                  outline: isActive ? '2px solid var(--primary)' : undefined,
                  background: isActive ? 'oklch(0.56 0.18 250 / 0.08)' : undefined,
                }}
              >
                <span className={`scan-chip ${q.location_type}`}>{q.location_type}</span>
                <div className="scan-row-info">
                  <div className="scan-row-code">{q.item_code}</div>
                  <div className="scan-row-desc">{q.item_name} · zone {q.zone}</div>
                </div>
                <div className="scan-row-meta">
                  <div className="scan-row-qty">{q.qty}</div>
                  <div className="scan-row-label">{q.location_code}</div>
                </div>
              </div>
            )
          })}
          {queueMore.hasMore && (
            <button
              type="button"
              className="scan-btn scan-btn-outline"
              style={{ marginTop: 8 }}
              onClick={queueMore.loadMore}
            >
              Load more ({queueMore.remaining} left)
            </button>
          )}
        </div>
      )}

      {queue.length === 0 && !selected && (
        <div className="scan-empty">
          <div className="scan-empty-icon"><Check size={40} strokeWidth={1.8} /></div>
          <div className="scan-empty-title">All clear!</div>
          <div className="scan-empty-msg">
            {mode === 'zone' && zone
              ? `No items in zone ${zone}`
              : 'No items waiting for putaway'}
          </div>
        </div>
      )}
    </ScannerLayout>
  )
}
