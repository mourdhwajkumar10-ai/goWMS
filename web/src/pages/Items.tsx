import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface Item {
  id: number
  code: string
  name: string
  has_serial: boolean
  has_batch: boolean
  has_expiry_date?: boolean
  safety_stock: number | null
  brand: string | null
  item_group: string | null
  valuation_rate: number | null
  pack_type?: string
  control_mode?: string
  home_location_id?: number | null
  master_complete?: boolean
  barcode?: string
  carton_qty?: number
  shelf_life_in_days?: number | null
}

interface InvRow {
  id: number
  location_code: string
  warehouse_code: string
  batch_no: string
  expiry_date: string | null
  days_until_expiry?: number | null
  fefo_warn?: boolean
  actual_qty: number
  reserved_qty: number
  available_qty: number
  allocation_status: string
  location_type: string
}

interface LocOpt {
  id: number
  code: string
  warehouse_code: string
}

export default function Items() {
  const [list, setList] = useState<Item[]>([])
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Item | null>(null)
  const [inventory, setInventory] = useState<InvRow[]>([])
  const [locations, setLocations] = useState<LocOpt[]>([])
  const [msg, setMsg] = useState('')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [hasSerial, setHasSerial] = useState(false)
  const [hasBatch, setHasBatch] = useState(false)
  const [hasExpiry, setHasExpiry] = useState(false)
  const [packType, setPackType] = useState('loose')
  const [controlMode, setControlMode] = useState('item_controlled')
  const [homeLocationId, setHomeLocationId] = useState('')
  const [barcode, setBarcode] = useState('')
  const [cartonQty, setCartonQty] = useState('')
  const [shelfLife, setShelfLife] = useState('')

  const loadList = () => api.itemList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => {
    loadList()
    api.get<LocOpt[]>('/masterdata/locations').then(r => {
      if (r.ok) setLocations((r.data ?? []).map((l: any) => ({
        id: l.id, code: l.code, warehouse_code: l.warehouse_code,
      })))
    })
  }, [])

  const handleSearch = async () => {
    if (!search.trim()) { loadList(); return }
    const r = await api.itemList(search)
    if (r.ok) setList(r.data ?? [])
  }

  const openItem = async (item: Item) => {
    setSelected(item)
    const r = await api.itemInventory(item.code)
    if (r.ok) setInventory(r.data ?? [])
  }

  const resetForm = () => {
    setCode(''); setName(''); setBrand(''); setItemGroup('')
    setHasSerial(false); setHasBatch(false); setHasExpiry(false)
    setPackType('loose'); setControlMode('item_controlled'); setHomeLocationId('')
    setBarcode(''); setCartonQty(''); setShelfLife('')
  }

  const createItem = async () => {
    const r = await api.itemCreate({
      code, name, brand, item_group: itemGroup,
      has_serial: hasSerial, has_batch: hasBatch, has_expiry_date: hasExpiry,
      pack_type: packType, control_mode: controlMode,
      home_location_id: homeLocationId ? +homeLocationId : undefined,
      barcode, carton_qty: cartonQty ? +cartonQty : 0,
      shelf_life_in_days: shelfLife ? +shelfLife : undefined,
    })
    if (r.ok) {
      setMsg(`Item ${code} created`)
      resetForm()
      setShowNew(false)
      loadList()
      notify({
        type: 'success',
        title: 'Item Created',
        message: r.data.master_complete ? `${code} (master complete)` : `${code} (master incomplete)`,
      })
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || '' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Items</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Item master with pack/control modes and stock by location
          </p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="erpnext-btn-primary">
          {showNew ? '✕ Cancel' : '+ New Item'}
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
            <h2 className="text-lg font-semibold">Create Item (complete master)</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="erpnext-label">Item Code *</label>
                <input className="erpnext-input" value={code} onChange={e => setCode(e.target.value)} placeholder="BJ-BRK-001" />
              </div>
              <div>
                <label className="erpnext-label">Item Name *</label>
                <input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} placeholder="Brake Pad Set" />
              </div>
              <div>
                <label className="erpnext-label">Brand</label>
                <input className="erpnext-input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Bajaj" />
              </div>
              <div>
                <label className="erpnext-label">Item Group</label>
                <input className="erpnext-input" value={itemGroup} onChange={e => setItemGroup(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Barcode</label>
                <input className="erpnext-input" value={barcode} onChange={e => setBarcode(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Pack type *</label>
                <select className="erpnext-input" value={packType} onChange={e => setPackType(e.target.value)}>
                  <option value="loose">Loose</option>
                  <option value="packed">Packed</option>
                </select>
              </div>
              <div>
                <label className="erpnext-label">Control mode *</label>
                <select className="erpnext-input" value={controlMode} onChange={e => setControlMode(e.target.value)}>
                  <option value="item_controlled">Item controlled</option>
                  <option value="bin_controlled">Bin controlled</option>
                </select>
              </div>
              {controlMode === 'bin_controlled' && (
                <div>
                  <label className="erpnext-label">Home location *</label>
                  <select className="erpnext-input" value={homeLocationId} onChange={e => setHomeLocationId(e.target.value)}>
                    <option value="">Select bin</option>
                    {locations.filter(l => true).map(l => (
                      <option key={l.id} value={l.id}>{l.warehouse_code} / {l.code}</option>
                    ))}
                  </select>
                </div>
              )}
              {packType === 'packed' && (
                <div>
                  <label className="erpnext-label">Carton qty</label>
                  <input className="erpnext-input" type="number" value={cartonQty} onChange={e => setCartonQty(e.target.value)} />
                </div>
              )}
              <div className="flex items-end gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasSerial} onChange={e => setHasSerial(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Serial</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasBatch} onChange={e => setHasBatch(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Batch</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Expiry</span>
                </label>
              </div>
              {hasExpiry && (
                <div>
                  <label className="erpnext-label">Shelf life (days) *</label>
                  <input className="erpnext-input" type="number" value={shelfLife} onChange={e => setShelfLife(e.target.value)} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createItem} className="erpnext-btn-primary">Create Item</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="erpnext-card">
          <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">All Items ({list.length})</h2>
            <div className="flex gap-3">
              <input className="erpnext-input text-sm" style={{ width: 180 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <button onClick={handleSearch} className="erpnext-btn-secondary text-sm">Search</button>
            </div>
          </div>
          <div className="p-4 overflow-auto" style={{ maxHeight: '70vh' }}>
            <table className="erpnext-table">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Pack</th>
                  <th>Control</th>
                  <th>Master</th>
                </tr>
              </thead>
              <tbody>
                {list.map(i => (
                  <tr key={i.id} onClick={() => openItem(i)} style={{ cursor: 'pointer', background: selected?.id === i.id ? 'var(--panel-2)' : undefined }}>
                    <td className="font-medium" style={{ color: 'var(--accent)' }}>{i.code}</td>
                    <td>{i.name}</td>
                    <td>{i.pack_type || 'loose'}</td>
                    <td>{i.control_mode === 'bin_controlled' ? 'bin' : 'item'}</td>
                    <td>
                      <span className={`erpnext-badge ${i.master_complete ? 'erpnext-badge-green' : 'erpnext-badge-yellow'}`}>
                        {i.master_complete ? 'ok' : 'incomplete'}
                      </span>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No items</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="erpnext-card">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">
              {selected ? `Stock locations — ${selected.code}` : 'Select an item'}
            </h2>
          </div>
          <div className="p-4 space-y-4">
            {selected && (
              <div className="text-sm grid grid-cols-2 gap-2" style={{ color: 'var(--text-dim)' }}>
                <div><strong style={{ color: 'var(--text)' }}>{selected.name}</strong></div>
                <div>{selected.brand || '—'}</div>
                <div>Pack: {selected.pack_type || 'loose'}</div>
                <div>Control: {selected.control_mode || 'item_controlled'}</div>
                <div>Serial: {selected.has_serial ? 'yes' : 'no'} · Batch: {selected.has_batch ? 'yes' : 'no'}</div>
                <div>Expiry: {selected.has_expiry_date ? 'yes' : 'no'}</div>
              </div>
            )}
            {selected && (
              <table className="erpnext-table">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Location</th>
                    <th>WH</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th className="text-right">Qty</th>
                    <th>Alloc</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(row => (
                    <tr key={row.id}>
                      <td className="font-medium" style={{ color: 'var(--accent)' }}>{row.location_code}</td>
                      <td>{row.warehouse_code}</td>
                      <td>{row.batch_no || '—'}</td>
                      <td>
                        {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString() : '—'}
                        {row.fefo_warn && (
                          <span className="erpnext-badge erpnext-badge-yellow ml-1">
                            {row.days_until_expiry != null ? `${row.days_until_expiry}d` : 'FEFO'}
                          </span>
                        )}
                      </td>
                      <td className="text-right">{row.actual_qty}</td>
                      <td>
                        <span className={`erpnext-badge ${
                          row.allocation_status === 'available' ? 'erpnext-badge-green'
                            : row.allocation_status === 'partial' ? 'erpnext-badge-yellow'
                              : 'erpnext-badge-red'
                        }`}>{row.allocation_status}</span>
                      </td>
                    </tr>
                  ))}
                  {inventory.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No stock at locations</td></tr>
                  )}
                </tbody>
              </table>
            )}
            {!selected && (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Click an item to see where it sits in the warehouse.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
