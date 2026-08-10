import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface LocRow {
  id: number
  code: string
  warehouse_id: number
  warehouse_code: string
  warehouse_name: string
  aisle: string
  shelf: string
  level: string
  number: string
  location_type: string
  on_hand_qty: number
  item_count: number
}

interface InvRow {
  id: number
  item_code: string
  item_name: string | null
  batch_no: string
  expiry_date: string | null
  actual_qty: number
  reserved_qty: number
  available_qty: number
  allocation_status: string
  location_code: string
  warehouse_code: string
}

interface Wh {
  id: number
  code: string
  name: string
}

export default function Locations() {
  const [warehouses, setWarehouses] = useState<Wh[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [locations, setLocations] = useState<LocRow[]>([])
  const [selected, setSelected] = useState<LocRow | null>(null)
  const [inventory, setInventory] = useState<InvRow[]>([])

  useEffect(() => {
    api.warehouseList().then(r => { if (r.ok) setWarehouses(r.data ?? []) })
  }, [])

  useEffect(() => {
    const q = warehouseId ? `?warehouse_id=${warehouseId}` : ''
    api.get<LocRow[]>(`/masterdata/locations${q}`).then(r => {
      if (r.ok) setLocations(r.data ?? [])
    })
    setSelected(null)
    setInventory([])
  }, [warehouseId])

  const openLocation = async (loc: LocRow) => {
    setSelected(loc)
    const r = await api.locationInventory(loc.id)
    if (r.ok) setInventory(r.data ?? [])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Locations</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Inventory by bin — item, qty, batch, expiry, allocation
          </p>
        </div>
        <div style={{ minWidth: 220 }}>
          <label className="erpnext-label">Warehouse</label>
          <select className="erpnext-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
            <option value="">All warehouses</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Bins ({locations.length})</h2>
          </div>
          <div className="p-4 overflow-auto" style={{ maxHeight: '70vh' }}>
            <table className="erpnext-table">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>Code</th>
                  <th>WH</th>
                  <th>Type</th>
                  <th className="text-right">On hand</th>
                  <th>SKUs</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(l => (
                  <tr
                    key={l.id}
                    onClick={() => openLocation(l)}
                    style={{ cursor: 'pointer', background: selected?.id === l.id ? 'var(--panel-2)' : undefined }}
                  >
                    <td className="font-medium" style={{ color: 'var(--accent)' }}>{l.code}</td>
                    <td>{l.warehouse_code}</td>
                    <td><span className="erpnext-badge erpnext-badge-blue">{l.location_type}</span></td>
                    <td className="text-right">{l.on_hand_qty}</td>
                    <td>{l.item_count}</td>
                  </tr>
                ))}
                {locations.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No locations — add them under Warehouses</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="erpnext-card">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">
              {selected ? `Contents — ${selected.code}` : 'Select a location'}
            </h2>
          </div>
          <div className="p-4">
            {!selected && (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Pick a bin to see items stored there.</p>
            )}
            {selected && (
              <table className="erpnext-table">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Item</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Avail</th>
                    <th>Alloc</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(row => (
                    <tr key={row.id}>
                      <td>
                        <div className="font-medium" style={{ color: 'var(--accent)' }}>{row.item_code}</div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{row.item_name || '—'}</div>
                      </td>
                      <td>{row.batch_no || '—'}</td>
                      <td>{row.expiry_date ? new Date(row.expiry_date).toLocaleDateString() : '—'}</td>
                      <td className="text-right">{row.actual_qty}</td>
                      <td className="text-right">{row.available_qty}</td>
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
                    <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>Empty bin</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
