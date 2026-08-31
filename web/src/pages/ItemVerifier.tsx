import { useState, useCallback, useEffect } from 'react'
import { Search, Box, Flag, Inbox } from 'lucide-react'
import api from '../services/api'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from '../components/ScannerLayout'
import ScanCard from '../components/scan/ScanCard'
import { useScanFeedback } from '../hooks/useScanFeedback'
import { useLoadMore } from '../hooks/useLoadMore'
import { canonicalBoxNo } from '../utils/boxQr'
import '../styles/scanner.css'

interface BoxItem { part_code: string; part_name: string; expected_qty: number; scanned_qty: number; status: string }
interface ActiveBox { box_number: string; items: BoxItem[] }

export default function ItemVerifier() {
  const fb = useScanFeedback()
  const { toasts, toast } = useScannerToasts()
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null)
  const [sid, setSid] = useState<number | null>(null)
  const [activeBox, setActiveBox] = useState<ActiveBox | null>(null)
  const [damageMode, setDamageMode] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [cameraKey, setCameraKey] = useState(0)

  useEffect(() => {
    api.get('/grn/sessions?status=item_verification').then((r: any) => {
      if (r.ok) setSessions(r.data ?? [])
    }).catch(() => {})
  }, [])

  const sessionMore = useLoadMore(sessions, 10, sessions.length)
  const boxItems = activeBox?.items ?? []
  const itemMore = useLoadMore(boxItems, 10, activeBox?.box_number ?? '')

  const openBox = useCallback(async (code: string) => {
    const raw = code.trim()
    const carton = canonicalBoxNo(raw) || raw
    if (!sid || !carton) return
    const r: any = await api.post(`/grn/session/${sid}/open-box`, { carton_no: carton })
    if (r.ok) {
      setActiveBox(r.data as ActiveBox)
      setCameraKey((k) => k + 1)
      fb.ok()
      toast(`Box ${r.data.carton_no} opened`, 'ok')
    } else {
      fb.err()
      toast(r.error ?? 'Box not found', 'err')
      setFlash('err')
      setTimeout(() => setFlash(null), 300)
    }
  }, [sid, fb, toast])

  const verifyItem = useCallback(async (code: string) => {
    if (!sid || !activeBox || !code.trim()) return
    const raw = code.trim()
    const r: any = await api.post(`/grn/session/${sid}/verify-item`, { item_code: raw, qty: 1 })
    if (r.ok) {
      fb.ok()
      if (r.data.box_auto_closed) {
        toast(`Box ${activeBox.box_number} complete!`, 'ok')
        setActiveBox(null)
        setCameraKey((k) => k + 1)
      } else {
        const disp = String(r.data.item_code ?? raw).toUpperCase()
        toast(`${disp} +1`, 'ok')
      }
      const fresh: any = await api.get(`/grn/session/${sid}/active-box`)
      if (fresh.ok) setActiveBox(fresh.data as ActiveBox)
    } else if (r.data?.wrong_item) {
      fb.err(); toast(`Wrong item: ${raw}`, 'err'); setFlash('err'); setTimeout(() => setFlash(null), 300)
    } else {
      fb.warn(); toast(r.error ?? 'Scan failed', 'warn')
    }
  }, [sid, activeBox, fb, toast])

  return (
    <ScannerLayout title="Item Verifier" flash={flash} meta={sid ? `S#${sid}` : undefined}>
      <ScannerToastBar toasts={toasts} />

      {!sid && (
        <>
          <div className="scan-empty" style={{ padding: '20px 0' }}>
            <div className="scan-empty-icon"><Search size={40} strokeWidth={1.8} /></div>
            <div className="scan-empty-title">Item Verifier</div>
            <div className="scan-empty-msg">Pick a session to verify boxes</div>
          </div>
          {sessions.length === 0 && (
            <div className="scan-empty">
              <div className="scan-empty-icon"><Inbox size={28} strokeWidth={1.8} /></div>
              <div className="scan-empty-msg">No sessions waiting</div>
            </div>
          )}
          <div className="scan-select-list">
            {sessionMore.visible.map((s: any) => (
              <div key={s.id} className="scan-select-card" onClick={() => setSid(s.id)}>
                <div className="scan-select-card-title">{s.session_no ?? `GRN-${s.id}`}</div>
                <div className="scan-select-card-sub">{s.supplier_name ?? 'Unknown'} · {s.status}</div>
              </div>
            ))}
          </div>
          {sessionMore.hasMore && (
            <button type="button" className="scan-btn scan-btn-outline" style={{ marginTop: 8 }} onClick={sessionMore.loadMore}>
              Load more ({sessionMore.remaining} left)
            </button>
          )}
        </>
      )}

      {sid && !activeBox && (
        <>
          <ScanCard
            state="idle"
            onManualEntry={(code) => void openBox(code)}
            onMarkDamaged={() => {}}
            canMarkDamaged={false}
            showMarkDamaged={false}
            onRestart={() => setCameraKey((k) => k + 1)}
            placeholder="Box number…"
            cameraKey={`box-${cameraKey}`}
            idlePrompt="Scan box to open"
            readyTitle="Open box"
            readySubtitle="Scan carton label to verify contents"
          />
        </>
      )}

      {activeBox && (
        <>
          <div className="scan-card">
            <div className="scan-card-icon blue"><Box size={20} strokeWidth={1.8} /></div>
            <div className="scan-card-body">
              <div className="scan-card-code">{activeBox.box_number}</div>
              <div className="scan-card-detail">{activeBox.items.length} line(s)</div>
            </div>
            <button className="scan-btn-outline scan-btn-sm" onClick={() => { setActiveBox(null); setCameraKey((k) => k + 1) }} style={{ width: 'auto', minHeight: 36 }}>
              Close box
            </button>
          </div>

          <ScanCard
            state="idle"
            onManualEntry={(code) => void verifyItem(code)}
            onMarkDamaged={() => {}}
            canMarkDamaged={false}
            showMarkDamaged={false}
            onRestart={() => setCameraKey((k) => k + 1)}
            placeholder="Scan item barcode…"
            cameraKey={`item-${cameraKey}-${activeBox.box_number}`}
            readyTitle={activeBox.box_number}
            readySubtitle={`${activeBox.items.length} line(s) to verify`}
          />

          {itemMore.visible.map((it, i) => {
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
          {itemMore.hasMore && (
            <button type="button" className="scan-btn scan-btn-outline" style={{ marginTop: 8 }} onClick={itemMore.loadMore}>
              Load more ({itemMore.remaining} left)
            </button>
          )}

          <button
            className={`scan-btn-outline scan-btn-sm`}
            onClick={() => setDamageMode(!damageMode)}
            style={{ minHeight: 40, background: damageMode ? 'var(--red-50)' : undefined, borderColor: damageMode ? 'var(--red-500)' : undefined, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Flag size={14} strokeWidth={1.8} /> {damageMode ? 'Damage mode ON' : 'Flag damage'}
          </button>
        </>
      )}
    </ScannerLayout>
  )
}
