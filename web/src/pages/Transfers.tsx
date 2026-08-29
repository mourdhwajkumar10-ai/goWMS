import { useEffect, useState, useMemo } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

interface Wh { id: number; code: string; name: string }
interface Loc { id: number; code: string; warehouse_id: number; location_type?: string }
interface Transfer {
  id: number
  name: string
  status: string | null
  from_warehouse: string | null
  to_warehouse: string | null
  from_warehouse_id: number | null
  to_warehouse_id: number | null
  items?: Array<{ id: number; item_code: string; qty: number; batch_no?: string; s_location_id?: number }>
}

interface LocWithQty extends Loc {
  available_qty?: number
  reserved_qty?: number
}

export default function Transfers() {
  const [list, setList] = useState<Transfer[]>([])
  const [warehouses, setWarehouses] = useState<Wh[]>([])
  const [locations, setLocations] = useState<Loc[]>([])
  const [selected, setSelected] = useState<Transfer | null>(null)
  const [showNew, setShowNew] = useState(false)

  const [fromWh, setFromWh] = useState('')
  const [toWh, setToWh] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [qty, setQty] = useState('')
  const [batch, setBatch] = useState('')
  const [srcLoc, setSrcLoc] = useState('')
  const [recvLoc, setRecvLoc] = useState('')

  // P0: Track available qty per source location
  const [srcLocQtys, setSrcLocQtys] = useState<Record<number, { available: number; reserved: number }>>({})
  const [recvLocQtys, setRecvLocQtys] = useState<Record<number, { available: number; reserved: number }>>({})

  const load = () => api.get<Transfer[]>('/inventory/transfers').then(r => { if (r.ok) setList(r.data ?? []) })
  
  const loadLocations = async () => {
    const r = await api.get<Loc[]>('/masterdata/locations')
    if (r.ok) setLocations(r.data ?? [])
  }

  useEffect(() => {
    load()
    api.warehouseList().then(r => { if (r.ok) setWarehouses(r.data ?? []) })
    loadLocations()
  }, [])
  
  // P1: Fetch available qty for source locations when fromWh/itemCode change
  useEffect(() => {
    if (!fromWh || !itemCode) {
      setSrcLocQtys({})
      return
    }
    // Use stockPeek to get available qty per location for this item in from warehouse
    api.get<any>(`/masterdata/items/${encodeURIComponent(itemCode)}/inventory?warehouse_id=${fromWh}`)
      .then(r => {
        if (r.ok && r.data?.rows) {
          const qtys: Record<number, { available: number; reserved: number }> = {}
          for (const row of r.data.rows) {
            if (row.location_id && (row.actual_qty ?? row.qty) != null) {
              qtys[row.location_id] = {
                available: (row.actual_qty ?? row.qty) - (row.reserved_qty ?? 0),
                reserved: row.reserved_qty ?? 0
              }
            }
          }
          setSrcLocQtys(qtys)
        }
      })
  }, [fromWh, itemCode])
  
  // P1: Fetch available qty for destination locations when toWh changes
  useEffect(() => {
    if (!toWh || !itemCode) {
      setRecvLocQtys({})
      return
    }
    api.get<any>(`/masterdata/items/${encodeURIComponent(itemCode)}/inventory?warehouse_id=${toWh}`)
      .then(r => {
        if (r.ok && r.data?.rows) {
          const qtys: Record<number, { available: number; reserved: number }> = {}
          for (const row of r.data.rows) {
            if (row.location_id && (row.actual_qty ?? row.qty) != null) {
              qtys[row.location_id] = {
                available: (row.actual_qty ?? row.qty) - (row.reserved_qty ?? 0),
                reserved: row.reserved_qty ?? 0
              }
            }
          }
          setRecvLocQtys(qtys)
        }
      })
  }, [toWh, itemCode])
  
  const pager = useClientPager(list)

  const create = async () => {
    const r = await api.post<{ name: string }>('/inventory/transfers', {
      from_warehouse_id: +fromWh,
      to_warehouse_id: +toWh,
      items: [{
        item_code: itemCode,
        qty: +qty,
        batch_no: batch || undefined,
        source_location_id: srcLoc ? +srcLoc : undefined,
      }],
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Transfer drafted', message: r.data?.name })
      setShowNew(false)
      setItemCode(''); setQty(''); setBatch('')
      load()
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || '' })
    }
  }

  const open = async (id: number) => {
    const r = await api.get<Transfer>(`/inventory/transfers/${id}`)
    if (r.ok && r.data) setSelected(r.data)
  }

  const ship = async (id: number) => {
    const r = await api.post(`/inventory/transfers/${id}/ship`, {})
    if (r.ok) {
      notify({ type: 'success', title: 'Shipped', message: 'In transit to destination' })
      open(id); load()
    } else {
      notify({ type: 'error', title: 'Ship failed', message: r.error || '' })
    }
  }

  const receive = async (id: number) => {
    const r = await api.post(`/inventory/transfers/${id}/receive`, {
      target_location_id: recvLoc ? +recvLoc : undefined,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Received', message: 'Stock at destination' })
      open(id); load()
    } else {
      notify({ type: 'error', title: 'Receive failed', message: r.error || '' })
    }
  }

  // P0: Filter source locations by from warehouse (storage/pick_face only)
  const fromLocs = locations.filter(l => 
    l.warehouse_id === Number(fromWh) && 
    (l.location_type === 'storage' || l.location_type === 'pick_face')
  )
  
  // P0: Filter destination locations by TO warehouse (storage/pick_face/incoming)
  const destWarehouseId = selected?.to_warehouse_id ?? Number(toWh)
  const toLocs = locations.filter(l => 
    l.warehouse_id === destWarehouseId && 
    (l.location_type === 'storage' || l.location_type === 'pick_face' || l.location_type === 'incoming')
  )

  return (
    <div className="desk-page space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Warehouse Transfers</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Ship from Main → receive at Branch (same location model)</p>
        </div>
        <button className="erpnext-btn-primary" onClick={() => setShowNew(!showNew)}>{showNew ? 'Cancel' : '+ New Transfer'}</button>
      </div>

      {showNew && (
        <div className="erpnext-card p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="erpnext-label">From warehouse *</label>
              <select className="erpnext-input" value={fromWh} onChange={e => setFromWh(e.target.value)}>
                <option value="">Select</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.code}</option>)}
              </select>
            </div>
            <div>
              <label className="erpnext-label">To warehouse *</label>
              <select className="erpnext-input" value={toWh} onChange={e => setToWh(e.target.value)}>
                <option value="">Select</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.code}</option>)}
              </select>
            </div>
            <div>
              <label className="erpnext-label">Source location (optional)</label>
              <select className="erpnext-input" value={srcLoc} onChange={e => setSrcLoc(e.target.value)}>
                <option value="">Auto (FEFO)</option>
                {fromLocs.map(l => {
                  const q = srcLocQtys[l.id]
                  const avail = q ? q.available : 0
                  const reserved = q ? q.reserved : 0
                  return <option key={l.id} value={l.id} style={{ color: avail > 0 ? 'inherit' : '#999' }}>
                    {l.code} {avail > 0 ? `(${avail} avail)` : reserved > 0 ? `(reserved: ${reserved})` : '(empty)'}
                  </option>
                })}
              </select>
              {srcLoc && srcLocQtys[Number(srcLoc)] && srcLocQtys[Number(srcLoc)].available < Number(qty) && (
                <div className="text-xs text-red-500 mt-1">⚠ Selected location has insufficient stock ({srcLocQtys[Number(srcLoc)].available} available, need {qty})</div>
              )}
            </div>
            <div>
              <label className="erpnext-label">Item *</label>
              <input className="erpnext-input" value={itemCode} onChange={e => setItemCode(e.target.value)} />
            </div>
            <div>
              <label className="erpnext-label">Qty *</label>
              <input className="erpnext-input" type="number" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
            <div>
              <label className="erpnext-label">Batch</label>
              <input className="erpnext-input" value={batch} onChange={e => setBatch(e.target.value)} />
            </div>
          </div>
          <button className="erpnext-btn-primary" onClick={create}>Create draft</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Transfers ({list.length})</h2>
            <ListPager pager={pager} placeholder="Search transfers…" />
          </div>
          <div className="p-4">
            <table className="erpnext-table">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>Name</th>
                  <th>From → To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map(t => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => open(t.id)}>
                    <td className="font-medium" style={{ color: 'var(--accent)' }}>{t.name}</td>
                    <td>{t.from_warehouse} → {t.to_warehouse}</td>
                    <td><span className="erpnext-badge erpnext-badge-blue">{t.status}</span></td>
                  </tr>
                ))}
                {pager.total === 0 && <tr><td colSpan={3} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No transfers</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="erpnext-card">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">{selected ? selected.name : 'Select a transfer'}</h2>
          </div>
          {selected && (
            <div className="p-4 space-y-4">
              <div className="text-sm" style={{ color: 'var(--text-dim)' }}>
                {selected.from_warehouse} → {selected.to_warehouse} · <strong style={{ color: 'var(--text)' }}>{selected.status}</strong>
              </div>
              <table className="erpnext-table text-sm">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Item</th><th>Qty</th><th>Batch</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.items || []).map((it: any) => (
                    <tr key={it.id}>
                      <td>{it.item_code}</td>
                      <td>{it.qty}</td>
                      <td>{it.batch_no || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selected.status === 'draft' && (
                <button className="erpnext-btn-primary" onClick={() => ship(selected.id)}>Ship</button>
              )}
              {selected.status === 'in_transit' && (
                <div className="space-y-2">
                  <label className="erpnext-label">Receive into location</label>
                  <select className="erpnext-input" value={recvLoc} onChange={e => setRecvLoc(e.target.value)}>
                    <option value="">INCOMING-01 (default)</option>
                    {toLocs.map(l => {
                      const q = recvLocQtys[l.id]
                      const avail = q ? q.available : 0
                      return <option key={l.id} value={l.id} style={{ color: avail >= 0 ? 'inherit' : '#999' }}>
                        {l.code} {avail > 0 ? `(${avail} on hand)` : avail === 0 ? '(empty)' : ''}
                      </option>
                    })}
                  </select>
                  <button className="erpnext-btn-primary" onClick={() => receive(selected.id)}>Receive</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
