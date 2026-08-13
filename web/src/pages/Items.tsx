import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import CSVImport from '../components/CSVTools'

interface Item {
  id: number
  code: string
  name: string
  has_serial: boolean
  has_batch: boolean
  has_expiry_date?: boolean
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
  shelf_life_in_days?: number | null
  mrp?: number
  hsn_no?: string
  gst_percentage?: number
  vech?: string
  make?: string
  uom?: string
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

interface LocOpt {
  id: number
  code: string
  warehouse_code: string
}

export default function Items() {
  const [list, setList] = useState<Item[]>([])
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Item | null>(null)
  const [inventory, setInventory] = useState<InvRow[]>([])
  const [locations, setLocations] = useState<LocOpt[]>([])
  const [msg, setMsg] = useState('')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [hasSerial, setHasSerial] = useState(false)
  const [hasBatch, setHasBatch] = useState(false)
  const [hasExpiry, setHasExpiry] = useState(false)
  const [packType, setPackType] = useState('loose')
  const [controlMode, setControlMode] = useState('item_controlled')
  const [homeLocationId, setHomeLocationId] = useState('')
  const [barcode, setBarcode] = useState('')
  const [cartonQty, setCartonQty] = useState('')
  const [shelfLife, setShelfLife] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [attachments, setAttachments] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  const loadList = () => api.itemList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => {
    loadList()
    api.get<LocOpt[]>('/masterdata/locations').then(r => {
      if (r.ok) setLocations((r.data ?? []).map((l: any) => ({
        id: l.id, code: l.code, warehouse_code: l.warehouse_code,
      })))
    })
  }, [])

  const handleSearch = async () => {
    if (!search.trim()) { loadList(); return }
    const r = await api.itemList(search)
    if (r.ok) setList(r.data ?? [])
  }

  const openItem = async (item: Item) => {
    setSelected(item)
    const r = await api.itemInventory(item.code)
    if (r.ok) setInventory(r.data ?? [])
  }

  const openEdit = async (item: Item) => {
    setEditForm({
      name: item.name || '',
      brand: item.brand || '',
      description: item.description || '',
      mrp: item.mrp ?? 0,
      hsn_no: item.hsn_no || '',
      gst_percentage: item.gst_percentage ?? 18,
      vech: item.vech || '',
      make: item.make || '',
      uom: item.uom || 'PCS',
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
      home_location_id: item.home_location_id || '',
      barcode: item.barcode || '',
      carton_qty: item.carton_qty ?? 0,
      has_serial: !!item.has_serial,
      has_batch: !!item.has_batch,
      has_expiry_date: !!item.has_expiry_date,
      shelf_life_in_days: item.shelf_life_in_days ?? '',
    })
    setShowEdit(true)
    const ar = await api.attachmentList('item', item.id)
    if (ar.ok) setAttachments(ar.data ?? [])
    else setAttachments([])
  }

