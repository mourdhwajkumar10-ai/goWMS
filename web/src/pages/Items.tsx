import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface Item {
  id: number
  code: string
  name: string
  has_serial: boolean
  has_batch: boolean
  safety_stock: number | null
  brand: string | null
  item_group: string | null
  valuation_rate: number | null
}

export default function Items() {
  const [list, setList] = useState<Item[]>([])
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [msg, setMsg] = useState('')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [hasSerial, setHasSerial] = useState(false)
  const [hasBatch, setHasBatch] = useState(false)

  const loadList = () => api.get<Item[]>('/masterdata/items').then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const handleSearch = async () => {
    if (!search.trim()) { loadList(); return }
    const r = await api.itemList(search)
    if (r.ok) setList(r.data ?? [])
  }

  const createItem = async () => {
    const r = await api.itemCreate({ code, name, brand, item_group: itemGroup, has_serial: hasSerial, has_batch: hasBatch })
    if (r.ok) {
      setMsg(`Item ${code} created`)
      setCode(''); setName(''); setBrand(''); setItemGroup(''); setHasSerial(false); setHasBatch(false)
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Item Created', message: code })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Items</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Item master with tracking options</p>
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
            <h2 className="text-lg font-semibold">Create Item</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="erpnext-label">Item Code *</label>
                <input className="erpnext-input" value={code} onChange={e => setCode(e.target.value)} placeholder="ITEM-001" />
              </div>
              <div>
                <label className="erpnext-label">Item Name *</label>
                <input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} placeholder="Brake Pad Set" />
              </div>
              <div>
                <label className="erpnext-label">Brand</label>
                <input className="erpnext-input" value={brand} onChange={e => setBrand(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Item Group</label>
                <input className="erpnext-input" value={itemGroup} onChange={e => setItemGroup(e.target.value)} />
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasSerial} onChange={e => setHasSerial(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Has Serial</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasBatch} onChange={e => setHasBatch(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Has Batch</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createItem} className="erpnext-btn-primary">Create Item</button>
            </div>
          </div>
        </div>
      )}

      <div className="erpnext-card">
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">All Items ({list.length})</h2>
          <div className="flex gap-3">
            <input className="erpnext-input text-sm" style={{ width: 250 }} placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            <button onClick={handleSearch} className="erpnext-btn-secondary text-sm">Search</button>
          </div>
        </div>
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Code</th>
                <th>Name</th>
                <th>Brand</th>
                <th>Group</th>
                <th>Serial</th>
                <th>Batch</th>
                <th className="text-right">Safety Stock</th>
                <th className="text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {list.map(i => (
                <tr key={i.id}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{i.code}</td>
                  <td>{i.name}</td>
                  <td>{i.brand || '—'}</td>
                  <td>{i.item_group || '—'}</td>
                  <td>{i.has_serial ? <span className="erpnext-badge erpnext-badge-green">✓</span> : '—'}</td>
                  <td>{i.has_batch ? <span className="erpnext-badge erpnext-badge-blue">✓</span> : '—'}</td>
                  <td className="text-right">{i.safety_stock ?? '—'}</td>
                  <td className="text-right">{i.valuation_rate?.toFixed(2) ?? '—'}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={8} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No items</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
