import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import { PageHead } from '../components/desktop/PageHead'
import { Button } from '../components/ui/Button'
import { Badge, statusToVariant } from '../components/ui/Badge'

type SO = {
  id: number
  name: string
  customer_name: string
  status: string
  priority: number
  priority_label: string
  delivery_date: string | null
  line_count: number
}

export default function Wave() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<SO[]>([])
  const [waves, setWaves] = useState<any[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [sort, setSort] = useState<'location' | 'item'>('location')
  const [prioMax, setPrioMax] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [so, wv, wh] = await Promise.all([
      api.get<SO[]>('/sales-orders/?status=Confirmed'),
      api.pickWaves(),
      api.get<any[]>('/masterdata/warehouses'),
    ])
    if (so.ok) setOrders((so.data || []).filter(o => !/cancel/i.test(o.status || '')))
    if (wv.ok) setWaves(wv.data || [])
    if (wh.ok) setWarehouses(wh.data || [])
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (prioMax && (o.priority || 99) > +prioMax) return false
      if (q) {
        const needle = q.toLowerCase()
        if (!(`${o.name} ${o.customer_name}`.toLowerCase().includes(needle))) return false
      }
      return true
    })
  }, [orders, prioMax, q])

  const estimateLines = useMemo(
    () => filtered.filter(o => selected.includes(o.id)).reduce((s, o) => s + (o.line_count || 0), 0),
    [filtered, selected],
  )

  const toggle = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const create = async () => {
    if (!selected.length) {
      notify({ type: 'error', title: 'Select orders', message: 'Pick at least one confirmed SO' })
      return
    }
    setBusy(true)
    try {
      const r = await api.pickWave({
        sales_order_ids: selected,
        warehouse_id: warehouseId ? +warehouseId : undefined,
        sort,
      })
      if (!r.ok) {
        notify({ type: 'error', title: 'Wave failed', message: r.error || '' })
        return
      }
      notify({ type: 'success', title: 'Wave created', message: r.data.name })
      navigate(`/pick?list=${r.data.id || r.data.pick_list_id}&rf=1`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="desk-page space-y-3">
      <PageHead
        eyebrow="Outbound"
        title="Wave picking"
        subtitle="Multi-order FEFO allocate → bulk pick → consolidate"
        actions={
          <Button disabled={busy || !selected.length} onClick={() => void create()}>
            Create wave ({selected.length})
          </Button>
        }
      />

      <div className="erpnext-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="erpnext-label">Search</label>
          <input className="erpnext-input" value={q} onChange={e => setQ(e.target.value)} placeholder="SO or customer" />
        </div>
        <div>
          <label className="erpnext-label">Max priority #</label>
          <input className="erpnext-input" value={prioMax} onChange={e => setPrioMax(e.target.value)} placeholder="e.g. 2" />
        </div>
        <div>
          <label className="erpnext-label">Warehouse</label>
          <select className="erpnext-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
            <option value="">Default</option>
            {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.code || w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="erpnext-label">Walk sort</label>
          <select className="erpnext-input" value={sort} onChange={e => setSort(e.target.value as any)}>
            <option value="location">By location</option>
            <option value="item">By item</option>
          </select>
        </div>
      </div>

      <div className="erpnext-card p-3 text-sm" style={{ color: 'var(--text-dim)' }}>
        Selected {selected.length} orders · ~{estimateLines} lines
      </div>

      <div className="erpnext-card overflow-auto">
        <table className="erpnext-table w-full text-sm">
          <thead>
            <tr>
              <th></th>
              <th>Order</th>
              <th>Customer</th>
              <th>Priority</th>
              <th>Delivery</th>
              <th>Lines</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td>
                  <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                </td>
                <td>{o.name}</td>
                <td>{o.customer_name}</td>
                <td>{o.priority_label || o.priority}</td>
                <td>{o.delivery_date || '—'}</td>
                <td>{o.line_count}</td>
                <td><Badge variant={statusToVariant(o.status)}>{o.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="erpnext-card p-4 space-y-2">
        <h3 className="font-semibold">Recent waves</h3>
        {(waves || []).map((w: any) => (
          <div key={w.id} className="flex items-center justify-between gap-2 text-sm">
            <div>
              <strong>{w.name}</strong> · {w.customer || w.sales_order_no} · {w.status}
            </div>
            <div className="flex gap-2">
              <Link to={`/pick?list=${w.id}&rf=1`} className="erpnext-btn-secondary">Pick</Link>
              <Link to={`/consolidate?wave=${w.id}&rf=1`} className="erpnext-btn-primary">Consolidate</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
