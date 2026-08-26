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
  const [forceOpen, setForceOpen] = useState(false)
  const [forceReason, setForceReason] = useState('')
  const [forceResolution, setForceResolution] = useState<'return_to_stock' | 'write_off'>('return_to_stock')
  const [reconcileBusy, setReconcileBusy] = useState(false)

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

  const reconcile = async () => {
    if (!waveId || reconcileBusy) return
    setReconcileBusy(true)
    try {
      const r = await api.post<{ leftover_qty?: number }>(`/consolidate/${waveId}/reconcile`, { force: false })
      if (!r.ok) {
        // Backend reports a structured breakdown when the wave isn't clean;
        // open the force-reconcile panel instead of just erroring out.
        setForceOpen(true)
        notify({ type: 'warning', title: 'Wave not ready', message: r.error || 'Leftover stock or incomplete orders remain' })
        await loadStatus()
        return
      }
      notify({ type: 'success', title: 'Wave reconciled', message: `leftover ${r.data?.leftover_qty ?? 0}` })
      setForceOpen(false)
      setForceReason('')
      await loadStatus()
    } finally {
      setReconcileBusy(false)
    }
  }

  const forceReconcile = async () => {
    if (!waveId || reconcileBusy) return
    if (!forceReason.trim()) {
      notify({ type: 'error', title: 'Reason required', message: 'Explain why this wave is being force-closed' })
      return
    }
    setReconcileBusy(true)
    try {
      const r = await api.post<any>(`/consolidate/${waveId}/reconcile`, {
        force: true,
        note: forceReason.trim(),
        resolution: forceResolution,
      })
      if (!r.ok) {
        notify({ type: 'error', title: 'Force reconcile failed', message: r.error || '' })
        return
      }
      notify({
        type: 'success',
        title: 'Wave force-reconciled',
        message: `${r.data?.resolution || forceResolution} · ${r.data?.incomplete_orders ?? 0} order(s) sent to backorder`,
      })
      setForceOpen(false)
      setForceReason('')
      await loadStatus()
    } finally {
      setReconcileBusy(false)
    }
  }

  const board = (
    <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="scan-section-title">Order board</div>
      {(status?.orders || []).map((o: any) => (
        <div key={o.sales_order_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>{o.sales_order_no} · {o.customer}</span>
          <span style={{ color: o.complete ? 'var(--green, #2e7d32)' : 'var(--amber, #b45309)' }}>
            {o.consolidated_qty}/{o.required_qty} {o.complete ? '✓' : `short ${o.short_qty ?? (o.required_qty - o.consolidated_qty)}`}
          </span>
        </div>
      ))}
      {status && (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Leftover in pool: {status.leftover_qty}
          {status.ready_to_reconcile ? ' · ready to reconcile' : ' · not ready'}
        </div>
      )}
      {(status?.leftover_breakdown || []).length > 0 && (
        <div style={{ fontSize: 12, borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: 6 }}>
          <div style={{ opacity: 0.7, marginBottom: 2 }}>Leftover by item</div>
          {status.leftover_breakdown.map((l: any) => (
            <div key={l.item_code} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{l.item_code}</span><span>{l.qty}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const forcePanel = forceOpen && (
    <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderColor: 'var(--amber, #b45309)' }}>
      <div className="scan-section-title">Force reconcile — supervisor only</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        This wave has leftover stock and/or incomplete orders. Forcing will
        {' '}back-order every remaining short line and either return leftover
        stock to storage or write it off, with a full audit trail.
      </div>
      {(status?.incomplete_orders || []).length > 0 && (
        <div style={{ fontSize: 12 }}>
          <div style={{ opacity: 0.7 }}>Will back-order:</div>
          {status.incomplete_orders.map((o: any) => (
            <div key={o.sales_order_id}>{o.sales_order_no} · short {o.short_qty}</div>
          ))}
        </div>
      )}
      {(status?.leftover_qty ?? 0) > 0.0001 && (
        <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="radio" checked={forceResolution === 'return_to_stock'} onChange={() => setForceResolution('return_to_stock')} />
            Return leftover to stock
          </label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="radio" checked={forceResolution === 'write_off'} onChange={() => setForceResolution('write_off')} />
            Write off leftover
          </label>
        </div>
      )}
      <input
        className="scan-text-input"
        placeholder="Reason (required)"
        value={forceReason}
        onChange={e => setForceReason(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="scan-btn scan-btn-primary" disabled={reconcileBusy} onClick={() => void forceReconcile()}>
          {reconcileBusy ? 'Working…' : 'Force reconcile'}
        </button>
        <button type="button" className="scan-btn scan-btn-outline" onClick={() => setForceOpen(false)}>Cancel</button>
      </div>
    </div>
  )

  const job = !waveId ? (
    <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="scan-section-title">Wave pick list ID</div>
      <input className="scan-text-input" value={waveId} onChange={e => setWaveId(e.target.value)} placeholder="Wave pick list id" />
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
          {forcePanel}
          <button type="button" className="scan-btn scan-btn-outline" disabled={reconcileBusy} onClick={() => void reconcile()}>
            {reconcileBusy ? 'Working…' : 'Reconcile wave'}
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
        actions={<Button disabled={reconcileBusy} onClick={() => void reconcile()}>Reconcile</Button>}
      />
      {forcePanel}
      {job}
    </div>
  )
}
