import { useEffect, useState } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'

interface PickList {
  id: number
  name: string
  sales_order_no: string | null
  status: string | null
  picking_mode: string | null
  total_qty: number
  picked_qty: number
  allocated_qty?: number
  customer: string | null
  warehouse_id?: number | null
}

interface PickItem {
  id: number
  item_code: string
  item_name: string
  qty: number
  ordered_qty: number
  picked_qty: number
  allocated_qty: number
  bin_location: string
  location_code: string
  batch_no?: string
  expiry_date?: string | null
  fefo_badge?: string | null
  status: string
}

export default function Pick() {
  const [lists, setLists] = useState<PickList[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedList, setSelectedList] = useState<any>(null)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanTarget, setScanTarget] = useState<'item' | 'bin'>('item')

  const [salesOrder, setSalesOrder] = useState('')
  const [customer, setCustomer] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [items, setItems] = useState<{ item_code: string; qty: number }[]>([])

  const [scanItem, setScanItem] = useState('')
  const [scanBin, setScanBin] = useState('')
  const [scanQty, setScanQty] = useState('1')
  const [scanLineId, setScanLineId] = useState<number | null>(null)

  const loadLists = () => api.pickLists().then(r => { if (r.ok) setLists(r.data ?? []) })
  useEffect(() => {
    loadLists()
    api.warehouseList().then(r => { if (r.ok) setWarehouses(r.data ?? []) })
  }, [])

  const addItem = () => {
    setItems([...items, { item_code: '', qty: 1 }])
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    ;(updated[idx] as any)[field] = value
    setItems(updated)
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const createList = async () => {
    if (!items.length) return
    const r = await api.post<any>('/picking/', {
      sales_order_no: salesOrder,
      customer,
      warehouse_id: warehouseId ? +warehouseId : undefined,
      items: items.filter(i => i.item_code).map(i => ({
        item_code: i.item_code,
        ordered_qty: i.qty,
        qty: i.qty,
      })),
    })
    if (r.ok) {
      setMsg(`Pick list created: ${r.data.name} (FEFO allocated)`)
      setShowNew(false)
      resetForm()
      loadLists()
      notify({ type: 'success', title: 'Pick List Created', message: `${r.data.name} — stock reserved` })
      openList(r.data.id)
    } else {
      notify({ type: 'error', title: 'Allocate failed', message: r.error || 'Could not create pick list' })
    }
  }

  const resetForm = () => {
    setSalesOrder(''); setCustomer(''); setWarehouseId(''); setItems([])
  }

  const openList = async (id: number) => {
    const r = await api.get(`/picking/${id}`)
    if (r.ok) setSelectedList(r.data)
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    if (scanTarget === 'item') setScanItem(code)
    else setScanBin(code)
  }

  const selectLine = (pi: PickItem) => {
    setScanLineId(pi.id)
    setScanItem(pi.item_code)
    setScanBin(pi.location_code || pi.bin_location || '')
    setScanQty(String(Math.max(1, (pi.allocated_qty || pi.qty) - pi.picked_qty)))
  }

  const logScan = async () => {
    if (!scanItem || !selectedList) return
    const expected = selectedList.items?.find((x: PickItem) => x.id === scanLineId)?.location_code
      || selectedList.items?.find((x: PickItem) => x.item_code === scanItem && x.status !== 'picked' && x.status !== 'shortage')?.location_code
      || ''
    const r = await api.pickScan({
      pick_list_id: selectedList.id,
      pick_list_item_id: scanLineId || undefined,
      item_code: scanItem,
      scanned_bin: scanBin,
      expected_bin: expected,
      quantity: +scanQty || 1,
    })
    if (r.ok) {
      const drift = r.data?.location_drift ? ' (location drift)' : ''
      notify({
        type: r.data?.location_drift ? 'warning' : 'success',
        title: 'Item Picked',
        message: `${scanItem}: ${scanQty} units${drift}`,
      })
      setScanItem(''); setScanBin(''); setScanQty('1'); setScanLineId(null)
      openList(selectedList.id)
      loadLists()
    } else {
      notify({ type: 'error', title: 'Pick failed', message: r.error || 'Scan rejected' })
    }
  }

  const statusBadge = (status: string) => {
    const cls = status === 'completed' || status === 'picked' || status === 'delivered' ? 'erpnext-badge-green' :
                status === 'in_progress' || status === 'open' ? 'erpnext-badge-blue' :
                status === 'shortage' ? 'erpnext-badge-red' :
                'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  const fefoBadge = (badge?: string | null) => {
    if (!badge || badge === 'ok') return null
    const cls = badge === 'expired' ? 'erpnext-badge-red' : 'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls} ml-1`}>{badge}</span>
  }

  const filtered = lists.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return l.name.toLowerCase().includes(q)
      || (l.sales_order_no || '').toLowerCase().includes(q)
      || (l.customer || '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Picking</h2>
        <div className="flex gap-2">
          <button onClick={() => { setScanTarget('item'); setShowScanner(true) }} className="erpnext-btn-secondary">📷 Scan</button>
          <button onClick={() => { setShowNew(!showNew); setSelectedList(null) }} className="erpnext-btn-primary">
            {showNew ? 'Cancel' : '+ New Pick List'}
          </button>
        </div>
      </div>

      {showNew && (
        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Create Pick List</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
              Stock is allocated FEFO from storage / pick-face locations and reserved until pack or dispatch load.
            </p>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="erpnext-label">Sales Order No</label>
                <input className="erpnext-input" value={salesOrder} onChange={e => setSalesOrder(e.target.value)} placeholder="SO-001" />
              </div>
              <div>
                <label className="erpnext-label">Customer</label>
                <input className="erpnext-input" value={customer} onChange={e => setCustomer(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Warehouse</label>
                <select className="erpnext-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  <option value="">Default warehouse</option>
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.code || w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">Items to Pick</h4>
                <button onClick={addItem} className="erpnext-btn-secondary text-sm">+ Add Item</button>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-dim)' }}>No items added</p>
              ) : (
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr><th>#</th><th>Item Code</th><th>Qty</th><th></th></tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ color: 'var(--text-dim)' }}>{idx + 1}</td>
                        <td><input className="erpnext-input text-sm w-full" value={item.item_code} onChange={e => updateItem(idx, 'item_code', e.target.value)} /></td>
                        <td><input className="erpnext-input text-sm w-full" type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', +e.target.value)} /></td>
                        <td><button onClick={() => removeItem(idx)} style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowNew(false); resetForm() }} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createList} className="erpnext-btn-primary">Allocate &amp; Create</button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
          {msg}
        </div>
      )}

      {!selectedList ? (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Pick Lists</h3>
            <div className="flex gap-2">
              <input className="erpnext-input text-sm" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="p-4">
            <table className="erpnext-table">
              <thead>
                <tr><th>Name</th><th>Sales Order</th><th>Customer</th><th>Status</th><th>Mode</th><th>Picked</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id}>
                    <td className="font-medium cursor-pointer hover:underline" style={{ color: 'var(--accent)' }} onClick={() => openList(l.id)}>{l.name}</td>
                    <td>{l.sales_order_no || '—'}</td>
                    <td>{l.customer || '—'}</td>
                    <td>{statusBadge(l.status || 'pending')}</td>
                    <td>{l.picking_mode || '—'}</td>
                    <td>{l.picked_qty} / {l.total_qty}</td>
                    <td>
                      <button onClick={() => openList(l.id)} className="erpnext-btn-secondary text-xs">Open</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No pick lists</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold">{selectedList.name}</h3>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                {selectedList.sales_order_no} — {selectedList.customer || 'No customer'}
                {selectedList.stock_consumed ? ' · stock consumed' : ' · reserved until pack/dispatch'}
              </p>
            </div>
            <button onClick={() => setSelectedList(null)} className="erpnext-btn-secondary">Back</button>
          </div>

          <div className="p-4">
            <h4 className="font-medium text-sm mb-2">Scan to Pick</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="erpnext-label">Item Code</label>
                <div className="flex gap-1">
                  <input className="erpnext-input" value={scanItem} onChange={e => setScanItem(e.target.value)} placeholder="ITEM-001" />
                  <button onClick={() => { setScanTarget('item'); setShowScanner(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
                </div>
              </div>
              <div>
                <label className="erpnext-label">Suggested / Scanned Bin</label>
                <div className="flex gap-1">
                  <input className="erpnext-input" value={scanBin} onChange={e => setScanBin(e.target.value)} placeholder="A-01-01" />
                  <button onClick={() => { setScanTarget('bin'); setShowScanner(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
                </div>
              </div>
              <div>
                <label className="erpnext-label">Quantity</label>
                <input className="erpnext-input" type="number" value={scanQty} onChange={e => setScanQty(e.target.value)} />
              </div>
              <div className="flex items-end">
                <button onClick={logScan} className="erpnext-btn-primary">Log Pick</button>
              </div>
            </div>

            {selectedList.items && selectedList.items.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Pick Items (FEFO)</h4>
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr><th>Item</th><th>Name</th><th>Alloc</th><th>Picked</th><th>Location</th><th>Batch</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {selectedList.items.map((pi: PickItem) => (
                      <tr key={pi.id} className={scanLineId === pi.id ? 'bg-black/5' : undefined}>
                        <td className="font-medium">{pi.item_code}{fefoBadge(pi.fefo_badge)}</td>
                        <td>{pi.item_name}</td>
                        <td>{pi.allocated_qty ?? pi.qty}</td>
                        <td>{pi.picked_qty}</td>
                        <td>{pi.location_code || pi.bin_location || '—'}</td>
                        <td>
                          {pi.batch_no || '—'}
                          {pi.expiry_date ? <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>{String(pi.expiry_date).slice(0, 10)}</span> : null}
                        </td>
                        <td>{statusBadge(pi.status)}</td>
                        <td>
                          {pi.status !== 'picked' && pi.status !== 'shortage' && pi.status !== 'delivered' && (
                            <button onClick={() => selectLine(pi)} className="erpnext-btn-secondary text-xs">Pick</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Comments entityType="pick_list" entityId={selectedList.id} />
          </div>
        </div>
      )}
    </div>
  )
}
