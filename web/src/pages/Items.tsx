import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import CSVImport from '../components/CSVTools'
import ProductMasterFields, { emptyProductForm, productPayload, type LocOpt } from '../components/ProductMasterFields'
import { ListPage, type Column } from '../components/templates/ListPage'
import { StatusBadge } from '../components/common/StatusBadge'

interface Item {
  id: number
  code: string
  name: string
  has_serial: boolean
  has_batch: boolean
  has_expiry_date?: boolean
  requires_qi?: boolean
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
  max_qty_per_bin?: number | null
  shelf_life_in_days?: number | null
  mrp?: number
  hsn_no?: string
  gst_percentage?: number
  vech?: string
  make?: string
  uom?: string
  product_group?: string
  category?: string
  parts_movement?: string
  parts_pbo?: string
  threshold_value?: number
  max_rate_discount?: number
  remark?: string
  description?: string
  min_order_qty?: number
  weight_per_unit?: number
  standard_rate?: number
  velocity_tier?: string
}

export default function Items() {
  const [list, setList] = useState<Item[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 50
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Item | null>(null)
  const [locations, setLocations] = useState<LocOpt[]>([])
  const [msg, setMsg] = useState('')
  const [newForm, setNewForm] = useState(emptyProductForm())
  const [importing, setImporting] = useState(false)

  const loadList = (pageNum = page, q = search) => {
    const offset = (pageNum - 1) * PAGE_SIZE
    return api.itemList(q.trim() || undefined, { limit: PAGE_SIZE, offset }).then(r => {
      if (r.ok) {
        setList(r.data ?? [])
        setTotal(r.total ?? 0)
      }
    })
  }
  useEffect(() => {
    api.get<LocOpt[]>('/masterdata/locations').then(r => {
      if (r.ok) setLocations((r.data ?? []).map((l: any) => ({ id: l.id, code: l.code, warehouse_code: l.warehouse_code })))
    })
  }, [])
  useEffect(() => { loadList(page) }, [page])
  const goToPage = (next: number) => {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    setPage(Math.min(pages, Math.max(1, next)))
  }
  const handleSearch = async () => {
    if (page !== 1) setPage(1)
    else await loadList(1, search)
  }
  const openItem = (item: Item) => setSelected(item)
  const createItem = async () => {
    if (!newForm.code.trim() || !newForm.name.trim()) {
      notify({ type: 'error', title: 'Create failed', message: 'Product No and Description are required' })
      return
    }
    const r = await api.itemCreate(productPayload(newForm, { code: newForm.code.trim() }))
    if (r.ok) {
      setMsg(`Item ${newForm.code} created`)
      setNewForm(emptyProductForm())
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Item Created', message: newForm.code })
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || '' })
    }
  }

  const columns: Column<Item>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-medium" style={{ color: 'var(--accent)' }}>{r.code}</span> },
    { key: 'name', header: 'Name' },
    { key: 'pack_type', header: 'Pack', render: (r) => r.pack_type || 'loose' },
    { key: 'carton_qty', header: 'Pack qty', render: (r) => String(Number(r.carton_qty || 0) || '—') },
    { key: 'control_mode', header: 'Control', render: (r) => (r.control_mode === 'bin_controlled' ? 'bin' : 'item') },
    { key: 'mrp', header: 'MRP', render: (r) => Number(r.mrp || 0).toFixed(2) },
    { key: 'master_complete', header: 'Master', render: (r) => <StatusBadge status={r.master_complete ? 'active' : 'incomplete'} tone={r.master_complete ? 'green' : 'yellow'} /> },
  ]

  const pager = {
    pageItems: list,
    total,
    page,
    pageSize: PAGE_SIZE,
    setPage: goToPage,
    setQ: setSearch,
    q: search,
  }

  return (
    <ListPage<Item>
      title="Items"
      description="Item master with dealer product fields and stock by location"
      columns={columns}
      data={list}      search={{ placeholder: 'Search code or name…', onChange: (v: string) => setSearch(v) }}
      actions={[{ label: showNew ? '✕ Cancel' : '+ New Item', onClick: () => setShowNew(!showNew), variant: 'default' }]}
      emptyState={{ icon: '📦', title: 'No items', message: 'Create your first item' }}
      toolbar={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleSearch} className="erpnext-btn-secondary text-sm">Search</button>
          <CSVImport disabled={importing} onImport={() => {}} onImportFile={async (file) => {
            setImporting(true)
            const r = await api.itemImportFile(file)
            if (r.ok) {
              notify({ type: 'success', title: 'Items imported', message: `created ${r.data?.created ?? 0}` })
              loadList(1, '')
            }
            setImporting(false)
          }} />
          <a className="erpnext-btn-secondary text-sm" href={api.itemsExportUrl()} onClick={(e) => {
            e.preventDefault()
            const token = localStorage.getItem('gowms_token')
            fetch(api.itemsExportUrl(), { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.text()).then(text => {
              const blob = new Blob([text], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'items.csv'; a.click(); URL.revokeObjectURL(url)
            })
          }}>Export CSV</a>
        </div>
      }
    >
      {msg && <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)' }}>✓ {msg}</div>}
      {showNew && (
        <div className="erpnext-card" style={{ marginTop: 12 }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}><h2 className="text-lg font-semibold">Create Product Master</h2></div>
          <div className="p-6 space-y-4">
            <ProductMasterFields form={newForm} setForm={setNewForm} locations={locations} showCode />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createItem} className="erpnext-btn-primary">SUBMIT</button>
            </div>
          </div>
        </div>
      )}
      {selected && (
        <div className="erpnext-card" style={{ marginTop: 12 }}>
          <div className="px-6 py-4 border-b flex justify-between" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Stock — {selected.code}</h2>
            <button className="erpnext-btn-secondary text-sm" onClick={() => setSelected(null)}>✕ Close</button>
          </div>
          <div className="p-6">
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{selected.name} · {selected.brand || '—'} · {selected.velocity_tier || 'medium'}</div>
          </div>
        </div>
      )}
    </ListPage>
  )
}
