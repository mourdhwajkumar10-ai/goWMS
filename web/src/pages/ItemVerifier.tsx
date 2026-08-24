import { useState, useCallback, useEffect } from 'react'
import api from '../services/api'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from '../components/ScannerLayout'
import { useScanFeedback } from '../hooks/useScanFeedback'
import '../styles/scanner.css'

interface BoxItem { part_code: string; part_name: string; expected_qty: number; scanned_qty: number; status: string }
interface ActiveBox { box_number: string; items: BoxItem[] }

export default function ItemVerifier() {
  const fb = useScanFeedback()
  const { toasts, toast } = useScannerToasts()
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null)
  const [sid, setSid] = useState<number | null>(null)
  const [box, setBox] = useState('')
  const [activeBox, setActiveBox] = useState<ActiveBox | null>(null)
  const [itemScan, setItemScan] = useState('')
  const [damageMode, setDamageMode] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])

  useEffect(() => {
    api.get('/grn/sessions?status=item_verification&limit=5').then((r: any) => {
      if (r.ok) setSessions((r.data ?? []).slice(0, 5))
    }).catch(() => {})
  }, [])

  const openBox = useCallback(async () => {
    if (!sid || !box.trim()) return
    const r: any = await api.post(`/grn/session/${sid}/open-box`, { carton_no: box.trim() })
    if (r.ok) { setActiveBox(r.data as ActiveBox); setBox(''); fb.ok(); toast(`Box ${r.data.carton_no} opened`, 'ok') }
    else { fb.err(); toast(r.error ?? 'Box not found', 'err'); setFlash('err'); setTimeout(() => setFlash(null), 300) }
  }, [sid, box, fb, toast])

  const verifyItem = useCallback(async (code: string) => {
    if (!sid || !activeBox || !code.trim()) return
    const cleanCode = code.trim().split('-')[0].toUpperCase()
    const r: any = await api.post(`/grn/session/${sid}/verify-item`, { item_code: cleanCode, qty: 1 })
    if (r.ok) {
      fb.ok()
      if (r.data.box_auto_closed) { toast(`Box ${activeBox.box_number} complete!`, 'ok'); setActiveBox(null) }
      else { toast(`${cleanCode} +1`, 'ok') }
      const fresh: any = await api.get(`/grn/session/${sid}/active-box`)
      if (fresh.ok) setActiveBox(fresh.data as ActiveBox)
    } else if (r.data?.wrong_item) {
      fb.err(); toast(`Wrong item: ${cleanCode}`, 'err'); setFlash('err'); setTimeout(() => setFlash(null), 300)
    } else {
      fb.warn(); toast(r.error ?? 'Scan failed', 'warn')
    }
    setItemScan('')
  }, [sid, activeBox, fb, toast])

  return (
    <ScannerLayout title="Item Verifier" flash={flash} meta={sid ? `S#${sid}` : undefined} noBack>
      <ScannerToastBar toasts={toasts} />

      {!sid && (
        <>
          <div className="scan-empty" style={{ padding: '20px 0' }}>
            <div className="scan-empty-icon">🔍</div>
            <div className="scan-empty-title">Item Verifier</div>
            <div className="scan-empty-msg">Pick a session to verify boxes</div>
          </div>
          {sessions.length === 0 && (
            <div className="scan-empty">
              <div className="scan-empty-icon" style={{ fontSize: 28 }}>📭</div>
              <div className="scan-empty-msg">No sessions waiting</div>
            </div>
          )}
          <div className="scan-select-list">
            {sessions.map((s: any) => (
              <div key={s.id} className="scan-select-card" onClick={() => setSid(s.id)}>
                <div className="scan-select-card-title">{s.session_no ?? `GRN-${s.id}`}</div>
                <div className="scan-select-card-sub">{s.supplier_name ?? 'Unknown'} · {s.status}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {sid && !activeBox && (
        <>
          <div className="scan-prompt">
            <span className="scan-prompt-text">
              <span className="scan-prompt-dot" />
              Scan box to open
            </span>
          </div>
          <div className="scan-bottom-bar">
            <div className="scan-input-chip">
              <span style={{ fontSize: 18, flexShrink: 0 }}>📦</span>
              <input
                type="text" value={box}
                onChange={e => setBox(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); openBox() } }}
                placeholder="Box number…"
                autoFocus autoComplete="off"
              />
            </div>
            <button className="scan-icon-btn primary" onClick={openBox} disabled={!box.trim()} aria-label="Open">
              ↵
            </button>
          </div>
        </>
      )}

      {activeBox && (
        <>
          <div className="scan-card">
            <div className="scan-card-icon blue">📦</div>
            <div className="scan-card-body">
              <div className="scan-card-code">{activeBox.box_number}</div>
              <div className="scan-card-detail">{activeBox.items.length} line(s)</div>
            </div>
            <button className="scan-btn-outline scan-btn-sm" onClick={() => setActiveBox(null)} style={{ width: 'auto', minHeight: 36 }}>
              Close box
            </button>
          </div>

          {activeBox.items.map((it, i) => {
            const done = it.status === 'full_match' || Number(it.scanned_qty) >= Number(it.expected_qty)
            const partial = Number(it.scanned_qty) > 0 && !done
            return (
              <div key={i} className={`scan-row ${done ? '' : ''}`} style={{ opacity: done ? 0.55 : 1 }}>
                <span className={`scan-badge ${done ? 'ok' : partial ? 'warn' : 'info'}`} style={{ padding: '2px 8px', fontSize: 11 }}>
                  {done ? '✓' : partial ? '…' : '○'}
                </span>
                <div className="scan-row-info">
                  <div className="scan-row-code">{it.part_code}</div>
                  <div className="scan-row-desc">{it.part_name || ''}</div>
                </div>
                <div className="scan-row-meta">
                  <div className="scan-row-qty">{it.scanned_qty}/{it.expected_qty}</div>
                </div>
              </div>
            )
          })}

          <div className="scan-bottom-bar" style={{ marginTop: 4 }}>
            <div className="scan-input-chip">
              <span style={{ fontSize: 18, flexShrink: 0 }}>🔍</span>
              <input
                type="text" value={itemScan}
                onChange={e => setItemScan(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); verifyItem(itemScan) } }}
                placeholder="Scan item barcode…"
                autoFocus autoComplete="off"
              />
            </div>
            <button className="scan-icon-btn primary" onClick={() => verifyItem(itemScan)} disabled={!itemScan.trim()} aria-label="Verify">
              ↵
            </button>
          </div>

          <button
            className={`scan-btn-outline scan-btn-sm`}
            onClick={() => setDamageMode(!damageMode)}
            style={{ minHeight: 40, background: damageMode ? 'var(--red-50)' : undefined, borderColor: damageMode ? 'var(--red-500)' : undefined }}
          >
            🚩 {damageMode ? 'Damage mode ON' : 'Flag damage'}
          </button>
        </>
      )}
    </ScannerLayout>
  )
}