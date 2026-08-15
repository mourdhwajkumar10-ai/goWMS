import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

interface Wh { id: number; code: string; name: string }
interface Loc { id: number; code: string; warehouse_id: number }
interface Transfer {
  id: number
  name: string
  status: string | null
  from_warehouse: string | null
  to_warehouse: string | null
  from_warehouse_id: number | null
  to_warehouse_id: number | null
}

export default function Transfers() {
  const [list, setList] = useState<Transfer[]>([])
  const [warehouses, setWarehouses] = useState<Wh[]>([])
  const [locations, setLocations] = useState<Loc[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showNew, setShowNew] = useState(false)

  const [fromWh, setFromWh] = useState('')
  const [toWh, setToWh] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [qty, setQty] = useState('')
  const [batch, setBatch] = useState('')
  const [srcLoc, setSrcLoc] = useState('')
  const [recvLoc, setRecvLoc] = useState('')

  const load = () => api.get<Transfer[]>('/inventory/transfers').then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => {
    load()
    api.warehouseList().then(r => { if (r.ok) setWarehouses(r.data ?? []) })
    api.get<Loc[]>('/masterdata/locations').then(r => { if (r.ok) setLocations(r.data ?? []) })
  }, [])
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
    const r = await api.get(`/inventory/transfers/${id}`)
    if (r.ok) setSelected(r.data)
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

  const fromLocs = locations.filter(l => String(l.warehouse_id) === fromWh)
  const toLocs = locations.filter(l => selected?.to_warehouse_id ? l.warehouse_id === selected.to_warehouse_id : String(l.warehouse_id) === toWh)

  return (
    <div className="space-y-6">
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
                {fromLocs.map(l => <option key={l.id} value={l.id}>{l.code}</option>)}
              </select>
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
                    {toLocs.map(l => <option key={l.id} value={l.id}>{l.code}</option>)}
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
