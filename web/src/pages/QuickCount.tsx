import { useState, useCallback, useEffect, useMemo } from 'react'
import { Hash, ArrowRight } from 'lucide-react'
import api from '../services/api'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from '../components/ScannerLayout'
import { useScanFeedback } from '../hooks/useScanFeedback'
import { useLoadMore } from '../hooks/useLoadMore'
import '../styles/scanner.css'

interface CountLine { id: number; item_code: string; system_qty: number; counted_qty: number | null; discrepancy_status: string | null }

export default function QuickCount() {
  const fb = useScanFeedback()
  const { toasts, toast } = useScannerToasts()
  const [sheetId, setSheetId] = useState<number | null>(null)
  const [lines, setLines] = useState<CountLine[]>([])
  const [scanCode, setScanCode] = useState('')
  const [activeLine, setActiveLine] = useState<CountLine | null>(null)
  const [countQty, setCountQty] = useState('')
  const [tier, setTier] = useState('A')
  const [warehouseId, setWarehouseId] = useState('')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    api.get('/masterdata/warehouses').then((r: any) => { if (r.ok) setWarehouses(r.data ?? []) }).catch(() => {})
  }, [])

  const createSheet = useCallback(async () => {
    const r = await api.cycleCountCreate({ tier, warehouse_id: warehouseId ? +warehouseId : undefined, auto_generate: true })
    if (r.ok) {
      setSheetId(r.data.id); fb.ok()
      toast(`Sheet ${r.data.sheet_no} created`, 'ok')
      const details: any = await api.get(`/cycle-count/${r.data.id}`)
      if (details.ok) { setLines(details.data?.lines ?? []); setTotal(details.data?.lines?.length ?? 0) }
    } else { fb.err(); toast(r.error ?? 'Failed', 'err') }
  }, [tier, warehouseId, fb, toast])

  const handleScan = useCallback(async (raw: string) => {
    const code = raw.trim()
    if (!code || !sheetId) return
    setScanCode('')
    const match = lines.find(l => l.item_code === code && l.counted_qty == null)
    if (!match) { fb.warn(); toast(code + ' not in sheet', 'warn'); return }
    setActiveLine(match); setCountQty(''); fb.ok()
    toast(`Count: ${code}`, 'ok')
  }, [lines, sheetId, fb, toast])

  const submitCount = useCallback(async () => {
    if (!activeLine || !sheetId || !countQty) return
    const qty = Number(countQty)
    if (isNaN(qty) || qty < 0) { fb.err(); toast('Invalid qty', 'err'); return }
    const r: any = await api.post(`/cyclecount/line/${activeLine.id}/count`, { counted_qty: qty })
    if (r.ok) {
      fb.ok(); toast(`${activeLine.item_code} = ${qty}`, 'ok')
      setDone(d => d + 1)
      setLines(prev => prev.map(l => l.id === activeLine.id ? { ...l, counted_qty: qty, discrepancy_status: qty !== l.system_qty ? (qty > l.system_qty ? 'surplus' : 'shortage') : 'match' } : l))
      setActiveLine(null); setCountQty('')
    } else { fb.err(); toast(r.error ?? 'Failed', 'err') }
  }, [activeLine, sheetId, countQty, fb, toast])

  const completeSheet = useCallback(async () => {
    if (!sheetId) return
    const r: any = await api.post(`/cyclecount/${sheetId}/complete`, { apply_adjustments: true })
    if (r.ok) { fb.ok(); toast(`Sheet complete · ${r.data.adjustments_applied ?? 0} adj`, 'ok'); setSheetId(null); setLines([]); setActiveLine(null) }
    else { fb.err(); toast(r.error ?? 'Failed', 'err') }
  }, [sheetId, fb, toast])

  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const pendingLines = useMemo(() => lines.filter(l => l.counted_qty == null), [lines])
  const pendingMore = useLoadMore(pendingLines, 10, `${sheetId}|${pendingLines.length}`)

  return (
    <ScannerLayout title="Quick Count" stat={sheetId ? String(done) : undefined} statOf={sheetId ? `/ ${total}` : undefined}>
      <ScannerToastBar toasts={toasts} />

      {!sheetId && (
        <>
          <div className="scan-empty" style={{ padding: '20px 0' }}>
            <div className="scan-empty-icon"><Hash size={40} strokeWidth={1.8} /></div>
            <div className="scan-empty-title">Quick Count</div>
            <div className="scan-empty-msg">Generate a sheet and scan items on the floor</div>
          </div>
          <div className="scan-section-title">Velocity tier</div>
          <div className="scan-tabs" style={{ marginBottom: 10 }}>
            {(['A', 'B', 'C'] as string[]).map(t => (
              <button key={t} className={`scan-tab ${tier === t ? 'active' : ''}`} onClick={() => setTier(t)}>
                Tier {t}
              </button>
            ))}
          </div>
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 'var(--sm-radius)',
              border: '1px solid var(--sm-border)', background: 'var(--sm-card)', fontSize: 14,
              fontFamily: 'inherit', color: 'var(--sm-fg)', marginBottom: 12,
            }}>
            <option value="">All warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>
          <button className="scan-btn scan-btn-primary" onClick={createSheet}>
            Start Counting
          </button>
        </>
      )}

      {sheetId && (
        <>
          {!activeLine && (
            <div className="scan-bottom-bar">
              <div className="scan-input-chip">
                <Hash size={16} strokeWidth={1.8} style={{ flexShrink: 0, color: 'var(--muted-foreground)' }} />
                <input type="text" value={scanCode} onChange={e => setScanCode(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScan(scanCode) } }}
                  placeholder="Scan item to count…" autoFocus autoComplete="off" />
              </div>
              <button className="scan-icon-btn primary" onClick={() => handleScan(scanCode)} disabled={!scanCode.trim()} aria-label="Find">
                <ArrowRight size={18} strokeWidth={1.8} />
              </button>
            </div>
          )}

          {activeLine && (
            <div>
              <div className="scan-card">
                <div className="scan-card-icon amber"><Hash size={20} strokeWidth={1.8} /></div>
                <div className="scan-card-body">
                  <div className="scan-card-code">{activeLine.item_code}</div>
                  <div className="scan-card-detail">System: {activeLine.system_qty}</div>
                </div>
              </div>

              <div className="scan-section-title" style={{ marginTop: 12 }}>Physical count</div>
              <input type="number" className="scan-count-input" value={countQty}
                onChange={e => setCountQty(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitCount() }}
                placeholder="Enter count…"
                autoFocus inputMode="numeric" />

              {countQty && activeLine.system_qty !== Number(countQty) && (
                <div style={{
                  textAlign: 'center', fontSize: 13, fontWeight: 600, marginTop: 4,
                  color: Number(countQty) > activeLine.system_qty ? '#286840' : '#b91c1c',
                }}>
                  {Number(countQty) > activeLine.system_qty
                    ? `+${Number(countQty) - activeLine.system_qty} surplus`
                    : `${Number(countQty) - activeLine.system_qty} shortage`}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="scan-btn scan-btn-success" onClick={submitCount} disabled={!countQty} style={{ flex: 1 }}>
                  Confirm {countQty || ''}
                </button>
                <button className="scan-btn scan-btn-outline" onClick={() => { setActiveLine(null); setCountQty('') }} style={{ flex: 1 }}>
                  Skip
                </button>
              </div>
            </div>
          )}

          {lines.length > 0 && !activeLine && (
            <div style={{ marginTop: 8 }}>
              <div className="scan-section-title">
                To count ({pendingLines.length} left)
              </div>
              {pendingMore.visible.map(l => (
                <div key={l.id} className="scan-row" onClick={() => { setActiveLine(l); setCountQty('') }} style={{ padding: '8px 10px', marginBottom: 4 }}>
                  <span className="scan-badge info" style={{ padding: '2px 8px', fontSize: 11 }}>○</span>
                  <div className="scan-row-info">
                    <div className="scan-row-code">{l.item_code}</div>
                    <div className="scan-row-desc">sys: {l.system_qty}</div>
                  </div>
                </div>
              ))}
              {pendingMore.hasMore && (
                <button type="button" className="scan-btn scan-btn-outline" style={{ marginTop: 4 }} onClick={pendingMore.loadMore}>
                  Load more ({pendingMore.remaining} left)
                </button>
              )}
            </div>
          )}

          {done > 0 && done >= total && (
            <button className="scan-btn scan-btn-success" onClick={completeSheet} style={{ marginTop: 12 }}>
              Complete Count & Apply
            </button>
          )}
        </>
      )}
    </ScannerLayout>
  )
}