  const saveEdit = async () => {
    if (!selected) return
    const r = await api.itemUpdate(selected.id, {
      ...editForm,
      home_location_id: editForm.home_location_id ? +editForm.home_location_id : null,
      shelf_life_in_days: editForm.shelf_life_in_days === '' ? null : +editForm.shelf_life_in_days,
      mrp: +editForm.mrp || 0,
      gst_percentage: +editForm.gst_percentage || 0,
      min_order_qty: +editForm.min_order_qty || 0,
      weight_per_unit: +editForm.weight_per_unit || 0,
      threshold_value: +editForm.threshold_value || 0,
      max_rate_discount: +editForm.max_rate_discount || 0,
      carton_qty: +editForm.carton_qty || 0,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Product updated', message: selected.code })
      setShowEdit(false)
      loadList()
      const refreshed = await api.itemList(selected.code)
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

  const resetForm = () => {
    setCode(''); setName(''); setBrand(''); setItemGroup('')
    setHasSerial(false); setHasBatch(false); setHasExpiry(false)
    setPackType('loose'); setControlMode('item_controlled'); setHomeLocationId('')
    setBarcode(''); setCartonQty(''); setShelfLife('')
  }

  const createItem = async () => {
    const r = await api.itemCreate({
      code, name, brand, item_group: itemGroup,
      has_serial: hasSerial, has_batch: hasBatch, has_expiry_date: hasExpiry,
      pack_type: packType, control_mode: controlMode,
      home_location_id: homeLocationId ? +homeLocationId : undefined,
      barcode, carton_qty: cartonQty ? +cartonQty : 0,
      shelf_life_in_days: shelfLife ? +shelfLife : undefined,
    })
    if (r.ok) {
      setMsg(`Item ${code} created`)
      resetForm()
      setShowNew(false)
      loadList()
      notify({
        type: 'success',
        title: 'Item Created',
        message: r.data.master_complete ? `${code} (master complete)` : `${code} (master incomplete)`,
      })
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || '' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Items</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Item master with pack/control modes and stock by location
          </p>
        </div>
        <div className="flex gap-2">
          <CSVImport onImport={async (rows) => {
            const r = await api.itemImport({ rows })
            if (r.ok) {
              notify({ type: 'success', title: 'Items imported', message: `created ${r.data?.created ?? 0}, skipped ${r.data?.skipped ?? 0}` })
              loadList()
            } else notify({ type: 'error', title: 'Import failed', message: r.error || '' })
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
            <h2 className="text-lg font-semibold">Create Item (complete master)</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="erpnext-label">Item Code *</label>
                <input className="erpnext-input" value={code} onChange={e => setCode(e.target.value)} placeholder="BJ-BRK-001" />
              </div>
              <div>
                <label className="erpnext-label">Item Name *</label>
                <input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} placeholder="Brake Pad Set" />
              </div>
              <div>
                <label className="erpnext-label">Brand</label>
                <input className="erpnext-input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Bajaj" />
              </div>
              <div>
                <label className="erpnext-label">Item Group</label>
                <input className="erpnext-input" value={itemGroup} onChange={e => setItemGroup(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Barcode</label>
                <input className="erpnext-input" value={barcode} onChange={e => setBarcode(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Pack type *</label>
                <select className="erpnext-input" value={packType} onChange={e => setPackType(e.target.value)}>
                  <option value="loose">Loose</option>
                  <option value="packed">Packed</option>
                </select>
              </div>
              <div>
                <label className="erpnext-label">Control mode *</label>
                <select className="erpnext-input" value={controlMode} onChange={e => setControlMode(e.target.value)}>
                  <option value="item_controlled">Item controlled</option>
                  <option value="bin_controlled">Bin controlled</option>
                </select>
              </div>
              {controlMode === 'bin_controlled' && (
                <div>
                  <label className="erpnext-label">Home location *</label>
                  <select className="erpnext-input" value={homeLocationId} onChange={e => setHomeLocationId(e.target.value)}>
                    <option value="">Select bin</option>
                    {locations.filter(l => true).map(l => (
                      <option key={l.id} value={l.id}>{l.warehouse_code} / {l.code}</option>
                    ))}
                  </select>
                </div>
              )}
              {packType === 'packed' && (
                <div>
                  <label className="erpnext-label">Carton qty</label>
                  <input className="erpnext-input" type="number" value={cartonQty} onChange={e => setCartonQty(e.target.value)} />
                </div>
              )}
              <div className="flex items-end gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasSerial} onChange={e => setHasSerial(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Serial</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasBatch} onChange={e => setHasBatch(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Batch</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Expiry</span>
                </label>
              </div>
              {hasExpiry && (
                <div>
                  <label className="erpnext-label">Shelf life (days) *</label>
                  <input className="erpnext-input" type="number" value={shelfLife} onChange={e => setShelfLife(e.target.value)} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createItem} className="erpnext-btn-primary">Create Item</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="erpnext-card">
          <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">All Items ({list.length})</h2>
            <div className="flex gap-3">
              <input className="erpnext-input text-sm" style={{ width: 180 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <button onClick={handleSearch} className="erpnext-btn-secondary text-sm">Search</button>
            </div>
          </div>
          <div className="p-4 overflow-auto" style={{ maxHeight: '70vh' }}>
            <table className="erpnext-table">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
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
                {list.length === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No items</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="erpnext-card">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">
              {selected ? `Stock locations — ${selected.code}` : 'Select an item'}
            </h2>
            {selected && (
              <button className="erpnext-btn-primary text-sm" onClick={() => openEdit(selected)}>Edit Product Master</button>
            )}
          </div>
          <div className="p-4 space-y-4">
            {selected && (
              <div className="text-sm grid grid-cols-2 gap-2" style={{ color: 'var(--text-dim)' }}>
                <div><strong style={{ color: 'var(--text)' }}>{selected.name}</strong></div>
                <div>{selected.brand || '—'}</div>
                <div>Pack: {selected.pack_type || 'loose'}</div>
                <div>Control: {selected.control_mode || 'item_controlled'}</div>
                <div>Serial: {selected.has_serial ? 'yes' : 'no'} · Batch: {selected.has_batch ? 'yes' : 'no'}</div>
                <div>Expiry: {selected.has_expiry_date ? 'yes' : 'no'}</div>
              </div>
            )}
            {selected && (
              <table className="erpnext-table">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Location</th>
                    <th>WH</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th className="text-right">Qty</th>
                    <th>Alloc</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(row => (
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
                  {inventory.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No stock at locations</td></tr>
                  )}
                </tbody>
              </table>
            )}
            {!selected && (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Click an item to see where it sits in the warehouse.</p>
            )}
          </div>
        </div>
      </div>

      {showEdit && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="erpnext-card w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-semibold">Edit Product Master</h2>
              <button className="erpnext-btn-secondary text-sm" onClick={() => setShowEdit(false)}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="erpnext-label">Id</label>
                  <input className="erpnext-input" value={selected.id} disabled />
                </div>
                <div>
                  <label className="erpnext-label">Product No *</label>
                  <input className="erpnext-input" value={selected.code} disabled />
                </div>
                <div>
                  <label className="erpnext-label">Description *</label>
                  <input className="erpnext-input" value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">Brand *</label>
                  <input className="erpnext-input" value={editForm.brand || ''} onChange={e => setEditForm({ ...editForm, brand: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">Mrp *</label>
                  <input className="erpnext-input" type="number" value={editForm.mrp ?? 0} onChange={e => setEditForm({ ...editForm, mrp: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">Product GROUP / Category *</label>
                  <input className="erpnext-input" value={editForm.category || ''} onChange={e => setEditForm({ ...editForm, category: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">VECH</label>
                  <input className="erpnext-input" value={editForm.vech || ''} onChange={e => setEditForm({ ...editForm, vech: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">MAKE</label>
                  <input className="erpnext-input" value={editForm.make || ''} onChange={e => setEditForm({ ...editForm, make: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">Uom *</label>
                  <input className="erpnext-input" value={editForm.uom || 'PCS'} onChange={e => setEditForm({ ...editForm, uom: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">MOQ</label>
                  <input className="erpnext-input" type="number" value={editForm.min_order_qty ?? 1} onChange={e => setEditForm({ ...editForm, min_order_qty: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">HSN_No *</label>
                  <input className="erpnext-input" value={editForm.hsn_no || ''} onChange={e => setEditForm({ ...editForm, hsn_no: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">GST_Percentage *</label>
                  <select className="erpnext-input" value={editForm.gst_percentage ?? 18} onChange={e => setEditForm({ ...editForm, gst_percentage: e.target.value })}>
                    {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="erpnext-label">Parts Movement</label>
                  <input className="erpnext-input" value={editForm.parts_movement || ''} onChange={e => setEditForm({ ...editForm, parts_movement: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">Parts pbo</label>
                  <input className="erpnext-input" value={editForm.parts_pbo || ''} onChange={e => setEditForm({ ...editForm, parts_pbo: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">Threshold Value</label>
                  <input className="erpnext-input" type="number" value={editForm.threshold_value ?? 0} onChange={e => setEditForm({ ...editForm, threshold_value: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">Max Rate Discount</label>
                  <input className="erpnext-input" type="number" value={editForm.max_rate_discount ?? 0} onChange={e => setEditForm({ ...editForm, max_rate_discount: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">Weight</label>
                  <input className="erpnext-input" type="number" value={editForm.weight_per_unit ?? 0} onChange={e => setEditForm({ ...editForm, weight_per_unit: e.target.value })} />
                </div>
                <div>
                  <label className="erpnext-label">Remark</label>
                  <input className="erpnext-input" value={editForm.remark || ''} onChange={e => setEditForm({ ...editForm, remark: e.target.value })} placeholder="Enter remark..." />
                </div>
                <div className="md:col-span-2">
                  <label className="erpnext-label">Long description</label>
                  <textarea className="erpnext-input" rows={2} value={editForm.description || ''} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                </div>
              </div>

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
