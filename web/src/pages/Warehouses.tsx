import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface Wh {
  id: number
  name: string
  code: string
  warehouse_type: string | null
  picking_mode: string | null
  disabled: boolean
  location_count?: number
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

const LEVELS = [
  { value: 'lower', label: 'Lower' },
  { value: 'middle', label: 'Middle' },
  { value: 'upper', label: 'Upper' },
]

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

  const [aisle, setAisle] = useState('A')
  const [bay, setBay] = useState('01')
  const [level, setLevel] = useState('lower')
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
  const [bulkLevels, setBulkLevels] = useState<string[]>(['lower', 'middle', 'upper'])
  const [bulkType, setBulkType] = useState('storage')
  const [bulkPriority, setBulkPriority] = useState('5')
  const [showBulk, setShowBulk] = useState(false)

  const [editType, setEditType] = useState('storage')
  const [editPriority, setEditPriority] = useState('5')
  const [editCapacity, setEditCapacity] = useState('')
  const [editDisabled, setEditDisabled] = useState(false)
  const [editMixed, setEditMixed] = useState(true)

  const loadList = () => api.warehouseList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const openWarehouse = async (w: Wh) => {
    setSelected(w)
    setEditingId(null)
    setFilterAisle('')
    const r = await api.warehouseLocations(w.id)
    if (r.ok) setLocations(r.data ?? [])
  }

  const previewCode = useMemo(() => {
    if (customCode.trim()) return customCode.trim().toUpperCase()
    const lvl = level === 'upper' ? 'U' : level === 'middle' ? 'M' : 'L'
    return `${aisle.trim().toUpperCase() || 'A'}-${bay || '01'}-${lvl}-${bin || '01'}`
  }, [aisle, bay, level, bin, customCode])

  const filtered = useMemo(() => {
    if (!filterAisle.trim()) return locations
    const a = filterAisle.trim().toUpperCase()
    return locations.filter(l => (l.aisle || '').toUpperCase() === a)
  }, [locations, filterAisle])

  const createWarehouse = async () => {
    const r = await api.warehouseCreate({ code, name, warehouse_type: whType, picking_mode: pickingMode })
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

  const toggleBulkLevel = (v: string) => {
    setBulkLevels(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
  }

  const bulkCreate = async () => {
    if (!selected) return
    if (bulkLevels.length === 0) {
      notify({ type: 'error', title: 'Levels required', message: 'Pick at least one of Lower / Middle / Upper' })
      return
    }
    const r = await api.locationBulk(selected.id, {
      aisle: bulkAisle,
      bay_from: +bayFrom,
      bay_to: +bayTo,
      bins_per_bay: +binsPerBay,
      levels: bulkLevels,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Warehouses</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Configure aisle → bay → level (lower / middle / upper) → bin. Set type and putaway priority (1 = highest).
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
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
            <button onClick={createWarehouse} className="erpnext-btn-primary">Create Warehouse</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="erpnext-card xl:col-span-1">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Warehouses ({list.length})</h2>
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
              {list.map(w => (
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
              {list.length === 0 && (
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
                  Click a row to edit type, priority, capacity. Code format: Aisle-Bay-Level-Bin (e.g. A-01-L-03).
                </p>
              )}
            </div>
            {selected && (
              <button className="erpnext-btn-secondary text-sm" onClick={() => setShowBulk(!showBulk)}>
                {showBulk ? 'Hide bulk' : 'Bulk generate'}
              </button>
            )}
          </div>

          {!selected && (
            <p className="p-6 text-sm" style={{ color: 'var(--text-dim)' }}>
              Select a warehouse to configure aisles, bays, levels, and bins.
            </p>
          )}

          {selected && (
            <div className="p-4 space-y-4">
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
                    <label className="erpnext-label">Level</label>
                    <select className="erpnext-input" value={level} onChange={e => setLevel(e.target.value)}>
                      {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
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
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {LEVELS.map(l => (
                      <label key={l.value} className="flex items-center gap-2">
                        <input type="checkbox" checked={bulkLevels.includes(l.value)} onChange={() => toggleBulkLevel(l.value)} />
                        {l.label}
                      </label>
                    ))}
                  </div>
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

              <div className="flex items-center gap-3">
                <label className="erpnext-label mb-0">Filter aisle</label>
                <input className="erpnext-input" style={{ maxWidth: 120 }} value={filterAisle} onChange={e => setFilterAisle(e.target.value)} placeholder="A" />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{filtered.length} locations</span>
              </div>

              <div className="overflow-x-auto">
                <table className="erpnext-table">
                  <thead>
                    <tr style={{ background: 'var(--panel-2)' }}>
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
                    {filtered.map(l => (
                      <tr key={l.id} style={{ opacity: l.disabled ? 0.5 : 1 }}>
                        <td className="font-medium" style={{ color: 'var(--accent)' }}>{l.code}</td>
                        <td>{l.aisle}</td>
                        <td>{l.bay || l.shelf}</td>
                        <td>{l.level}</td>
                        <td>{l.bin || l.number}</td>
                        <td><span className="erpnext-badge erpnext-badge-blue">{l.location_type}</span></td>
                        <td>{l.putaway_priority ?? 5}</td>
                        <td className="text-right">{l.on_hand_qty}</td>
                        <td>
                          <button className="erpnext-btn-secondary text-xs" onClick={() => startEdit(l)}>Edit</button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No locations yet</td></tr>
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
