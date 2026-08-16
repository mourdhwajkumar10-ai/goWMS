import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

type WizardStep =
  | 'mode_select'
  | 'zone_select'
  | 'item_pick'
  | 'putaway'
  | 'fit_exception'
  | 'complete'

interface QueueRow {
  id: number
  item_code: string
  item_name: string | null
  warehouse_id: number
  warehouse_code: string
  location_id: number
  location_code: string
  batch_no: string
  qty: number
  location_type: string
}

interface ZoneInfo {
  zone: string
  count: number
}

interface Suggestion {
  location_id: number
  location_code: string
  reason: string
  free_capacity: number | null
  on_hand_qty: number
  candidates: any[]
  velocity_tier: string
  shelf_band: string
}

interface ToteItem {
  id: number
  item_code: string
  item_name: string | null
  qty: number
  status: string
  source: string
}

interface SessionData {
  id: number
  warehouse_id: number
  zone: string | null
  status: string
  started_at: string
}

export default function PutawayWizard() {
  const [step, setStep] = useState<WizardStep>('mode_select')
  const [mode, setMode] = useState<'zone' | 'item' | null>(null)
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [zones, setZones] = useState<ZoneInfo[]>([])
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<QueueRow | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [session, setSession] = useState<SessionData | null>(null)
  const [toteItems, setToteItems] = useState<ToteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [fitReason, setFitReason] = useState<'too_small' | 'too_large'>('too_small')
  const [fitQty, setFitQty] = useState('')
  const [fitOverride, setFitOverride] = useState('')
  const [fitOverrideId, setFitOverrideId] = useState<number | null>(null)

  const loadQueue = useCallback(async () => {
    const r = await api.putawayQueue()
    if (r.ok) setQueue((r.data ?? []) as QueueRow[])
  }, [])

  const loadZones = useCallback(async () => {
    const r = await api.get('/putaway/queue/zones')
    if (r.ok && Array.isArray(r.data)) setZones(r.data)
  }, [])

  useEffect(() => {
    void loadQueue()
    void loadZones()
  }, [loadQueue, loadZones])

  const loadSession = useCallback(async (sessionId: number) => {
    const r = await api.get<{ session: SessionData; items: ToteItem[] }>(`/putaway/sessions/${sessionId}`)
    if (r.ok && r.data) {
      setSession(r.data.session)
      setToteItems(r.data.items ?? [])
    }
  }, [])

  const createSession = useCallback(async (warehouseId: number, zone?: string) => {
    const r = await api.post<SessionData>('/putaway/sessions', { warehouse_id: warehouseId, zone: zone || '' })
    if (r.ok && r.data) {
      setSession(r.data)
      return r.data.id
    }
    return null
  }, [])

  // ... rest of component will be added in subsequent tasks

  return (
    <div className="desk-page">
      <h1>Putaway Wizard</h1>
      <p>Step: {step}</p>
    </div>
  )
}
