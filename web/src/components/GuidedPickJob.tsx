import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CameraScanner from './CameraScanner'
import ScanPrompt from './scan/ScanPrompt'
import { api } from '../services/api'
import { notify } from './Notifications'

type PickItem = {
  id: number
  item_code: string
  item_name?: string
  ordered_qty: number
  allocated_qty: number
  picked_qty: number
  status: string
  location_code?: string
  bin_location?: string
}

type Props = {
  pickListId: number
  onExit?: () => void
  onComplete?: (list: any) => void
  hideCustomer?: boolean
}

function openLines(items: PickItem[]) {
  return (items || []).filter(i => {
    const need = (i.allocated_qty || i.ordered_qty || 0) - (i.picked_qty || 0)
    return need > 0.0001 && i.status !== 'picked' && i.status !== 'delivered' && i.status !== 'shortage'
  })
}

export default function GuidedPickJob({ pickListId, onExit, onComplete, hideCustomer }: Props) {
  const [list, setList] = useState<any>(null)
  const [phase, setPhase] = useState<'location' | 'item'>('location')
  const [scanValue, setScanValue] = useState('')
  const [qty, setQty] = useState(1)
  const [verdict, setVerdict] = useState<'idle' | 'ok' | 'error' | 'blocked'>('idle')
  const [reason, setReason] = useState('')
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const r = await api.pickGet(pickListId)
    if (r.ok) setList(r.data)
    return r
  }, [pickListId])

  useEffect(() => { void reload() }, [reload])

  const lines = useMemo(() => openLines(list?.items || []), [list])
  const current = lines[0]
  const totalLines = (list?.items || []).filter((i: PickItem) => i.status !== 'shortage').length
  const doneLines = totalLines - lines.length
  const loc = current?.location_code || current?.bin_location || ''

  useEffect(() => {
    if (!current) {
      setPhase('location')
      return
    }
    setPhase('location')
    setScanValue('')
    setVerdict('idle')
    setReason('')
    setQty(Math.max(1, Math.ceil((current.allocated_qty || current.ordered_qty) - current.picked_qty)))
  }, [current?.id])

  const submit = async (opts?: { override?: boolean }) => {
    if (!current || busy) return
    const scanned = scanValue.trim()
    if (!scanned) return
    setBusy(true)
    try {
      if (phase === 'location') {
        if (!opts?.override && loc && scanned.toUpperCase() !== loc.toUpperCase()) {
          setVerdict('blocked')
          setReason(`Wrong location — expected ${loc}`)
          setOverrideOpen(true)
          return
        }
        setPhase('item')
        setScanValue('')
        setVerdict('idle')
        setReason('')
        setOverrideOpen(false)
        return
      }

      const remaining = (current.allocated_qty || current.ordered_qty) - current.picked_qty
      const take = Math.min(qty, remaining)
      const r = await api.pickScan({
        pick_list_id: pickListId,
        pick_list_item_id: current.id,
        item_code: scanned,
        scanned_bin: loc || scanned,
        expected_bin: loc,
        quantity: take,
        override: !!opts?.override,
        override_reason: opts?.override ? overrideReason : undefined,
      })
      if (!r.ok) {
        setVerdict('error')
        setReason(r.error || 'Scan rejected')
        if ((r.error || '').toLowerCase().includes('wrong') || (r.error || '').toLowerCase().includes('override')) {
          setOverrideOpen(true)
        }
        return
      }
      setVerdict('ok')
      setOverrideOpen(false)
      const next = await reload()
      if (next.ok) {
        const still = openLines(next.data.items || [])
        if (!still.length) {
          notify({ type: 'success', title: 'Pick complete', message: list?.name || '' })
          onComplete?.(next.data)
        } else {
          setScanValue('')
          setPhase('location')
          setVerdict('idle')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  if (!list) {
    return <div className="scan-section-card">Loading pick job…</div>
  }

  if (!current) {
    const isWave = list.fulfillment_type === 'wave' || list.picking_mode === 'wave'
    return (
      <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="scan-select-card-title">All lines picked</div>
        <div className="scan-select-card-sub">{list.name}</div>
        {isWave ? (
          <Link to={`/consolidate?wave=${pickListId}&rf=1`} className="scan-btn scan-btn-primary" style={{ textAlign: 'center' }}>
            Go to consolidation
          </Link>
        ) : (
          <Link to={`/pack?pick_list_id=${pickListId}&rf=1`} className="scan-btn scan-btn-primary" style={{ textAlign: 'center' }}>
            Go to packing
          </Link>
        )}
        {onExit && (
          <button type="button" className="scan-btn scan-btn-outline" onClick={onExit}>Back</button>
        )}
      </div>
    )
  }

  const progress = `Line ${doneLines + 1} of ${totalLines}`
  const title = phase === 'location'
    ? `Go to ${loc || 'bin'}`
    : `Scan ${current.item_code}`
  const subtitle = phase === 'location'
    ? (hideCustomer ? list.name : `${list.sales_order_no || list.name}${list.customer ? ' · ' + list.customer : ''}`)
    : `${qty} needed · ${current.item_name || current.item_code}`

  return (
    <>
      <ScanPrompt
        icon={phase === 'location' ? 'location' : 'item'}
        title={title}
        subtitle={subtitle}
        progressLabel={progress}
        expectedHint={phase === 'location' ? loc : current.item_code}
        value={scanValue}
        onChange={setScanValue}
        onSubmit={() => void submit()}
        showQty={phase === 'item'}
        qty={qty}
        onQtyChange={setQty}
        verdict={verdict}
        reason={reason}
        viewport={
          <div className="scan-live-viewport" style={{ borderRadius: 12, overflow: 'hidden', minHeight: 180 }}>
            <CameraScanner
              open
              embedded
              minimal
              continuous
              onClose={() => {}}
              onScan={(code) => {
                const clean = String(code || '').trim()
                if (!clean) return
                setScanValue(clean)
              }}
            />
          </div>
        }
        footer={
          overrideOpen ? (
            <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="scan-section-title">Supervisor override</div>
              <input
                className="scan-count-input"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Reason required…"
              />
              <button
                type="button"
                className="scan-btn scan-btn-primary"
                disabled={!overrideReason.trim()}
                onClick={() => void submit({ override: true })}
              >
                Override & continue
              </button>
            </div>
          ) : null
        }
      />
    </>
  )
}
