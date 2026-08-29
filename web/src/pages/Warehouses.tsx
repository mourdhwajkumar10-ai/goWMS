import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import { ListPage, type Column } from '../components/templates/ListPage'
import { StatusBadge } from '../components/common/StatusBadge'

interface Wh {
  id: number
  name: string
  code: string
  warehouse_type: string | null
  disabled: boolean
  location_count?: number
}

export default function Warehouses() {
  const [list, setList] = useState<Wh[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 20
  const [showNew, setShowNew] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  const loadList = (pageNum = page, q = search) => {
    const offset = (pageNum - 1) * PAGE_SIZE
    return api.warehouseList().then((r: any) => {
      if (r.ok) {
        setList(r.data ?? [])
        setTotal(r.total ?? (r.data?.length ?? 0))
      }
    })
  }
  useEffect(() => { loadList(page) }, [page])
  const handleSearch = async (v: string) => {
    setSearch(v)
    if (page !== 1) setPage(1)
    else await loadList(1, v)
  }
  const createWarehouse = async () => {
    if (!code.trim() || !name.trim()) {
      notify({ type: 'error', title: 'Create failed', message: 'Code and Name required' })
      return
    }
    const r: any = await api.warehouseCreate({ code: code.trim(), name: name.trim() })
    if (r.ok) {
      setCode(''); setName(''); setShowNew(false); loadList()
      notify({ type: 'success', title: 'Warehouse created', message: code })
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || '' })
    }
  }

  const columns: Column<Wh>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-medium" style={{ color: 'var(--accent)' }}>{r.code}</span> },
    { key: 'name', header: 'Name' },
    { key: 'warehouse_type', header: 'Type', render: (r) => r.warehouse_type || '—' },
    { key: 'location_count', header: 'Bins', render: (r) => String(r.location_count ?? '—') },
    { key: 'disabled', header: 'Status', render: (r) => <StatusBadge status={r.disabled ? 'disabled' : 'active'} tone={r.disabled ? 'yellow' : 'green'} /> },
  ]

  const pager = {
    pageItems: list,
    total,
    page,
    pageSize: PAGE_SIZE,
    setPage: (p: number) => setPage(p),
    setQ: handleSearch,
    q: search,
  }

  return (
    <ListPage<Wh>
      title="Warehouses"
      description="Manage warehouses and locations — select a warehouse to configure locations"
      columns={columns}
      data={list}
      pager={pager}
      search={{ placeholder: 'Search warehouses…', onChange: (v: string) => handleSearch(v) }}
      actions={[{ label: showNew ? '✕ Cancel' : '+ New Warehouse', onClick: () => setShowNew(!showNew), variant: 'default' }]}
      emptyState={{ icon: '🏭', title: 'No warehouses', message: 'Create your first warehouse' }}
    >
      {showNew && (
        <div className="erpnext-card" style={{ marginTop: 12 }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}><h2 className="text-lg font-semibold">Create Warehouse</h2></div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="erpnext-label">Code *</label><input className="erpnext-input" value={code} onChange={e => setCode(e.target.value)} placeholder="MAIN" /></div>
              <div><label className="erpnext-label">Name *</label><input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} placeholder="Main Store" /></div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createWarehouse} className="erpnext-btn-primary">Create Warehouse</button>
            </div>
          </div>
        </div>
      )}
    </ListPage>
  )
}
