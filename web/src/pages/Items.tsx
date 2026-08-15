import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import CSVImport from '../components/CSVTools'
import ProductMasterFields, { emptyProductForm, productPayload, type LocOpt } from '../components/ProductMasterFields'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

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
}

interface InvRow {
  id: number
  location_code: string
  warehouse_code: string
  batch_no: string
  expiry_date: string | null
  days_until_expiry?: number | null
  fefo_warn?: boolean
  actual_qty: number
  reserved_qty: number
  available_qty: number
  allocation_status: string
  location_type: string
}

export default function Items() {
  const [list, setList] = useState<Item[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 50
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Item | null>(null)
  const [inventory, setInventory] = useState<InvRow[]>([])
  const invPager = useClientPager(inventory)
  const [locations, setLocations] = useState<LocOpt[]>([])
  const [msg, setMsg] = useState('')

  const [newForm, setNewForm] = useState(emptyProductForm())
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState(emptyProductForm())
  const [attachments, setAttachments] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
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
      if (r.ok) setLocations((r.data ?? []).map((l: any) => ({
        id: l.id, code: l.code, warehouse_code: l.warehouse_code,
      })))
    })
  }, [])

  useEffect(() => {
    loadList(page)
  }, [page])

  const goToPage = (next: number) => {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    setPage(Math.min(pages, Math.max(1, next)))
  }

  const handleSearch = async () => {
    if (page !== 1) setPage(1)
    else await loadList(1, search)
  }

  const openItem = async (item: Item) => {
    setSelected(item)
    const r = await api.itemInventory(item.code)
    if (r.ok) setInventory(r.data ?? [])
  }

  const openEdit = async (item: Item) => {
    setEditForm({
      ...emptyProductForm(),
      name: item.name || '',
      brand: item.brand || '',
      description: item.description || '',
      mrp: item.mrp ?? 0,
      hsn_no: item.hsn_no || '',
      gst_percentage: item.gst_percentage ?? 18,
      vech: item.vech || '',
      make: item.make || '',
      uom: item.uom || 'PCS',
      product_group: item.product_group || '',
      category: item.category || '',
      parts_movement: item.parts_movement || '',
      parts_pbo: item.parts_pbo || '',
      threshold_value: item.threshold_value ?? 0,
      max_rate_discount: item.max_rate_discount ?? 0,
      remark: item.remark || '',
      min_order_qty: item.min_order_qty ?? 1,
      weight_per_unit: item.weight_per_unit ?? 0,
      pack_type: item.pack_type || 'loose',
      control_mode: item.control_mode || 'item_controlled',
      home_location_id: item.home_location_id ? String(item.home_location_id) : '',
      barcode: item.barcode || '',
      carton_qty: item.carton_qty != null ? String(item.carton_qty) : '',
      max_qty_per_bin: item.max_qty_per_bin != null && item.max_qty_per_bin > 0 ? String(item.max_qty_per_bin) : '',
      has_serial: !!item.has_serial,
      has_batch: !!item.has_batch,
      has_expiry_date: !!item.has_expiry_date,
      shelf_life_in_days: item.shelf_life_in_days != null ? String(item.shelf_life_in_days) : '',
      requires_qi: !!item.requires_qi,
    })
    setShowEdit(true)
    const ar = await api.attachmentList('item', item.id)
    if (ar.ok) setAttachments(ar.data ?? [])
    else setAttachments([])
  }

  const saveEdit = async () => {
    if (!selected) return
    const r = await api.itemUpdate(selected.id, productPayload(editForm, {
      home_location_id: editForm.home_location_id ? +editForm.home_location_id : null,
      shelf_life_in_days: editForm.shelf_life_in_days === '' ? null : +editForm.shelf_life_in_days,
    }))
    if (r.ok) {
      notify({ type: 'success', title: 'Product updated', message: selected.code })
      setShowEdit(false)
      loadList()
      const refreshed = await api.itemList(selected.code, { limit: 20, offset: 0 })
      if (refreshed.ok) {
        const found = (refreshed.data ?? []).find((x: Item) => x.id === selected.id)
        if (found) openItem(found)
      }
    } else {
      notify({ type: 'error', title: 'Update failed', message: r.error || '' })
    }
  }

  const uploadFile = async (file: File | null) => {
    if (!file || !selected) return
    setUploading(true)
    const r = await api.attachmentUpload('item', selected.id, file)
    setUploading(false)
    if (r.ok) {
      notify({ type: 'success', title: 'File uploaded', message: file.name })
      const ar = await api.attachmentList('item', selected.id)
      if (ar.ok) setAttachments(ar.data ?? [])
    } else {
      notify({ type: 'error', title: 'Upload failed', message: r.error || '' })
    }
  }

  const resetForm = () => setNewForm(emptyProductForm())

  const createItem = async () => {
    if (!newForm.code.trim() || !newForm.name.trim()) {
      notify({ type: 'error', title: 'Create failed', message: 'Product No and Description are required' })
      return
    }
    const r = await api.itemCreate(productPayload(newForm, { code: newForm.code.trim() }))
    if (r.ok) {
      setMsg(`Item ${newForm.code} created`)
      resetForm()
      setShowNew(false)
      loadList()
      notify({
        type: 'success',
        title: 'Item Created',
        message: r.data.master_complete ? `${newForm.code} (master complete)` : `${newForm.code} (master incomplete)`,
      })
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || '' })
    }
  }

  const closeItem = () => {
    setSelected(null)
    setInventory([])
    setShowEdit(false)
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="items-page">
      <div className="items-toolbar">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Items</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Item master with dealer product fields and stock by location
          </p>
        </div>
        <div className="items-toolbar-actions">
          <input
            className="erpnext-input text-sm items-search"
            placeholder="Search code or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} className="erpnext-btn-secondary text-sm">Search</button>
          <CSVImport disabled={importing} onImport={() => {}} onImportFile={async (file) => {
            setImporting(true)
            notify({ type: 'info', title: 'Importing items', message: `Uploading ${file.name}… this can take a minute for large price lists.`, duration: 4000 })
            try {
              const r = await api.itemImportFile(file)
              if (!r.ok) {
                notify({ type: 'error', title: 'Import failed', message: r.error || 'import failed' })
                return
              }
              const created = r.data?.created ?? 0
              const skipped = r.data?.skipped ?? 0
              const totalRows = r.data?.total ?? 0
              const errs = (r.data?.errors as string[] | undefined) || []
              notify({
                type: created > 0 ? 'success' : 'warning',
                title: created > 0 ? 'Items imported' : 'Nothing imported',
                message: `created ${created}, skipped ${skipped} of ${totalRows}${errs.length ? `. ${errs[0]}` : ''}`,
              })
              setSearch('')
              setPage(1)
              await loadList(1, '')
            } finally {
              setImporting(false)
            }
          }} />
          <a
            className="erpnext-btn-secondary text-sm"
            href={api.itemsExportUrl()}
            onClick={(e) => {
              e.preventDefault()
              const token = localStorage.getItem('gowms_token')
              fetch(api.itemsExportUrl(), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                .then(r => r.text())
                .then(text => {
                  const blob = new Blob([text], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'items.csv'; a.click()
                  URL.revokeObjectURL(url)
                })
            }}
          >Export CSV</a>
          <button onClick={() => setShowNew(!showNew)} className="erpnext-btn-primary">
            {showNew ? '✕ Cancel' : '+ New Item'}
          </button>
        </div>
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
            <h2 className="text-lg font-semibold">Create Product Master</h2>
          </div>
          <div className="p-6 space-y-4">
            <ProductMasterFields form={newForm} setForm={setNewForm} locations={locations} showCode />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createItem} className="erpnext-btn-primary">SUBMIT</button>
            </div>
          </div>
        </div>
      )}

      <div className="erpnext-card items-list-card">
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold" style={{ marginBottom: 0 }}>Items ({total})</h2>
        </div>
        <div className="items-table-scroll">
          <table className="erpnext-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Pack</th>
                <th>Control</th>
                <th>Master</th>
              </tr>
            </thead>
            <tbody>
              {list.map(i => (
                <tr key={i.id} onClick={() => openItem(i)} style={{ cursor: 'pointer', background: selected?.id === i.id ? 'var(--panel-2)' : undefined }}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{i.code}</td>
                  <td>{i.name}</td>
                  <td>{i.pack_type || 'loose'}</td>
                  <td>{i.control_mode === 'bin_controlled' ? 'bin' : 'item'}</td>
                  <td>
                    <span className={`erpnext-badge ${i.master_complete ? 'erpnext-badge-green' : 'erpnext-badge-yellow'}`}>
                      {i.master_complete ? 'ok' : 'incomplete'}
                    </span>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No items</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="items-pager">
          <span>{total === 0 ? '0' : `${from}–${to}`} of {total} · 50 / page</span>
          <div className="flex gap-2 items-center">
            <button className="erpnext-btn-secondary text-sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>Prev</button>
            <span>Page {page} / {pageCount}</span>
            <button className="erpnext-btn-secondary text-sm" disabled={page >= pageCount || total === 0} onClick={() => goToPage(page + 1)}>Next</button>
          </div>
        </div>
      </div>

      {selected && !showEdit && (
        <div className="modal-overlay" onClick={closeItem}>
          <div className="modal items-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-semibold" style={{ marginBottom: 0 }}>Stock locations — {selected.code}</h2>
              <div className="flex gap-2">
                <button className="erpnext-btn-primary text-sm" onClick={() => openEdit(selected)}>Edit Product Master</button>
                <button className="erpnext-btn-secondary text-sm" onClick={closeItem}>✕</button>
              </div>
            </div>
            <div className="p-6" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="items-meta">
                <div><strong style={{ color: 'var(--text)' }}>{selected.name}</strong></div>
                <div>Brand: {selected.brand || '—'}</div>
                <div>Product GROUP: {selected.product_group || '—'}</div>
                <div>Category: {selected.category || '—'}</div>
                <div>VECH: {selected.vech || '—'}</div>
                <div>MAKE: {selected.make || '—'}</div>
                <div>MRP: {selected.mrp ?? 0}</div>
                <div>UOM: {selected.uom || 'PCS'}</div>
                <div>MOQ: {selected.min_order_qty ?? 0}</div>
                <div>HSN: {selected.hsn_no || '—'}</div>
                <div>GST: {selected.gst_percentage ?? 0}%</div>
                <div>Weight: {selected.weight_per_unit ?? 0}</div>
                <div>Threshold: {selected.threshold_value ?? 0}</div>
                <div>Parts movement: {selected.parts_movement || '—'}</div>
                <div>Pack: {selected.pack_type || 'loose'}</div>
                <div>Control: {selected.control_mode || 'item_controlled'}</div>
                <div>Max qty per bin: {selected.max_qty_per_bin != null && selected.max_qty_per_bin > 0 ? selected.max_qty_per_bin : 'not set'}</div>
                <div>Serial: {selected.has_serial ? 'yes' : 'no'} · Batch: {selected.has_batch ? 'yes' : 'no'}</div>
              </div>
              <ListPager pager={invPager} placeholder="Search stock locations…" />
              <table className="erpnext-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>WH</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th className="text-right">Qty</th>
                    <th>Alloc</th>
                  </tr>
                </thead>
                <tbody>
                  {invPager.pageItems.map(row => (
                    <tr key={row.id}>
                      <td className="font-medium" style={{ color: 'var(--accent)' }}>{row.location_code}</td>
                      <td>{row.warehouse_code}</td>
                      <td>{row.batch_no || '—'}</td>
                      <td>
                        {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString() : '—'}
                        {row.fefo_warn && (
                          <span className="erpnext-badge erpnext-badge-yellow ml-1">
                            {row.days_until_expiry != null ? `${row.days_until_expiry}d` : 'FEFO'}
                          </span>
                        )}
                      </td>
                      <td className="text-right">{row.actual_qty}</td>
                      <td>
                        <span className={`erpnext-badge ${
                          row.allocation_status === 'available' || row.allocation_status === 'allocatable' ? 'erpnext-badge-green'
                            : row.allocation_status === 'unallocatable' ? 'erpnext-badge-yellow'
                              : row.allocation_status === 'partial' ? 'erpnext-badge-yellow'
                                : 'erpnext-badge-red'
                        }`}>{row.allocation_status}</span>
                      </td>
                    </tr>
                  ))}
                  {invPager.total === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No stock at locations</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showEdit && selected && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal items-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-semibold" style={{ marginBottom: 0 }}>Edit Product Master</h2>
              <button className="erpnext-btn-secondary text-sm" onClick={() => setShowEdit(false)}>✕</button>
            </div>
            <div className="p-6" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="erpnext-label">Id</label>
                  <input className="erpnext-input" value={selected.id} disabled />
                </div>
                <div>
                  <label className="erpnext-label">Product No *</label>
                  <input className="erpnext-input" value={selected.code} disabled />
                </div>
              </div>
              <ProductMasterFields form={editForm} setForm={setEditForm} locations={locations} />

              <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-2">Files / attachments</h3>
                <input
                  type="file"
                  disabled={uploading}
                  onChange={e => uploadFile(e.target.files?.[0] || null)}
                />
                <ul className="mt-2 space-y-1 text-sm">
                  {attachments.map(a => (
                    <li key={a.id}>
                      <a href={api.attachmentUrl(a.id)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                        {a.filename}
                      </a>
                      <span style={{ color: 'var(--text-dim)' }}> · {(a.size_bytes / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                  {attachments.length === 0 && <li style={{ color: 'var(--text-dim)' }}>No files yet</li>}
                </ul>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button className="erpnext-btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
                <button className="erpnext-btn-primary" onClick={saveEdit}>SUBMIT</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

