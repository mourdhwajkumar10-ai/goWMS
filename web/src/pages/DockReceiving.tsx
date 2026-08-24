import { useState, useCallback, useEffect } from 'react'
import api from '../services/api'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from '../components/ScannerLayout'
import { useScanFeedback } from '../hooks/useScanFeedback'
import '../styles/scanner.css'

interface POInfo { id: number; name: string; supplier_name: string; status: string; grand_total: number; total_qty: number; item_count: number }
interface ScanLog { box_number: string; message: string; status: 'ok' | 'warn' | 'err'; timestamp: number }

export default function DockReceiving() {
  const fb = useScanFeedback()
  const { toasts, toast } = useScannerToasts()
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null)
  const [step, setStep] = useState<'select' | 'scanning'>('select')
  const [pendingPOs, setPendingPOs] = useState<POInfo[]>([])
  const [selPO, setSelPO] = useState<POInfo | null>(null)
  const [sid, setSid] = useState<number | null>(null)
  const [scanIn, setScanIn] = useState('')
  const [logs, setLogs] = useState<ScanLog[]>([])
  const [boxesDone, setBoxesDone] = useState(0)
  const [boxesTotal, setBoxesTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.receivingPendingPOs().then(r => {
      if (r.ok) setPendingPOs((r.data ?? []).slice(0, 8))
    })
  }, [])

  const startReceiving = useCallback(async (po: POInfo) => {
    setLoading(true); setSelPO(po)
    const r = await api.post<any>('/receiving/start', { purchase_order_id: po.id, receiving_mode: 'packing_list' } as any)
    if (r.ok) {
      setSid(r.data.id)
      setBoxesTotal(r.data.expected_boxes ?? r.data.total_boxes ?? 0)
      setStep('scanning'); fb.ok(); toast('Session started', 'ok')
    } else { toast(r.error ?? 'Failed to start', 'err') }
    setLoading(false)
  }, [fb, toast])

  const handleScan = useCallback(async (box: string) => {
    if (!sid) return
    const r = await api.post<any>('/receiving/scan-box', { session_id: sid, box_number: box } as any)
    const entry: ScanLog = { box_number: box, message: r.ok ? r.data?.message ?? box : r.error ?? 'err', status: 'ok', timestamp: Date.now() }
    if (r.ok) {
      const msg = r.data?.message?.toUpperCase() ?? ''
      if (msg.includes('ALREADY') || r.data?.duplicate) { entry.status = 'warn'; fb.warn(); toast(`Duplicate: ${box}`, 'warn') }
      else if (msg.includes('EXCESS')) { entry.status = 'warn'; fb.warn(); toast(`Excess box: ${box}`, 'warn') }
      else { fb.ok(); setBoxesDone(d => d + 1); toast(`Box ${box}`, 'ok') }
      const fresh = await api.receivingStats(sid)
      if (fresh.ok) setBoxesTotal(fresh.data?.total_boxes ?? boxesTotal)
    } else {
      entry.status = 'err'; fb.err(); toast(r.error ?? 'Scan failed', 'err')
      setFlash('err'); setTimeout(() => setFlash(null), 300)
    }
    setLogs(p => [entry, ...p].slice(0, 50))
    setScanIn('')
  }, [sid, fb, toast, boxesTotal])

  return (
    <ScannerLayout
      title="Dock Receiving"
      flash={flash}
      stat={step === 'scanning' ? String(boxesDone) : undefined}
      statOf={step === 'scanning' ? `/ ${boxesTotal}` : undefined}
      meta={selPO?.name}
      noBack
    >
      <ScannerToastBar toasts={toasts} />

      {step === 'select' && (
        <>
          <div className="scan-empty" style={{ padding: '20px 0' }}>
            <div className="scan-empty-icon">📦</div>
            <div className="scan-empty-title">Dock Receiving</div>
            <div className="scan-empty-msg">Select a PO to start scanning boxes</div>
          </div>

          {pendingPOs.length === 0 && !loading && (
            <div className="scan-empty">
              <div className="scan-empty-icon" style={{ fontSize: 28 }}>📋</div>
              <div className="scan-empty-msg">No pending POs</div>
            </div>
          )}

          <div className="scan-select-list">
            {pendingPOs.map(po => (
              <div key={po.id} className="scan-select-card" onClick={() => startReceiving(po)}>
                <div className="scan-select-card-title">{po.name}</div>
                <div className="scan-select-card-sub">{po.supplier_name}</div>
                <div className="scan-select-card-meta">
                  <span>{po.item_count} items</span>
                  <span>{po.total_qty} qty</span>
                </div>
              </div>
            ))}
          </div>

          <button className="scan-btn scan-btn-outline" style={{ marginTop: 4 }} onClick={async () => {
            const r = await api.post<any>('/grn/', { receiving_mode: 'packing_list', warehouse_id: 1, supplier_name: 'Blind Receive' } as any)
            if (r.ok) { setSid(r.data.id); setStep('scanning'); fb.ok(); toast('Blind receive started', 'ok') }
            else toast(r.error ?? 'Failed', 'err')
          }}>
            Blind Receive (no PO)
          </button>
        </>
      )}

      {step === 'scanning' && (
        <>
          {/* Progress dots */}
          <div className="scan-progress-wrap">
            <div className="scan-progress-dots">
              {Array.from({ length: Math.max(boxesTotal, 1) }).map((_, i) => (
                <div
                  key={i}
                  className={`scan-progress-dot ${i < boxesDone ? 'done' : i === boxesDone ? 'current' : ''}`}
                />
              ))}
            </div>
          </div>

          {/* Camera / scanning area */}
          <div className="scan-camera-area">
            <div className="scan-camera-corners">
              <div className="scan-camera-frame">
                <span className="corner tl" />
                <span className="corner tr" />
                <span className="corner br" />
                <span className="corner bl" />
                <div className="scan-camera-sweep" />
              </div>
            </div>
          </div>

          {/* Status prompt */}
          <div className="scan-prompt">
            <span className="scan-prompt-text">
              <span className="scan-prompt-dot" />
              Scan a box label
            </span>
          </div>

          {/* Bottom bar */}
          <div className="scan-bottom-bar">
            <div className="scan-input-chip">
              <span style={{ fontSize: 18, flexShrink: 0 }}>📦</span>
              <input
                type="text"
                value={scanIn}
                onChange={e => setScanIn(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScan(scanIn) } }}
                placeholder="Box label…"
                autoFocus
                autoComplete="off"
              />
            </div>
            <button
              className="scan-icon-btn"
              onClick={() => handleScan(scanIn)}
              disabled={!scanIn.trim()}
              aria-label="Confirm"
            >
              ↵
            </button>
            <button className="scan-icon-btn primary" aria-label="Manual">
              ⌨
            </button>
          </div>

          {/* Recent scans */}
          {logs.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="scan-section-title">Recent scans</div>
              {logs.slice(0, 6).map((l, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', fontSize: 13, fontWeight: 500,
                }}>
                  <span className={`scan-badge ${l.status}`} style={{ padding: '2px 8px', fontSize: 11 }}>
                    {l.status === 'ok' ? '✓' : l.status === 'warn' ? '!' : '✗'}
                  </span>
                  <span style={{ flex: 1, fontFamily: 'var(--sm-font-mono)' }}>{l.box_number}</span>
                  <span style={{ fontSize: 11, color: 'var(--sm-muted-fg)' }}>{l.message}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ScannerLayout>
  )
}