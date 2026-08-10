import { useEffect, useState } from 'react'
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
  shelf: string
  level: string
  number: string
  location_type: string
  max_capacity_qty: number | null
  allow_mixed_items: boolean
  disabled: boolean
  on_hand_qty: number
  item_count: number
}

export default function Warehouses() {
  const [list, setList] = useState<Wh[]>([])
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Wh | null>(null)
  const [locations, setLocations] = useState<Loc[]>([])
  const [msg, setMsg] = useState('')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [whType, setWhType] = useState('storage')
  const [pickingMode, setPickingMode] = useState('scan')

  const [aisle, setAisle] = useState('A')
  const [shelf, setShelf] = useState('01')
  const [level, setLevel] = useState('low')
  const [number, setNumber] = useState('01')
  const [locType, setLocType] = useState('storage')
  const [capacity, setCapacity] = useState('')

  const [bulkAisle, setBulkAisle] = useState('A')
  const [shelfFrom, setShelfFrom] = useState('1')
  const [shelfTo, setShelfTo] = useState('3')
  const [binsPerShelf, setBinsPerShelf] = useState('4')
  const [showBulk, setShowBulk] = useState(false)

  const loadList = () => api.warehouseList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const openWarehouse = async (w: Wh) => {
    setSelected(w)
    const r = await api.warehouseLocations(w.id)
    if (r.ok) setLocations(r.data ?? [])
  }

  const createWarehouse = async () => {
    const r = await api.warehouseCreate({ code, name, warehouse_type: whType, picking_mode: pickingMode })
    if (r.ok) {
      setMsg(`Warehouse ${code} created`)
      setCode(''); setName('')
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Warehouse Created', message: code })
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || '' })
    }
  }

  const addLocation = async () => {
    if (!selected) return
    const r = await api.locationCreate(selected.id, {
      aisle, shelf, level, number, location_type: locType,
      max_capacity_qty: capacity ? +capacity : undefined,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Location added', message: r.data.code })
      openWarehouse(selected)
      setNumber(n => String(String(+n + 1).padStart(2, '0')))
    } else {
      notify({ type: 'error', title: 'Location failed', message: r.error || '' })
    }
  }

  const bulkCreate = async () => {
    if (!selected) return
    const r = await api.locationBulk(selected.id, {
      aisle: bulkAisle,
      shelf_from: +shelfFrom,
      shelf_to: +shelfTo,
      bins_per_shelf: +binsPerShelf,
      levels: ['low', 'upper'],
      location_type: 'storage',
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Bulk locations', message: `${r.data.created} created` })
      setShowBulk(false)
      openWarehouse(selected)
    } else {
      notify({ type: 'error', title: 'Bulk failed', message: r.error || '' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Warehouses</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Multi-warehouse setup with aisle / shelf / level / bin locations
          </p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="erpnext-btn-primary">
          {showNew ? '✕ Cancel' : '+ New Warehouse'}
        </button>
      </div>

      {msg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{
          background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)'
        }}>
          <span>✓</span> {msg}
        </div>
      )}

      {showNew && (
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Create Warehouse</h2>
          </div>
          <div className="p-6 space-y-4">
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
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">All Warehouses ({list.length})</h2>
          </div>
          <div className="p-4">
            <table className="erpnext-table">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Locations</th>
                </tr>
              </thead>
              <tbody>
                {list.map(w => (
                  <tr key={w.id} onClick={() => openWarehouse(w)} style={{ cursor: 'pointer', background: selected?.id === w.id ? 'var(--panel-2)' : undefined }}>
                    <td className="font-medium" style={{ color: 'var(--accent)' }}>{w.code}</td>
                    <td>{w.name}</td>
                    <td>{w.warehouse_type || '—'}</td>
                    <td>{w.location_count ?? '—'}</td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={4} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No warehouses</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="erpnext-card">
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">
              {selected ? `Locations — ${selected.code}` : 'Select a warehouse'}
            </h2>
            {selected && (
              <button className="erpnext-btn-secondary text-sm" onClick={() => setShowBulk(!showBulk)}>
                {showBulk ? 'Hide bulk' : 'Bulk add'}
              </button>
            )}
          </div>

          {!selected && (
            <p className="p-6 text-sm" style={{ color: 'var(--text-dim)' }}>
              Click a warehouse to add aisle / shelf / level / number bins.
            </p>
          )}

          {selected && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <div>
                  <label className="erpnext-label">Aisle</label>
                  <input className="erpnext-input" value={aisle} onChange={e => setAisle(e.target.value)} />
                </div>
                <div>
                  <label className="erpnext-label">Shelf</label>
                  <input className="erpnext-input" value={shelf} onChange={e => setShelf(e.target.value)} />
                </div>
                <div>
                  <label className="erpnext-label">Level</label>
                  <select className="erpnext-input" value={level} onChange={e => setLevel(e.target.value)}>
                    <option value="low">Low</option>
                    <option value="upper">Upper</option>
                  </select>
                </div>
                <div>
                  <label className="erpnext-label">Number</label>
                  <input className="erpnext-input" value={number} onChange={e => setNumber(e.target.value)} />
                </div>
                <div>
                  <label className="erpnext-label">Type</label>
                  <select className="erpnext-input" value={locType} onChange={e => setLocType(e.target.value)}>
                    <option value="storage">Storage</option>
                    <option value="pick_face">Pick face</option>
                    <option value="incoming">Incoming</option>
                    <option value="hold">Hold</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="erpnext-label">Capacity (optional)</label>
                  <input className="erpnext-input" type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="Max qty" />
                </div>
                <button onClick={addLocation} className="erpnext-btn-primary">Add location</button>
              </div>

              {showBulk && (
                <div className="p-3 rounded-lg space-y-3" style={{ background: 'var(--panel-2)' }}>
                  <div className="text-sm font-medium">Bulk generate bins</div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="erpnext-label">Aisle</label>
                      <input className="erpnext-input" value={bulkAisle} onChange={e => setBulkAisle(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Shelf from</label>
                      <input className="erpnext-input" type="number" value={shelfFrom} onChange={e => setShelfFrom(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Shelf to</label>
                      <input className="erpnext-input" type="number" value={shelfTo} onChange={e => setShelfTo(e.target.value)} />
                    </div>
                    <div>
                      <label className="erpnext-label">Bins / shelf</label>
                      <input className="erpnext-input" type="number" value={binsPerShelf} onChange={e => setBinsPerShelf(e.target.value)} />
                    </div>
                  </div>
                  <button onClick={bulkCreate} className="erpnext-btn-primary text-sm">Generate (low + upper)</button>
                </div>
              )}

              <table className="erpnext-table">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Code</th>
                    <th>Aisle</th>
                    <th>Shelf</th>
                    <th>Level</th>
                    <th>No</th>
                    <th>Type</th>
                    <th className="text-right">On hand</th>
                    <th>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map(l => (
                    <tr key={l.id}>
                      <td className="font-medium" style={{ color: 'var(--accent)' }}>{l.code}</td>
                      <td>{l.aisle}</td>
                      <td>{l.shelf}</td>
                      <td>{l.level}</td>
                      <td>{l.number}</td>
                      <td><span className="erpnext-badge erpnext-badge-blue">{l.location_type}</span></td>
                      <td className="text-right">{l.on_hand_qty}</td>
                      <td>{l.item_count}</td>
                    </tr>
                  ))}
                  {locations.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No locations yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
