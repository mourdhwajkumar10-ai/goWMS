import { useState, useCallback, useEffect } from 'react'
import api from '../services/api'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from '../components/ScannerLayout'
import { useScanFeedback } from '../hooks/useScanFeedback'
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

export default function PutawayRunner() {
  const fb = useScanFeedback()
  const { toasts, toast } = useScannerToasts()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [suggestion, setSuggestion] = useState<SuggestResult | null>(null)
  const [scanCode, setScanCode] = useState('')
  const [selected, setSelected] = useState<QueueItem | null>(null)
  const [zone, setZone] = useState('')
  const [zones, setZones] = useState<{ zone: string; count: number }[]>([])
  const [qtyOverride, setQtyOverride] = useState<number | null>(null)
  const [doneToday, setDoneToday] = useState(0)

  useEffect(() => {
    api.get('/putaway/queue/zones').then((r: any) => { if (r.ok) setZones(r.data ?? []) }).catch(() => {})
    refreshQueue()
  }, [])

  const refreshQueue = useCallback(async () => {
    const r: any = await api.get(`/putaway/queue${zone ? `?zone=${zone}` : ''}`)
    if (r.ok) setQueue(r.data ?? [])
  }, [zone])

  const handleScan = useCallback(async (code: string) => {
    const clean = code.trim()
    if (!clean) return
    setScanCode('')
    const match = queue.find(q => q.item_code.toUpperCase() === clean.toUpperCase())
    if (match) {
      setSelected(match); setQtyOverride(null); fb.ok()
      toast(`Found: ${match.item_code}`, 'ok')
      const s: any = await api.get(`/putaway/suggest?item_code=${match.item_code}&qty=${match.qty}&warehouse_id=${match.warehouse_id}`)
      if (s.ok) setSuggestion(s.data as SuggestResult)
    } else {
      const s: any = await api.get(`/putaway/suggest?item_code=${clean}&qty=1&warehouse_id=1`)
      if (s.ok) { setSuggestion(s.data as SuggestResult); fb.ok(); toast(`Suggested for ${clean}`, 'ok') }
      else { fb.warn(); toast(`Not in queue: ${clean}`, 'warn') }
    }
  }, [queue, fb, toast])

  const confirmPutaway = useCallback(async () => {
    if (!selected || !suggestion) return
    const r = await api.post('/putaway/', {
      item_code: selected.item_code, quantity: qtyOverride ?? selected.qty,
      source_location_id: selected.location_id, target_location_id: suggestion.location_id,
      warehouse_id: selected.warehouse_id,
    })
    if (r.ok) {
      fb.ok(); toast(`→ ${suggestion.location_code}`, 'ok')
      setDoneToday(d => d + 1); setSelected(null); setSuggestion(null); setQtyOverride(null)
      refreshQueue()
    } else { fb.err(); toast(r.error ?? 'Putaway failed', 'err') }
  }, [selected, suggestion, qtyOverride, fb, toast, refreshQueue])

  return (
    <ScannerLayout title="Putaway Runner" stat={String(doneToday)} meta={doneToday > 0 ? 'today' : undefined} noBack>
      <ScannerToastBar toasts={toasts} />

      {zones.length > 0 && (
        <div className="scan-tabs">
          <button className={`scan-tab ${zone === '' ? 'active' : ''}`} onClick={() => setZone('')}>All ({queue.length})</button>
          {zones.map(z => (
            <button key={z.zone} className={`scan-tab ${zone === z.zone ? 'active' : ''}`} onClick={() => setZone(z.zone)}>
              {z.zone} ({z.count})
            </button>
          ))}
        </div>
      )}

      {!selected && (
        <>
          <div className="scan-bottom-bar">
            <div className="scan-input-chip">
              <span style={{ fontSize: 16, flexShrink: 0 }}>🏷️</span>
              <input type="text" value={scanCode} onChange={e => setScanCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScan(scanCode) } }}
                placeholder="Scan item to putaway…" autoFocus autoComplete="off" />
            </div>
            <button className="scan-icon-btn primary" onClick={() => handleScan(scanCode)} disabled={!scanCode.trim()} aria-label="Find">
              ↵
            </button>
          </div>
        </>
      )}

      {selected && (
        <div className="scan-card">
          <div className="scan-card-icon green">📦</div>
          <div className="scan-card-body">
            <div className="scan-card-code">{selected.item_code}</div>
            <div className="scan-card-detail">{selected.item_name || selected.item_code} · {selected.qty} qty @ {selected.location_code}</div>
          </div>
          <button className="scan-btn-outline scan-btn-sm" onClick={() => { setSelected(null); setSuggestion(null) }} style={{ width: 'auto', minHeight: 36 }}>
            Cancel
          </button>
        </div>
      )}

      {suggestion && selected && (
        <>
          <div className="scan-section-title">Suggested location</div>
          <div className="suggest-card best">
            <div className="suggest-card-loc">{suggestion.location_code}</div>
            <div className="suggest-card-reason">{suggestion.reason?.replace(/_/g, ' ')} · {suggestion.shelf_band} · {suggestion.velocity_tier}</div>
            <div className="suggest-card-meta">
              <div className="suggest-card-stat">Free: <strong>{suggestion.free_capacity ?? '—'}</strong></div>
              <div className="suggest-card-stat">On hand: <strong>{suggestion.on_hand_qty ?? 0}</strong></div>
            </div>
            {suggestion.requires_split && <div style={{ marginTop: 6, fontSize: 12, color: '#975a16', fontWeight: 600 }}>⚠ Will need split</div>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--sm-muted-fg)', whiteSpace: 'nowrap' }}>Qty:</span>
            <input type="number" className="scan-count-input" value={qtyOverride ?? selected.qty}
              onChange={e => setQtyOverride(e.target.value ? Number(e.target.value) : null)}
              style={{ minHeight: 42, maxWidth: 100, fontSize: 18 }} />
            <span style={{ fontSize: 11, color: 'var(--sm-muted-fg)' }}>/{selected.qty}</span>
          </div>

          <button className="scan-btn scan-btn-success" onClick={confirmPutaway}>
            Place in {suggestion.location_code}
          </button>
          {suggestion.candidates?.length > 1 && (
            <button className="scan-btn scan-btn-outline scan-btn-sm" onClick={() => {
              const next = suggestion.candidates?.[1]
              if (next) setSuggestion({ ...suggestion, location_id: next.location_id, location_code: next.location_code, reason: next.reason })
            }}>
              Try next location →
            </button>
          )}
        </>
      )}

      {!selected && queue.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="scan-section-title">Queue ({queue.length})</div>
          {queue.slice(0, 6).map(q => (
            <div key={q.id} className="scan-row" onClick={() => handleScan(q.item_code)} style={{ padding: '8px 10px' }}>
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
          ))}
        </div>
      )}

      {queue.length === 0 && !selected && (
        <div className="scan-empty">
          <div className="scan-empty-icon">✅</div>
          <div className="scan-empty-title">All clear!</div>
          <div className="scan-empty-msg">No items waiting for putaway</div>
        </div>
      )}
    </ScannerLayout>
  )
}