import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import { printLocationLabels } from '../components/LocationQRPrint'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

interface Wh {
  id: number
  name: string
  code: string
  warehouse_type: string | null
  picking_mode: string | null
  disabled: boolean
  location_count?: number
  receiving_open?: string
  receiving_close?: string
  receiving_days?: string
}

interface Loc {
  id: number
  code: string
  warehouse_id: number
  aisle: string
  bay?: string
  shelf: string
  level: string
  bin?: string
  number: string
  location_type: string
  max_capacity_qty: number | null
  allow_mixed_items: boolean
  disabled: boolean
  putaway_priority?: number
  on_hand_qty: number
  item_count: number
}

const MAX_SHELF_LEVELS = 20

function shelfLevelOptions(count: number) {
  const n = Math.min(MAX_SHELF_LEVELS, Math.max(1, count || 1))
  return Array.from({ length: n }, (_, i) => {
    const v = String(i + 1).padStart(2, '0')
    return { value: v, label: i === 0 ? `${v} (bottom)` : v }
  })
}

const LOC_TYPES = [
  { value: 'storage', label: 'Storage' },
  { value: 'pick_face', label: 'Pick face' },
  { value: 'incoming', label: 'Incoming' },
  { value: 'hold', label: 'Hold' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'staging', label: 'Staging' },
  { value: 'quarantine', label: 'Quarantine' },
  { value: 'returns', label: 'Returns' },
]

const WEEKDAYS = [
  { id: '1', label: 'Mon' },
  { id: '2', label: 'Tue' },
  { id: '3', label: 'Wed' },
  { id: '4', label: 'Thu' },
  { id: '5', label: 'Fri' },
  { id: '6', label: 'Sat' },
  { id: '7', label: 'Sun' },
]

function toggleRecvDay(days: string, id: string) {
  const set = new Set(days.split(',').map(s => s.trim()).filter(Boolean))
  if (set.has(id)) set.delete(id)
  else set.add(id)
  return WEEKDAYS.map(d => d.id).filter(d => set.has(d)).join(',')
}

