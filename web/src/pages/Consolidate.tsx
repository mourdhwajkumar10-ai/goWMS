import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CameraScanner from '../components/CameraScanner'
import ScanPrompt from '../components/scan/ScanPrompt'
import ScannerLayout, { ScannerToastBar, useScannerToasts } from '../components/ScannerLayout'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import { useRfUi } from '../hooks/useRfUi'
import { PageHead } from '../components/desktop/PageHead'
import { Button } from '../components/ui/Button'

export default function Consolidate() {
  const rf = useRfUi()
  const { toasts } = useScannerToasts()
  const [params] = useSearchParams()
  const [waveId, setWaveId] = useState(params.get('wave') || '')
  const [phase, setPhase] = useState<'item' | 'box'>('item')
  const [scanValue, setScanValue] = useState('')
  const [instruction, setInstruction] = useState<any>(null)
  const [status, setStatus] = useState<any>(null)
  const [verdict, setVerdict] = useState<'idle' | 'ok' | 'error' | 'blocked'>('idle')
  const [reason, setReason] = useState('')
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)

  const loadStatus = useCallback(async () => {
    if (!waveId) return
    const r = await api.get(`/consolidate/${waveId}/status`)
    if (r.ok) setStatus(r.data)
  }, [waveId])

  useEffect(() => {
    const w = params.get('wave')
    if (w) setWaveId(w)
  }, [params])

  useEffect(() => {
    void loadStatus()
    const t = setInterval(() => void loadStatus(), 5000)
    return () => clearInterval(t)
  }, [loadStatus])

  const scanItem = async (code: string) => {
    if (!waveId || busy) return
    setBusy(true)
    try {
      const r = await api.post<any>('/consolidate/scan-item', {
        pick_list_id: +waveId,
        item_code: code,
      })
      if (!r.ok) {
        setVerdict('error')
        setReason(r.error || 'No placement')
        return
      }
      setInstruction(r.data)
      setQty(Math.max(1, Math.floor(r.data.qty || 1)))
      setPhase('box')
      setScanValue(r.data.suggested_box_label || '')
      setVerdict('idle')
      setReason('')
    } finally {
      setBusy(false)
    }
  }

  const place = async () => {
    if (!instruction || !waveId || busy) return
    const label = scanValue.trim()
    if (!label && !instruction.suggested_box_id) {
      setVerdict('error')
      setReason('Scan box label')
      return
    }
    setBusy(true)
    try {
      const r = await api.post<any>('/consolidate/place', {
        pick_list_id: +waveId,
        sales_order_id: instruction.sales_order_id,
        box_id: instruction.suggested_box_id || undefined,
        box_label: label || undefined,
        item_code: instruction.item_code,
        quantity: qty,
      })
      if (!r.ok) {
        setVerdict('error')
        setReason(r.error || 'Place failed')
        return
      }
      if (r.data.warning) notify({ type: 'warning', title: 'Weight', message: r.data.warning })
      setVerdict('ok')
      setInstruction(null)
      setPhase('item')
      setScanValue('')
      await loadStatus()
    } finally {
      setBusy(false)
    }
  }

  const reconcile = async (force = false) => {
    if (!waveId) return
    const r = await api.post<{ leftover_qty?: number }>(`/consolidate/${waveId}/reconcile`, { force })
    if (!r.ok) {
      notify({ type: 'error', title: 'Reconcile blocked', message: r.error || '' })
      return
    }
    notify({ type: 'success', title: 'Wave reconciled', message: `leftover ${r.data?.leftover_qty ?? 0}` })
    await loadStatus()
  }

  const board = (
    <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="scan-section-title">Order board</div>
      {(status?.orders || []).map((o: any) => (
        <div key={o.sales_order_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>{o.sales_order_no} · {o.customer}</span>
          <span style={{ color: o.complete ? 'var(--green, #2e7d32)' : 'inherit' }}>
            {o.consolidated_qty}/{o.required_qty} {o.complete ? '✓' : ''}
          </span>
        </div>
      ))}
      {status && (
        <div style={{ fontSize: 12, opacity: 0.75 }}>Leftover in pool: {status.leftover_qty}</div>
      )}
    </div>
  )

  const job = !waveId ? (
    <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="scan-section-title">Wave pick list ID</div>
      <input className="scan-count-input" value={waveId} onChange={e => setWaveId(e.target.value)} placeholder="Wave pick list id" />
      <button type="button" className="scan-btn scan-btn-primary" onClick={() => void loadStatus()}>Open</button>
    </div>
  ) : phase === 'item' ? (
    <ScanPrompt
      icon="item"
      title="Scan item from bulk pool"
      subtitle={status?.all_complete ? 'All orders complete' : 'Item-led put-to-order'}
      value={scanValue}
      onChange={setScanValue}
      onSubmit={() => void scanItem(scanValue)}
      verdict={verdict}
      reason={reason}
      viewport={
        <div className="scan-live-viewport" style={{ borderRadius: 12, overflow: 'hidden', minHeight: 160 }}>
          <CameraScanner open embedded minimal continuous onClose={() => {}} onScan={(c) => setScanValue(String(c || '').trim())} />
        </div>
      }
      footer={board}
    />
  ) : (
    <ScanPrompt
      icon="item"
      title={instruction?.prompt || 'Scan box'}
      subtitle={`${instruction?.sales_order_no} · put ${qty}`}
      value={scanValue}
      onChange={setScanValue}
      onSubmit={() => void place()}
      showQty
      qty={qty}
      onQtyChange={setQty}
      verdict={verdict}
      reason={reason}
      viewport={
        <div className="scan-live-viewport" style={{ borderRadius: 12, overflow: 'hidden', minHeight: 160 }}>
          <CameraScanner open embedded minimal continuous onClose={() => {}} onScan={(c) => setScanValue(String(c || '').trim())} />
        </div>
      }
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="scan-btn scan-btn-outline" onClick={() => { setPhase('item'); setInstruction(null); setScanValue('') }}>
            Skip / next item
          </button>
          {board}
          <button type="button" className="scan-btn scan-btn-outline" onClick={() => void reconcile(false)}>
            Reconcile wave
          </button>
        </div>
      }
    />
  )

  if (rf) {
    return (
      <ScannerLayout title="Consolidate" meta={waveId ? `Wave ${waveId}` : undefined}>
        <ScannerToastBar toasts={toasts} />
        {job}
      </ScannerLayout>
    )
  }

  return (
    <div className="desk-page space-y-3">
      <PageHead
        eyebrow="Outbound"
        title="Wave consolidation"
        subtitle="Scan item → put to order box"
        actions={<Button onClick={() => void reconcile(false)}>Reconcile</Button>}
      />
      {job}
    </div>
  )
}
