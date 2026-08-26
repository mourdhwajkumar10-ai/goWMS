import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CameraScanner from './CameraScanner'
import ScanPrompt from './scan/ScanPrompt'
import { api } from '../services/api'
import { notify } from './Notifications'

type Props = {
  pickListId: number
  onExit?: () => void
}

export default function GuidedPackJob({ pickListId, onExit }: Props) {
  const [box, setBox] = useState<any>(null)
  const [label, setLabel] = useState('')
  const [phase, setPhase] = useState<'box' | 'item'>('box')
  const [scanValue, setScanValue] = useState('')
  const [qty, setQty] = useState(1)
  const [verdict, setVerdict] = useState<'idle' | 'ok' | 'error' | 'blocked'>('idle')
  const [reason, setReason] = useState('')
  const [pick, setPick] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const loadPick = useCallback(async () => {
    const r = await api.pickGet(pickListId)
    if (r.ok) setPick(r.data)
  }, [pickListId])

  useEffect(() => { void loadPick() }, [loadPick])

  const openOrCreateBox = async (boxLabel: string) => {
    const r = await api.packCreate({
      label: boxLabel.trim(),
      pick_list_id: pickListId,
    })
    if (!r.ok) {
      setVerdict('error')
      setReason(r.error || 'Could not open box')
      return
    }
    const detail = await api.packGet(r.data.id)
    if (detail.ok) {
      setBox(detail.data)
      setLabel(detail.data.label)
      setPhase('item')
      setScanValue('')
      setVerdict('idle')
      notify({
        type: 'success',
        title: r.data.resumed ? 'Box resumed' : 'Box opened',
        message: detail.data.label,
      })
    }
  }

  const packItem = async () => {
    if (!box || busy) return
    const code = scanValue.trim()
    if (!code) return
    setBusy(true)
    try {
      const r = await api.post(`/packing/${box.id}/item`, {
        item_code: code,
        quantity: qty,
      })
      if (!r.ok) {
        setVerdict('error')
        setReason(r.error || 'Pack failed')
        return
      }
      if ((r.data as any)?.warning) {
        notify({ type: 'warning', title: 'Weight warning', message: (r.data as any).warning })
      }
      setVerdict('ok')
      setScanValue('')
      const detail = await api.packGet(box.id)
      if (detail.ok) setBox(detail.data)
      await loadPick()
    } finally {
      setBusy(false)
    }
  }

  const remaining = (pick?.items || [])
    .map((i: any) => ({
      code: i.item_code,
      left: Math.max(0, (i.picked_qty || 0) - (i.packed_qty || 0)),
    }))
    .filter((x: any) => x.left > 0.0001)

  // packed_qty may not be on API yet — fall back to comparing box totals later
  const openPickQty = (pick?.items || []).reduce(
    (s: number, i: any) => s + Math.max(0, (i.picked_qty || 0)), 0)
  const boxedQty = (box?.items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0)

  if (phase === 'box' || !box) {
    return (
      <ScanPrompt
        icon="item"
        title="Scan box label"
        subtitle={`Pick list ${pick?.name || pickListId}`}
        progressLabel="Pack job"
        value={scanValue || label}
        onChange={(v) => { setScanValue(v); setLabel(v) }}
        onSubmit={() => void openOrCreateBox(scanValue || label)}
        verdict={verdict}
        reason={reason}
        viewport={
          <div className="scan-live-viewport" style={{ borderRadius: 12, overflow: 'hidden', minHeight: 160 }}>
            <CameraScanner open embedded minimal continuous onClose={() => {}} onScan={(c) => setScanValue(String(c || '').trim())} />
          </div>
        }
        footer={onExit ? <button type="button" className="scan-btn scan-btn-outline" onClick={onExit}>Back</button> : null}
      />
    )
  }

  return (
    <ScanPrompt
      icon="item"
      title={`Pack into ${box.label}`}
      subtitle={`${boxedQty.toFixed(0)} packed · ${openPickQty.toFixed(0)} picked`}
      progressLabel={remaining.length ? `${remaining.length} SKUs left` : 'Ready to stage'}
      value={scanValue}
      onChange={setScanValue}
      onSubmit={() => void packItem()}
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
          <button
            type="button"
            className="scan-btn scan-btn-outline"
            onClick={() => { setBox(null); setPhase('box'); setScanValue(''); setLabel('') }}
          >
            + Box
          </button>
          <Link to="/dispatch?rf=1" className="scan-btn scan-btn-primary" style={{ textAlign: 'center' }}>
            Go to dispatch
          </Link>
        </div>
      }
    />
  )
}
