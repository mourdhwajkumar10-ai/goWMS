import { FormEvent, useEffect, useState } from 'react'
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
  customer: string | null
}

interface PickItem {
  id: number
  item_code: string
  item_name: string
  qty: number
  picked_qty: number
  bin_location: string
  status: string
}

export default function Pick() {
  const [lists, setLists] = useState<PickList[]>([])
  const [selectedList, setSelectedList] = useState<any>(null)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanTarget, setScanTarget] = useState<'item' | 'bin'>('item')

  const [salesOrder, setSalesOrder] = useState('')
  const [customer, setCustomer] = useState('')
  const [warehouse, setWarehouse] = useState('Stores - GW')
  const [items, setItems] = useState<{ item_code: string; qty: number; bin_location: string }[]>([])

  const [scanItem, setScanItem] = useState('')
  const [scanBin, setScanBin] = useState('')
  const [scanQty, setScanQty] = useState('1')

  const loadLists = () => api.pickLists().then(r => { if (r.ok) setLists(r.data ?? []) })
  useEffect(() => { loadLists() }, [])

  const addItem = () => {
    setItems([...items, { item_code: '', qty: 1, bin_location: '' }])
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
      warehouse,
      items: items.filter(i => i.item_code),
    })
    if (r.ok) {
      setMsg(`Pick list created: ${r.data.name}`)
      setShowNew(false)
      resetForm()
      loadLists()
      notify({ type: 'success', title: 'Pick List Created', message: r.data.name })
    }
  }

  const resetForm = () => {
    setSalesOrder(''); setCustomer(''); setWarehouse('Stores - GW'); setItems([])
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

  const logScan = async () => {
    if (!scanItem || !selectedList) return
    const r = await api.pickScan({
      pick_list_id: selectedList.id,
      item_code: scanItem,
      scanned_bin: scanBin,
      expected_bin: '',
      quantity: +scanQty || 1,
    })
    if (r.ok) {
      notify({ type: r.ok ? 'success' : 'warning', title: 'Item Picked', message: `${scanItem}: ${scanQty} units` })
      setScanItem(''); setScanBin(''); setScanQty('1')
      openList(selectedList.id)
    }
  }

  const statusBadge = (status: string) => {
    const cls = status === 'completed' ? 'erpnext-badge-green' :
                status === 'in_progress' ? 'erpnext-badge-blue' :
                'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

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
                <input className="erpnext-input" value={warehouse} onChange={e => setWarehouse(e.target.value)} />
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
                    <tr><th>#</th><th>Item Code</th><th>Qty</th><th>Bin Location</th><th></th></tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ color: 'var(--text-dim)' }}>{idx + 1}</td>
                        <td><input className="erpnext-input text-sm w-full" value={item.item_code} onChange={e => updateItem(idx, 'item_code', e.target.value)} /></td>
                        <td><input className="erpnext-input text-sm w-full" type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', +e.target.value)} /></td>
                        <td><input className="erpnext-input text-sm w-full" value={item.bin_location} onChange={e => updateItem(idx, 'bin_location', e.target.value)} placeholder="RACK-A-01" /></td>
                        <td><button onClick={() => removeItem(idx)} style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowNew(false); resetForm() }} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createList} className="erpnext-btn-primary">Create Pick List</button>
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
                {lists.map(l => (
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
                {lists.length === 0 && <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No pick lists</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold">{selectedList.name}</h3>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{selectedList.sales_order_no} — {selectedList.customer || 'No customer'}</p>
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
                <label className="erpnext-label">Bin Location</label>
                <input className="erpnext-input" value={scanBin} onChange={e => setScanBin(e.target.value)} placeholder="RACK-A-01" />
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
                <h4 className="font-medium text-sm mb-2">Pick Items</h4>
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr><th>Item</th><th>Name</th><th>Qty</th><th>Picked</th><th>Bin</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {selectedList.items.map((pi: PickItem) => (
                      <tr key={pi.id}>
                        <td className="font-medium">{pi.item_code}</td>
                        <td>{pi.item_name}</td>
                        <td>{pi.qty}</td>
                        <td>{pi.picked_qty}</td>
                        <td>{pi.bin_location || '—'}</td>
                        <td>{statusBadge(pi.status)}</td>
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