function RecvDayToggles({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = new Set(value.split(',').map(s => s.trim()))
  return (
    <div className="flex flex-wrap gap-1">
      {WEEKDAYS.map(d => (
        <button
          key={d.id}
          type="button"
          className={selected.has(d.id) ? 'erpnext-btn-primary text-xs' : 'erpnext-btn-secondary text-xs'}
          onClick={() => onChange(toggleRecvDay(value, d.id))}
        >
          {d.label}
        </button>
      ))}
    </div>
  )
}

export default function Warehouses() {
  const [list, setList] = useState<Wh[]>([])
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Wh | null>(null)
  const [locations, setLocations] = useState<Loc[]>([])
  const [filterAisle, setFilterAisle] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [whType, setWhType] = useState('storage')
  const [pickingMode, setPickingMode] = useState('scan')
  const [recvOpen, setRecvOpen] = useState('06:00')
  const [recvClose, setRecvClose] = useState('18:00')
  const [recvDays, setRecvDays] = useState('1,2,3,4,5')

  const [aisle, setAisle] = useState('A')
  const [bay, setBay] = useState('01')
  const [level, setLevel] = useState('01')
  const [levelCountUI, setLevelCountUI] = useState(5)
  const [bin, setBin] = useState('01')
  const [locType, setLocType] = useState('storage')
  const [capacity, setCapacity] = useState('')
  const [priority, setPriority] = useState('5')
  const [mixed, setMixed] = useState(true)
  const [customCode, setCustomCode] = useState('')

  const [bulkAisle, setBulkAisle] = useState('A')
  const [bayFrom, setBayFrom] = useState('1')
  const [bayTo, setBayTo] = useState('3')
  const [binsPerBay, setBinsPerBay] = useState('4')
  const [bulkLevelCount, setBulkLevelCount] = useState('5')
  const [bulkType, setBulkType] = useState('storage')
  const [bulkPriority, setBulkPriority] = useState('5')
  const [showBulk, setShowBulk] = useState(false)
  const [quickSetupLoading, setQuickSetupLoading] = useState(false)

  const [editType, setEditType] = useState('storage')
  const [editPriority, setEditPriority] = useState('5')
  const [editCapacity, setEditCapacity] = useState('')
  const [editDisabled, setEditDisabled] = useState(false)
  const [editMixed, setEditMixed] = useState(true)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [qrBay, setQrBay] = useState('')
  const [qrAisle, setQrAisle] = useState('')
  const [showQR, setShowQR] = useState(false)

  const loadList = () => api.warehouseList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const openWarehouse = async (w: Wh) => {
    setSelected(w)
    setRecvOpen((w.receiving_open || '06:00').slice(0, 5))
    setRecvClose((w.receiving_close || '18:00').slice(0, 5))
    setRecvDays(w.receiving_days || '1,2,3,4,5')
    setEditingId(null)
    setFilterAisle('')
    setSelectedIds([])
    setShowQR(false)
    const r = await api.warehouseLocations(w.id)
    if (r.ok) setLocations(r.data ?? [])
  }

  const previewCode = useMemo(() => {
    if (customCode.trim()) return customCode.trim().toUpperCase()
    const lvl = String(level).padStart(2, '0')
    return `${aisle.trim().toUpperCase() || 'A'}-${bay || '01'}-${lvl}-${bin || '01'}`
  }, [aisle, bay, level, bin, customCode])

  const levelOptions = useMemo(() => shelfLevelOptions(levelCountUI), [levelCountUI])

  const filtered = useMemo(() => {
    if (!filterAisle.trim()) return locations
    const a = filterAisle.trim().toUpperCase()
    return locations.filter(l => (l.aisle || '').toUpperCase() === a)
  }, [locations, filterAisle])

  const whPager = useClientPager(list)
  const locPager = useClientPager(filtered)

  const createWarehouse = async () => {
    const r = await api.warehouseCreate({
      code, name, warehouse_type: whType, picking_mode: pickingMode,
      receiving_open: recvOpen, receiving_close: recvClose, receiving_days: recvDays,
    })
    if (r.ok) {
      setCode(''); setName('')
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Warehouse created', message: code })
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || '' })
    }
  }

  const addLocation = async () => {
    if (!selected) return
    const r = await api.locationCreate(selected.id, {
      aisle,
      bay,
      shelf: bay,
      level,
      bin,
      number: bin,
      location_type: locType,
      max_capacity_qty: capacity ? +capacity : undefined,
      putaway_priority: priority ? +priority : 5,
      allow_mixed_items: mixed,
      code: customCode.trim() || undefined,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Location added', message: r.data.code })
      openWarehouse(selected)
      setBin(n => String(String(+n + 1).padStart(2, '0')))
      setCustomCode('')
    } else {
      notify({ type: 'error', title: 'Location failed', message: r.error || '' })
    }
  }

  const bulkCreate = async () => {
    if (!selected) return
    const n = +bulkLevelCount
    if (!n || n < 1 || n > MAX_SHELF_LEVELS) {
      notify({ type: 'error', title: 'Levels required', message: `Enter shelf count 1–${MAX_SHELF_LEVELS} (01 = bottom)` })
      return
    }
    const r = await api.locationBulk(selected.id, {
      aisle: bulkAisle,
      bay_from: +bayFrom,
      bay_to: +bayTo,
      bins_per_bay: +binsPerBay,
      level_count: n,
      location_type: bulkType,
      putaway_priority: +bulkPriority || 5,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Bulk locations', message: `${r.data.created} created` })
      setShowBulk(false)
      openWarehouse(selected)
    } else {
      notify({ type: 'error', title: 'Bulk failed', message: r.error || '' })
    }
  }

  const quickSetup6Zones = async () => {
    if (!selected) return
    setQuickSetupLoading(true)
    let total = 0
    const zones = ['A', 'B', 'C', 'D', 'E', 'F']
    for (const zone of zones) {
      const r = await api.locationBulk(selected.id, {
        aisle: zone,
        bay_from: 1,
        bay_to: 4,
        bins_per_bay: 2,
        level_count: 6,
        location_type: 'storage',
        putaway_priority: 5,
      })
      if (r.ok) total += r.data.created
    }
    setQuickSetupLoading(false)
    notify({ type: 'success', title: '6 zones created', message: `${total} storage locations across zones A–F` })
    openWarehouse(selected)
  }

  const startEdit = (l: Loc) => {
    setEditingId(l.id)
    setEditType(l.location_type || 'storage')
    setEditPriority(String(l.putaway_priority ?? 5))
    setEditCapacity(l.max_capacity_qty != null ? String(l.max_capacity_qty) : '')
    setEditDisabled(!!l.disabled)
    setEditMixed(l.allow_mixed_items !== false)
  }

  const saveEdit = async () => {
    if (editingId == null || !selected) return
    const r = await api.locationUpdate(editingId, {
      location_type: editType,
      putaway_priority: +editPriority || 5,
      max_capacity_qty: editCapacity === '' ? null : +editCapacity,
      disabled: editDisabled,
      allow_mixed_items: editMixed,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Location updated', message: `#${editingId}` })
      setEditingId(null)
      openWarehouse(selected)
    } else {
      notify({ type: 'error', title: 'Update failed', message: r.error || '' })
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const printQR = async (mode: 'selected' | 'bay' | 'aisle' | 'filtered') => {
    if (!selected) return
    let labels: { id: number; code: string; aisle?: string; bay?: string; level?: string; bin?: string }[] = []

    if (mode === 'filtered') {
      labels = filtered.map(l => ({
        id: l.id, code: l.code, aisle: l.aisle, bay: l.bay || l.shelf, level: l.level, bin: l.bin || l.number,
      }))
    } else if (mode === 'selected') {
      if (selectedIds.length === 0) {
        notify({ type: 'error', title: 'Nothing selected', message: 'Select locations in the table first' })
        return
      }
      const r = await api.locationQRLabels(selected.id, { location_ids: selectedIds })
      if (!r.ok) {
        notify({ type: 'error', title: 'QR failed', message: r.error || '' })
        return
      }
      labels = r.data?.labels ?? []
    } else if (mode === 'bay') {
      if (!qrAisle.trim() || !qrBay.trim()) {
        notify({ type: 'error', title: 'Bay required', message: 'Enter aisle and bay for bay-wise QR' })
        return
      }
      const r = await api.locationQRLabels(selected.id, { aisle: qrAisle.trim(), bay: qrBay.trim() })
      if (!r.ok) {
        notify({ type: 'error', title: 'QR failed', message: r.error || '' })
        return
      }
      labels = r.data?.labels ?? []
    } else if (mode === 'aisle') {
      if (!qrAisle.trim()) {
        notify({ type: 'error', title: 'Aisle required', message: 'Enter aisle for aisle-wise QR' })
        return
      }
      const r = await api.locationQRLabels(selected.id, { aisle: qrAisle.trim() })
      if (!r.ok) {
        notify({ type: 'error', title: 'QR failed', message: r.error || '' })
        return
      }
      labels = r.data?.labels ?? []
    }

    if (!labels.length) {
      notify({ type: 'error', title: 'No labels', message: 'No matching locations to print' })
      return
    }
    printLocationLabels(labels, `${selected.code} location labels`)
    notify({ type: 'success', title: 'Print ready', message: `${labels.length} QR label(s)` })
  }

  const printOne = async (id: number) => {
    const r = await api.locationQRLabel(id)
    if (!r.ok || !r.data) {
      notify({ type: 'error', title: 'QR failed', message: r.error || '' })
      return
    }
    printLocationLabels([r.data], r.data.code)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Warehouses</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Configure aisle → bay → shelf level (01 = bottom … N) → bin. Set type and putaway priority (1 = highest).
          </p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="erpnext-btn-primary">
          {showNew ? '✕ Cancel' : '+ New Warehouse'}
        </button>
      </div>

      {showNew && (
        <div className="erpnext-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create Warehouse</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="erpnext-label">Code *</label>
              <input className="erpnext-input" value={code} onChange={e => setCode(e.target.value)} placeholder="MAIN" />
            </div>
            <div>
              <label className="erpnext-label">Name *</label>
              <input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} placeholder="Main Store" />
            </div>
            <div>
              <label className="erpnext-label">Type</label>
              <select className="erpnext-input" value={whType} onChange={e => setWhType(e.target.value)}>
                <option value="storage">Storage</option>
                <option value="incoming">Incoming</option>
                <option value="returns">Returns</option>
                <option value="transit">Transit</option>
                <option value="hub">Hub</option>
                <option value="satellite">Satellite</option>
              </select>
            </div>
            <div>
              <label className="erpnext-label">Picking Mode</label>
              <select className="erpnext-input" value={pickingMode} onChange={e => setPickingMode(e.target.value)}>
                <option value="scan">Scan</option>
                <option value="manual">Manual</option>
                <option value="fifo">FIFO</option>
                <option value="lifo">LIFO</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="erpnext-label">Receiving opens</label>
              <input className="erpnext-input" type="time" value={recvOpen} onChange={e => setRecvOpen(e.target.value)} />
            </div>
            <div>
              <label className="erpnext-label">Receiving closes</label>
              <input className="erpnext-input" type="time" value={recvClose} onChange={e => setRecvClose(e.target.value)} />
            </div>
            <div>
              <label className="erpnext-label">Days</label>
              <RecvDayToggles value={recvDays} onChange={setRecvDays} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
            <button onClick={createWarehouse} className="erpnext-btn-primary">Create Warehouse</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="erpnext-card xl:col-span-1">
          <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Warehouses ({list.length})</h2>
            <ListPager pager={whPager} placeholder="Search warehouses…" />
          </div>
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Code</th>
                <th>Name</th>
                <th>Bins</th>
              </tr>
            </thead>
            <tbody>
              {whPager.pageItems.map(w => (
                <tr
                  key={w.id}
                  onClick={() => openWarehouse(w)}
                  style={{ cursor: 'pointer', background: selected?.id === w.id ? 'var(--panel-2)' : undefined }}
                >
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{w.code}</td>
                  <td>{w.name}</td>
                  <td>{w.location_count ?? '—'}</td>
                </tr>
              ))}
              {whPager.total === 0 && (
                <tr><td colSpan={3} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No warehouses</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="erpnext-card xl:col-span-2">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h2 className="text-lg font-semibold">
                {selected ? `Configure — ${selected.code}` : 'Select a warehouse'}
              </h2>
              {selected && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                  Click a row to edit type, priority, capacity. Code format: Aisle-Bay-Level-Bin (e.g. A-01-01-03).
                </p>
              )}
            </div>
            {selected && (
              <div className="flex gap-2">
                <button className="erpnext-btn-secondary text-sm" onClick={() => setShowQR(!showQR)}>
                  {showQR ? 'Hide QR' : 'Print QR'}
                </button>
                <button className="erpnext-btn-secondary text-sm" onClick={() => setShowBulk(!showBulk)}>
                  {showBulk ? 'Hide bulk' : 'Bulk generate'}
                </button>
                <button
                  className="erpnext-btn-primary text-sm"
                  onClick={quickSetup6Zones}
                  disabled={quickSetupLoading}
                >
                  {quickSetupLoading ? 'Creating...' : 'Quick Setup 6 Zones'}
                </button>
              </div>
            )}
          </div>

          {!selected && (
            <p className="p-6 text-sm" style={{ color: 'var(--text-dim)' }}>
              Select a warehouse to configure aisles, bays, levels, and bins.
            </p>
          )}

          {selected && (
            <div className="p-4 space-y-4">
              <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                <div className="text-sm font-medium">Receiving hours</div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                  <div>
                    <label className="erpnext-label">Opens</label>
                    <input className="erpnext-input" type="time" value={recvOpen} onChange={e => setRecvOpen(e.target.value)} />
                  </div>
                  <div>
                    <label className="erpnext-label">Closes</label>
                    <input className="erpnext-input" type="time" value={recvClose} onChange={e => setRecvClose(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="erpnext-label">Days</label>
                    <RecvDayToggles value={recvDays} onChange={setRecvDays} />
                  </div>
                  <button
                    className="erpnext-btn-primary text-sm"
                    onClick={async () => {
                      const r = await api.warehouseUpdate(selected.id, {
                        receiving_open: recvOpen, receiving_close: recvClose, receiving_days: recvDays,
                      })
                      if (r.ok) {
                        notify({ type: 'success', title: 'Receiving hours saved', message: `${recvOpen}–${recvClose}` })
                        loadList()
                      } else {
                        notify({ type: 'error', title: 'Save failed', message: r.error || '' })
                      }
                    }}
                  >
                    Save hours
                  </button>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Default Mon–Fri 06:00–18:00. Arrivals outside this window auto-flag OUTSIDE HOURS on GRN create.
                </p>
              </div>
              <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--panel-2)' }}>
                <div className="text-sm font-medium">Create any location</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="erpnext-label">Aisle</label>
                    <input className="erpnext-input" value={aisle} onChange={e => setAisle(e.target.value)} placeholder="A" />
                  </div>
                  <div>
                    <label className="erpnext-label">Bay</label>
                    <input className="erpnext-input" value={bay} onChange={e => setBay(e.target.value)} placeholder="01" />
                  </div>
                  <div>
                    <label className="erpnext-label">Shelves in rack (for level list)</label>
                    <input
                      className="erpnext-input"
                      type="number"
                      min={1}
                      max={MAX_SHELF_LEVELS}
                      value={levelCountUI}
                      onChange={e => {
                        const n = Math.min(MAX_SHELF_LEVELS, Math.max(1, +e.target.value || 1))
                        setLevelCountUI(n)
                        if (+level > n) setLevel(String(n).padStart(2, '0'))
                      }}
                    />
                  </div>
                  <div>
                    <label className="erpnext-label">Level (01 = bottom)</label>
                    <select className="erpnext-input" value={level} onChange={e => setLevel(e.target.value)}>
                      {levelOptions.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="erpnext-label">Bin</label>
                    <input className="erpnext-input" value={bin} onChange={e => setBin(e.target.value)} placeholder="01" />
                  </div>
                  <div>
                    <label className="erpnext-label">Location type</label>
                    <select className="erpnext-input" value={locType} onChange={e => setLocType(e.target.value)}>
                      {LOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="erpnext-label">Putaway priority (1–10)</label>
                    <input className="erpnext-input" type="number" min={1} max={10} value={priority} onChange={e => setPriority(e.target.value)} />
                  </div>
                  <div>
                    <label className="erpnext-label">Max capacity</label>
                    <input className="erpnext-input" type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="optional" />
                  </div>
                  <div>
                    <label className="erpnext-label">Custom code (optional)</label>
                    <input className="erpnext-input" value={customCode} onChange={e => setCustomCode(e.target.value)} placeholder={previewCode} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={mixed} onChange={e => setMixed(e.target.checked)} />
                    Allow mixed items
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Will create: <strong>{previewCode}</strong></span>
                    <button onClick={addLocation} className="erpnext-btn-primary">Add location</button>
                  </div>
                </div>
              </div>

              {showQR && (
                <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--panel-2)' }}>
                  <div className="text-sm font-medium">Print location QR codes</div>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    QR encodes the location code (e.g. A-01-01-03). Paste or scan into putaway / pick flows.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className="erpnext-label">Aisle (for aisle / bay print)</label>
                      <input className="erpnext-input" value={qrAisle} onChange={e => setQrAisle(e.target.value)} placeholder="A" />
                    </div>
                    <div>
                      <label className="erpnext-label">Bay (bay-wise only)</label>
                      <input className="erpnext-input" value={qrBay} onChange={e => setQrBay(e.target.value)} placeholder="01" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="erpnext-btn-primary text-sm" onClick={() => printQR('selected')}>
                      Selected ({selectedIds.length})
                    </button>
                    <button className="erpnext-btn-secondary text-sm" onClick={() => printQR('bay')}>Bay-wise</button>
                    <button className="erpnext-btn-secondary text-sm" onClick={() => printQR('aisle')}>Aisle-wise</button>
                    <button className="erpnext-btn-secondary text-sm" onClick={() => printQR('filtered')}>
                      Current list ({filtered.length})
                    </button>
                  </div>
                </div>
              )}

              {showBulk && (
                <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--panel-2)' }}>
                  <div className="text-sm font-medium">Bulk generate (aisle × bay × level × bin)</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className="erpnext-label">Aisle</label>
                      <input className="erpnext-input" value={bulkAisle} onChange={e => setBulkAisle(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Bay from</label>
                      <input className="erpnext-input" type="number" value={bayFrom} onChange={e => setBayFrom(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Bay to</label>
                      <input className="erpnext-input" type="number" value={bayTo} onChange={e => setBayTo(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Bins per bay</label>
                      <input className="erpnext-input" type="number" value={binsPerBay} onChange={e => setBinsPerBay(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Type</label>
                      <select className="erpnext-input" value={bulkType} onChange={e => setBulkType(e.target.value)}>
                        {LOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="erpnext-label">Priority</label>
                      <input className="erpnext-input" type="number" min={1} max={10} value={bulkPriority} onChange={e => setBulkPriority(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Shelf levels (01 = bottom)</label>
                      <input
                        className="erpnext-input"
                        type="number"
                        min={1}
                        max={MAX_SHELF_LEVELS}
                        value={bulkLevelCount}
                        onChange={e => setBulkLevelCount(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Generates levels 01…{String(Math.min(MAX_SHELF_LEVELS, Math.max(1, +bulkLevelCount || 1))).padStart(2, '0')} from the bottom shelf upward.
                  </p>
                  <button onClick={bulkCreate} className="erpnext-btn-primary text-sm">Generate locations</button>
                </div>
              )}

              {editingId != null && (
                <div className="rounded-lg p-4 space-y-3 border" style={{ borderColor: 'var(--accent)' }}>
                  <div className="text-sm font-medium">Edit location #{editingId}</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className="erpnext-label">Type</label>
                      <select className="erpnext-input" value={editType} onChange={e => setEditType(e.target.value)}>
                        {LOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="erpnext-label">Priority</label>
                      <input className="erpnext-input" type="number" min={1} max={10} value={editPriority} onChange={e => setEditPriority(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Capacity</label>
                      <input className="erpnext-input" type="number" value={editCapacity} onChange={e => setEditCapacity(e.target.value)} />
                    </div>
                    <div className="flex flex-col justify-end gap-2 pb-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={editMixed} onChange={e => setEditMixed(e.target.checked)} /> Mixed items
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={editDisabled} onChange={e => setEditDisabled(e.target.checked)} /> Disabled
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button className="erpnext-btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    <button className="erpnext-btn-primary" onClick={saveEdit}>Save</button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <label className="erpnext-label mb-0">Filter aisle</label>
                <input className="erpnext-input" style={{ maxWidth: 120 }} value={filterAisle} onChange={e => setFilterAisle(e.target.value)} placeholder="A" />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{filtered.length} locations</span>
              </div>
              <ListPager pager={locPager} placeholder="Search locations…" />

              <div className="overflow-x-auto">
                <table className="erpnext-table">
                  <thead>
                    <tr style={{ background: 'var(--panel-2)' }}>
                      <th style={{ width: 36 }}></th>
                      <th>Code</th>
                      <th>Aisle</th>
                      <th>Bay</th>
                      <th>Level</th>
                      <th>Bin</th>
                      <th>Type</th>
                      <th>Pri</th>
                      <th className="text-right">On hand</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {locPager.pageItems.map(l => (
                      <tr key={l.id} style={{ opacity: l.disabled ? 0.5 : 1 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(l.id)}
                            onChange={() => toggleSelect(l.id)}
                          />
                        </td>
                        <td className="font-medium" style={{ color: 'var(--accent)' }}>{l.code}</td>
                        <td>{l.aisle}</td>
                        <td>{l.bay || l.shelf}</td>
                        <td>{l.level}</td>
                        <td>{l.bin || l.number}</td>
                        <td><span className="erpnext-badge erpnext-badge-blue">{l.location_type}</span></td>
                        <td>{l.putaway_priority ?? 5}</td>
                        <td className="text-right">{l.on_hand_qty}</td>
                        <td className="whitespace-nowrap">
                          <button className="erpnext-btn-secondary text-xs mr-1" onClick={() => printOne(l.id)}>QR</button>
                          <button className="erpnext-btn-secondary text-xs" onClick={() => startEdit(l)}>Edit</button>
                        </td>
                      </tr>
                    ))}
                    {locPager.total === 0 && (
                      <tr><td colSpan={10} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No locations yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
