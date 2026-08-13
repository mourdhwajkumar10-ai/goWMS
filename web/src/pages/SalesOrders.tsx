import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import CSVImport from '../components/CSVTools'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'
import ItemAutocomplete, { withTrailingEmptyRow, stripTrailingEmptyRows } from '../components/ItemAutocomplete'

interface SORow {
  id: number
  name: string
  customer_name: string | null
  status: string
  grand_total: number | null
  currency: string | null
  delivery_date: string | null
  priority: number | null
  priority_label: string
  per_picked: number | null
  per_delivered: number | null
  line_count: number
  po_no: string | null
}

function priorityBadge(p: number | null, label?: string) {
  const n = p ?? 4
  const bg = n >= 9 ? 'var(--red)' : n >= 7 ? '#ea580c' : n >= 5 ? 'var(--yellow)' : n >= 3 ? 'var(--accent)' : 'var(--text-dim)'
  return (
    <span className="erpnext-badge" style={{ background: bg, color: '#fff' }}>
      P{n} {label || ''}
    </span>
  )
}

export default function SalesOrders() {
  const [list, setList] = useState<SORow[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [warehouses, setWarehouses] = useState<any[]>([])

  const [customer, setCustomer] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [priority, setPriority] = useState('4')
  const [priorityReason, setPriorityReason] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [poNo, setPoNo] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<{ item_code: string; item_name: string; qty: number; rate: number }[]>([
    { item_code: '', item_name: '', qty: 1, rate: 0 },
  ])

  const emptySOLine = () => ({ item_code: '', item_name: '', qty: 1, rate: 0 })
  const soFilled = (r: { item_code: string }) => !!r.item_code.trim()

  const setSOLines = (next: typeof items) => {
    setItems(withTrailingEmptyRow(next, soFilled, emptySOLine))
  }

  const [prioOverride, setPrioOverride] = useState('')
  const [prioReason, setPrioReason] = useState('')

  const loadList = () => {
    const qs = new URLSearchParams()
    if (search) qs.set('q', search)
    if (statusFilter) qs.set('status', statusFilter)
    api.soList(qs.toString()).then(r => { if (r.ok) setList(r.data ?? []) })
  }

  useEffect(() => {
    loadList()
    api.warehouseList().then(r => { if (r.ok) setWarehouses(r.data ?? []) })
  }, [])

  const openSO = async (id: number) => {
    const r = await api.soGet(id)
    if (r.ok) setSelected(r.data)
  }

  const createSO = async () => {
    const valid = stripTrailingEmptyRows(items, soFilled).filter(i => i.item_code && i.qty > 0)
    if (!customer || !valid.length) {
      notify({ type: 'error', title: 'Missing fields', message: 'Customer and at least one item required' })
      return
    }
    const r = await api.soCreate({
      customer_name: customer,
      delivery_date: deliveryDate || undefined,
      priority: +priority,
      priority_reason: priorityReason || undefined,
      warehouse_id: warehouseId ? +warehouseId : undefined,
      po_no: poNo || undefined,
      notes: notes || undefined,
      items: valid,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Sales Order Created', message: `${r.data.name} · P${r.data.priority}` })
      setShowNew(false)
      setCustomer(''); setDeliveryDate(''); setPriority('4'); setPriorityReason('')
      setWarehouseId(''); setPoNo(''); setNotes('')
      setItems([emptySOLine()])
      loadList()
      openSO(r.data.id)
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || 'Could not create SO' })
    }
  }

  const confirmSO = async (id: number) => {
    const r = await api.soConfirm(id)
    if (r.ok) {
      notify({ type: 'success', title: 'Confirmed', message: 'Ready for picking' })
      openSO(id); loadList()
    } else {
      notify({ type: 'error', title: 'Confirm failed', message: r.error || '' })
    }
  }

  const cancelSO = async (id: number) => {
    const r = await api.soCancel(id)
    if (r.ok) {
      notify({ type: 'warning', title: 'Cancelled', message: 'Sales order cancelled' })
      openSO(id); loadList()
    } else {
      notify({ type: 'error', title: 'Cancel failed', message: r.error || '' })
    }
  }

  const createPick = async (id: number) => {
    const r = await api.soCreatePick(id)
    if (r.ok) {
      notify({ type: 'success', title: 'Pick List Created', message: r.data.name || r.data.pick_list_name })
      openSO(id); loadList()
    } else {
      notify({ type: 'error', title: 'Allocate failed', message: r.error || '' })
    }
  }

  const overridePriority = async () => {
    if (!selected || !prioOverride || !prioReason) return
    const r = await api.soPriority(selected.id, { priority: +prioOverride, reason: prioReason })
    if (r.ok) {
      notify({ type: 'success', title: 'Priority Updated', message: `P${r.data.priority} ${r.data.priority_label}` })
      setPrioOverride(''); setPrioReason('')
      openSO(selected.id); loadList()
    } else {
      notify({ type: 'error', title: 'Override failed', message: r.error || '' })
    }
  }

  const handleImport = async (rows: any[]) => {
    const r = await api.soImport({ rows })
    if (r.ok) {
      notify({
        type: 'success',
        title: 'Import Complete',
        message: `Created ${r.data.count} orders` + (r.data.errors?.length ? ` · ${r.data.errors.length} errors` : ''),
      })
      loadList()
    } else {
      notify({ type: 'error', title: 'Import failed', message: r.error || '' })
    }
  }

  const statusBadge = (status: string) => {
    const s = (status || '').toLowerCase()
    const cls = s.includes('confirm') || s === 'picking' || s.includes('deliver') ? 'erpnext-badge-blue'
      : s.includes('cancel') ? 'erpnext-badge-red'
      : s.includes('complete') ? 'erpnext-badge-green'
      : 'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sales Orders</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Priority queue · confirm · create pick</p>
        </div>
        <div className="flex gap-2">
          <button
            className="erpnext-btn-secondary"
            onClick={async () => {
              const r = await api.soDecayPriorities()
              if (r.ok) notify({ type: 'success', title: 'Priority decay', message: `Updated ${r.data.decayed} orders` })
              else notify({ type: 'error', title: 'Decay failed', message: r.error || '' })
              loadList()
            }}
          >Run SLA Decay</button>
          <CSVImport onImport={handleImport} />
          <button onClick={() => { setShowNew(!showNew); setSelected(null) }} className="erpnext-btn-primary">
            {showNew ? 'Cancel' : '+ New Sales Order'}
          </button>
        </div>
      </div>

      {showNew && (
        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Create Sales Order</h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="erpnext-label">Customer *</label>
                <input className="erpnext-input" value={customer} onChange={e => setCustomer(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Delivery Date</label>
                <input className="erpnext-input" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Priority (1–10)</label>
                <select className="erpnext-input" value={priority} onChange={e => setPriority(e.target.value)}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>P{n}</option>)}
                </select>
              </div>
              <div>
                <label className="erpnext-label">Warehouse</label>
                <select className="erpnext-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  <option value="">Default</option>
                  {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.code || w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="erpnext-label">Customer PO</label>
                <input className="erpnext-input" value={poNo} onChange={e => setPoNo(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Priority Reason</label>
                <input className="erpnext-input" value={priorityReason} onChange={e => setPriorityReason(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="erpnext-label">Notes</label>
              <input className="erpnext-input" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <h4 className="font-medium text-sm">Lines</h4>
                <button type="button" className="erpnext-btn-secondary text-sm" onClick={() => setSOLines([...items, emptySOLine()])}>+ Add</button>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>New row appears automatically after you pick an item.</p>
              <table className="erpnext-table text-sm">
                <thead><tr><th>Item</th><th>Name</th><th>Qty</th><th>Rate</th><th></th></tr></thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        <ItemAutocomplete
                          value={it.item_code}
                          onSelect={(found) => {
                            const u = [...items]
                            u[idx] = {
                              ...u[idx],
                              item_code: found.code,
                              item_name: found.name || u[idx].item_name,
                              rate: found.standard_rate || found.valuation_rate || u[idx].rate,
                            }
                            setSOLines(u)
                          }}
                          onChangeText={(t) => {
                            const u = [...items]
                            u[idx].item_code = t
                            setItems(u)
                          }}
                        />
                      </td>
                      <td><input className="erpnext-input text-sm" value={it.item_name} onChange={e => { const u=[...items]; u[idx].item_name=e.target.value; setItems(u) }} /></td>
                      <td><input className="erpnext-input text-sm" type="number" value={it.qty} onChange={e => { const u=[...items]; u[idx].qty=+e.target.value; setSOLines(u) }} /></td>
                      <td><input className="erpnext-input text-sm" type="number" value={it.rate} onChange={e => { const u=[...items]; u[idx].rate=+e.target.value; setItems(u) }} /></td>
                      <td><button type="button" onClick={() => {
                        const next = items.filter((_, i) => i !== idx)
                        setSOLines(next.length ? next : [emptySOLine()])
                      }} style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createSO} className="erpnext-btn-primary">Create</button>
            </div>
          </div>
        </div>
      )}

      {!selected ? (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex flex-wrap gap-2 items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Orders (priority DESC)</h3>
            <div className="flex gap-2">
              <input className="erpnext-input text-sm" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadList()} />
              <select className="erpnext-input text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="picking">Picking</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={loadList} className="erpnext-btn-secondary text-sm">Filter</button>
            </div>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="erpnext-table">
              <thead>
                <tr><th>SO</th><th>Customer</th><th>Priority</th><th>Status</th><th>Delivery</th><th>Total</th><th>Lines</th><th>Picked%</th><th></th></tr>
              </thead>
              <tbody>
                {list.map(o => (
                  <tr key={o.id}>
                    <td className="font-medium cursor-pointer hover:underline" style={{ color: 'var(--accent)' }} onClick={() => openSO(o.id)}>{o.name}</td>
                    <td>{o.customer_name || '—'}</td>
                    <td>{priorityBadge(o.priority, o.priority_label)}</td>
                    <td>{statusBadge(o.status)}</td>
                    <td>{o.delivery_date || '—'}</td>
                    <td>{o.grand_total != null ? `${o.currency || 'INR'} ${o.grand_total}` : '—'}</td>
                    <td>{o.line_count}</td>
                    <td>{o.per_picked ?? 0}%</td>
                    <td><button onClick={() => openSO(o.id)} className="erpnext-btn-secondary text-xs">Open</button></td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={9} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No sales orders</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold">{selected.name} {priorityBadge(selected.priority, selected.priority_label)}</h3>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                {selected.customer_name} · {selected.status} · Delivery {selected.delivery_date || '—'}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(selected.status === 'draft' || selected.status === 'Draft') && (
                <button onClick={() => confirmSO(selected.id)} className="erpnext-btn-primary">Confirm</button>
              )}
              {selected.status !== 'cancelled' && selected.status !== 'Cancelled' && selected.status !== 'draft' && selected.status !== 'Draft' && (
                <>
                  <button onClick={() => createPick(selected.id)} className="erpnext-btn-primary">Create Pick</button>
                  <Link to="/pick" className="erpnext-btn-secondary">Go to Pick</Link>
                </>
              )}
              {selected.status !== 'cancelled' && selected.status !== 'Cancelled' && (
                <button onClick={() => cancelSO(selected.id)} className="erpnext-btn-secondary" style={{ color: 'var(--red)' }}>Cancel</button>
              )}
              <button onClick={() => setSelected(null)} className="erpnext-btn-secondary">Back</button>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span style={{ color: 'var(--text-dim)' }}>Total: </span><strong>{selected.currency || 'INR'} {selected.grand_total ?? 0}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Picked: </span>{selected.per_picked ?? 0}%</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Delivered: </span>{selected.per_delivered ?? 0}%</div>
              <div><span style={{ color: 'var(--text-dim)' }}>PO: </span>{selected.po_no || '—'}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="erpnext-label">Override Priority</label>
                <select className="erpnext-input" value={prioOverride} onChange={e => setPrioOverride(e.target.value)}>
                  <option value="">—</option>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>P{n}</option>)}
                </select>
              </div>
              <div>
                <label className="erpnext-label">Reason *</label>
                <input className="erpnext-input" value={prioReason} onChange={e => setPrioReason(e.target.value)} placeholder="Why override?" />
              </div>
              <button onClick={overridePriority} className="erpnext-btn-secondary">Set Priority</button>
            </div>

            <table className="erpnext-table text-sm">
              <thead>
                <tr><th>Item</th><th>Name</th><th>Qty</th><th>Rate</th><th>Allocated</th><th>Picked</th><th>Backorder</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(selected.items || []).map((it: any) => (
                  <tr key={it.id}>
                    <td className="font-medium">{it.item_code}</td>
                    <td>{it.item_name || '—'}</td>
                    <td>{it.qty}</td>
                    <td>{it.rate}</td>
                    <td>{it.allocated_qty}</td>
                    <td>{it.picked_qty}</td>
                    <td>{it.backordered_qty}</td>
                    <td>{it.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Comments entityType="sales_order" entityId={selected.id} />
          </div>
        </div>
      )}
    </div>
  )
}
