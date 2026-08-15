import { useState, useEffect } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import CSVImport from '../components/CSVTools'
import { notify } from '../components/Notifications'
import ItemAutocomplete, { withTrailingEmptyRow, stripTrailingEmptyRows } from '../components/ItemAutocomplete'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

interface POItem {
  item_code: string
  item_name: string
  description: string
  brand: string
  item_group: string
  qty: number
  rate: number
  amount: number
  discount_percentage: number
  discount_amount: number
  uom: string
  warehouse: string
  cost_center: string
  project: string
  schedule_date: string
  serial_no: string
  batch_no: string
}

const emptyPOItem = (): POItem => ({
  item_code: '', item_name: '', description: '', brand: '', item_group: '',
  qty: 1, rate: 0, amount: 0, discount_percentage: 0, discount_amount: 0,
  uom: 'Nos', warehouse: '', cost_center: '', project: '', schedule_date: '',
  serial_no: '', batch_no: '',
})

const poItemFilled = (i: POItem) => !!i.item_code.trim()

const UOM_OPTIONS = ['Nos', 'PCS', 'Kg', 'Box', 'Pair', 'Litre', 'Meter']

function parsePackedItemQR(raw: string) {
  const value = (raw || '').trim().replace(/[\s\n\r\t]/g, '')
  const separator = value.lastIndexOf('_')
  if (separator <= 0 || separator >= value.length - 1) return null

  const left = value.slice(0, separator)
  const itemSeparator = left.lastIndexOf('-')
  if (itemSeparator <= 0 || itemSeparator >= left.length - 1) return null

  const itemCode = left.slice(0, itemSeparator)
  const qty = Number(left.slice(itemSeparator + 1))
  const rate = Number(value.slice(separator + 1).replace(/,/g, ''))
  if (!itemCode || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) return null

  return { itemCode, qty, rate }
}


export default function PurchaseOrders() {
  const [pos, setPOs] = useState<any[]>([])
  const [selectedPO, setSelectedPO] = useState<any>(null)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanRowIdx, setScanRowIdx] = useState<number | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const [supplier, setSupplier] = useState('')
  const [company, setCompany] = useState('Nirvana')
  const [currency, setCurrency] = useState('INR')
  const [txnDate, setTxnDate] = useState(new Date().toISOString().slice(0, 10))
  const [schDate, setSchDate] = useState('')
  const [setWarehouse, setSetWarehouse] = useState('')
  const [costCenter, setCostCenter] = useState('')
  const [project, setProject] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [taxesCharges, setTaxesCharges] = useState('')
  const [terms, setTerms] = useState('')
  const [buyingPriceList, setBuyingPriceList] = useState('')
  const [taxCategory, setTaxCategory] = useState('')
  const [supplierAddr, setSupplierAddr] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [shippingAddr, setShippingAddr] = useState('')
  const [billingAddr, setBillingAddr] = useState('')
  const [discountPct, setDiscountPct] = useState(0)

  const [items, setItems] = useState<POItem[]>([emptyPOItem()])

  const loadPOs = () => api.poList().then(r => { if (r.ok) setPOs(r.data ?? []) })
  useEffect(() => { loadPOs() }, [])
  const pager = useClientPager(pos)

  const addItem = () => {
    setItems(withTrailingEmptyRow(
      [...items, emptyPOItem()],
      poItemFilled,
      () => ({ ...emptyPOItem(), warehouse: setWarehouse || '', cost_center: costCenter, project, schedule_date: schDate }),
    ))
  }

  const populateItem = (idx: number, item: any) => {
    const updated = [...items]
    updated[idx] = {
      ...updated[idx],
      item_code: item.code || '',
      item_name: item.name || '',
      description: item.description || '',
      brand: item.brand || '',
      item_group: item.abc_tier || '',
      rate: +item.standard_rate || +item.mrp || 0,
      uom: UOM_OPTIONS.includes(item.uom) ? item.uom : 'Nos',
    }
    updated[idx].amount = updated[idx].qty * updated[idx].rate
    setItems(withTrailingEmptyRow(updated, poItemFilled, () => ({
      ...emptyPOItem(), warehouse: setWarehouse || '', cost_center: costCenter, project, schedule_date: schDate,
    })))
  }

  const updateItem = (idx: number, field: keyof POItem, value: any) => {
    const updated = [...items]
    ;(updated[idx] as any)[field] = value
    if (field === 'qty' || field === 'rate' || field === 'discount_percentage') {
      const qty = field === 'qty' ? +value : updated[idx].qty
      const rate = field === 'rate' ? +value : updated[idx].rate
      const disc = field === 'discount_percentage' ? +value : updated[idx].discount_percentage
      updated[idx].amount = qty * rate
      updated[idx].discount_amount = (qty * rate * disc) / 100
    }
    setItems(withTrailingEmptyRow(updated, poItemFilled, () => ({
      ...emptyPOItem(), warehouse: setWarehouse || '', cost_center: costCenter, project, schedule_date: schDate,
    })))
  }

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx)
    setItems(next.length ? next : [emptyPOItem()])
  }

  const handleBarcodeScan = (code: string) => {
    setShowScanner(false)
    if (scanRowIdx !== null) {
      const idx = scanRowIdx
      setScanRowIdx(null)
      ;(async () => {
        const packed = parsePackedItemQR(code)
        const lookupCode = packed?.itemCode || code.trim()
        const r = packed
          ? await api.itemSuggest(lookupCode, 12)
          : await api.itemList(lookupCode)
        if (r.ok && r.data?.length) {
          const found = r.data.find((i: any) => String(i.code).toUpperCase() === lookupCode.toUpperCase()) || r.data[0]
          populateItem(idx, found)
          if (packed) {
            const updated = [...items]
            updated[idx] = {
              ...updated[idx],
              item_code: found.code || packed.itemCode,
              item_name: found.name || '',
              qty: packed.qty,
              rate: packed.rate,
              amount: packed.qty * packed.rate,
            }
            setItems(withTrailingEmptyRow(updated, poItemFilled, () => ({
              ...emptyPOItem(), warehouse: setWarehouse || '', cost_center: costCenter, project, schedule_date: schDate,
            })))
            notify({
              type: 'success',
              title: 'QR item found',
              message: `${found.code} · qty ${packed.qty} · rate ₹${packed.rate.toFixed(2)}`,
            })
          } else {
            notify({ type: 'success', title: 'Item found', message: `${found.code} - ${found.name}` })
          }
        } else {
          const updated = [...items]
          updated[idx] = {
            ...updated[idx],
            item_code: packed?.itemCode || code,
            ...(packed ? { qty: packed.qty, rate: packed.rate, amount: packed.qty * packed.rate } : {}),
          }
          setItems(withTrailingEmptyRow(updated, poItemFilled, () => ({
            ...emptyPOItem(), warehouse: setWarehouse || '', cost_center: costCenter, project, schedule_date: schDate,
          })))
          notify({
            type: 'warning',
            title: packed ? 'Item code not found' : 'Item not found',
            message: packed
              ? `${packed.itemCode} · qty ${packed.qty} · rate ₹${packed.rate.toFixed(2)}`
              : code,
          })
        }
      })()
    } else {
      setSearch(code)
      handleSearch()
    }
  }

  const createPO = async () => {
    if (!supplier) { setMsg('Supplier required'); return }
    const validItems = stripTrailingEmptyRows(items, poItemFilled).filter(i => i.item_code).map(i => ({
      ...i, amount: i.qty * i.rate,
      net_rate: i.rate * (1 - i.discount_percentage / 100),
      net_amount: i.qty * i.rate * (1 - i.discount_percentage / 100),
      stock_uom: i.uom, conversion_factor: 1, stock_qty: i.qty,
      base_rate: i.rate, base_amount: i.qty * i.rate,
    }))
    const r = await api.poCreate({
      supplier_name: supplier, company, currency, transaction_date: txnDate,
      schedule_date: schDate, set_warehouse: setWarehouse, cost_center: costCenter,
      project, payment_terms_template: paymentTerms, taxes_and_charges: taxesCharges,
      terms, buying_price_list: buyingPriceList, tax_category: taxCategory,
      supplier_address: supplierAddr, contact_person: contactPerson,
      shipping_address: shippingAddr, billing_address: billingAddr,
      additional_discount_percentage: discountPct, items: validItems
    })
    if (r.ok) {
      setMsg(`PO created: ${r.data.name}`)
      setShowNew(false)
      resetForm()
      loadPOs()
      notify({ type: 'success', title: 'PO Created', message: r.data.name })
    }
  }

  const resetForm = () => {
    setSupplier(''); setCompany('Nirvana'); setCurrency('INR'); setTxnDate(new Date().toISOString().slice(0, 10))
    setSchDate(''); setSetWarehouse(''); setCostCenter(''); setProject(''); setPaymentTerms('')
    setTaxesCharges(''); setTerms(''); setBuyingPriceList(''); setTaxCategory('')
    setSupplierAddr(''); setContactPerson(''); setShippingAddr(''); setBillingAddr('')
    setDiscountPct(0); setItems([emptyPOItem()]); setShowDetails(false)
  }

  const openPO = async (id: number) => {
    const r = await api.poGet(id)
    if (r.ok) setSelectedPO(r.data)
  }

  const submitPO = async (id: number) => {
    const r = await api.poSubmit(id)
    if (r.ok) { setMsg('PO submitted'); loadPOs(); openPO(id) }
  }

  const deletePO = async (id: number) => {
    if (!confirm('Delete this PO?')) return
    const r = await api.poDelete(id)
    if (r.ok) { setMsg('PO deleted'); loadPOs(); setSelectedPO(null) }
  }

  const handleSearch = async () => {
    if (!search.trim()) { loadPOs(); return }
    const r = await api.poSearch(search)
    if (r.ok) setPOs(r.data ?? [])
  }

  const handleCSVImport = (rows: any[]) => {
    const imported: POItem[] = rows
      .filter(r => r.item_code || r.ItemCode)
      .map(r => ({
        item_code: r.item_code || r.ItemCode || r['Item Code'] || '',
        item_name: r.item_name || r.ItemName || r['Item Name'] || '',
        description: r.description || r.Description || '',
        brand: r.brand || r.Brand || '',
        item_group: r.item_group || r.ItemGroup || r['Item Group'] || '',
        qty: Number(r.qty || r.Qty || r.Quantity || 1),
        rate: Number(r.rate || r.Rate || r.Price || 0),
        amount: 0, discount_percentage: 0, discount_amount: 0,
        uom: r.uom || r.UOM || 'Nos',
        warehouse: r.warehouse || r.Warehouse || 'Stores - GW',
        cost_center: r.cost_center || r.CostCenter || costCenter,
        project: r.project || r.Project || project,
        schedule_date: r.schedule_date || r.ScheduleDate || schDate,
        serial_no: r.serial_no || r.SerialNo || '',
        batch_no: r.batch_no || r.BatchNo || '',
      }))
    setItems([...items, ...imported])
    notify({ type: 'info', title: 'CSV Imported', message: `${imported.length} items added` })
  }

  const downloadTemplate = () => {
    const csv = 'item_code,item_name,qty,rate,uom,warehouse\n"BRAKE-PAD-001","Brake Pad Set",50,450,Nos,"Stores - GW"\n"FILTER-OIL-002","Oil Filter",100,120,Nos,"Stores - GW"'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'po_import_template.csv'
    a.click()
  }

  const total = items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = items.reduce((s, i) => s + i.discount_amount, 0)

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleBarcodeScan} onClose={() => { setShowScanner(false); setScanRowIdx(null) }} />}

      <div className="page-head">
        <div>
          <h1 className="page-title">Purchase Order</h1>
          <p className="page-sub">Create and manage inbound purchase orders</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => { setShowScanner(true); setScanRowIdx(null) }} className="erpnext-btn-secondary">
            Scan PO
          </button>
          {!showNew && (
            <button type="button" onClick={() => { setShowNew(true); setSelectedPO(null) }} className="erpnext-btn-primary">
              + New
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="error-banner" style={msg.includes('required') ? undefined : {
          background: 'var(--dark-green-50)', borderColor: 'var(--green-100)', color: 'var(--dark-green-700)'
        }}>
          {msg}
        </div>
      )}

      {showNew && (
        <div className="erpnext-card">
          <div className="card-header">
            <h2 style={{ margin: 0 }}>New Purchase Order</h2>
            <button type="button" onClick={() => { setShowNew(false); resetForm() }} className="erpnext-btn-secondary">
              Cancel
            </button>
          </div>
          <div className="card-body space-y-6">
            <div className="form-section">
              <div className="form-section-title">Essential Details</div>
              <div className="form-grid">
                <div className="form-control">
                  <label className="erpnext-label">Supplier Name *</label>
                  <input className="erpnext-input" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Enter supplier name" />
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Company</label>
                  <input className="erpnext-input" value={company} onChange={e => setCompany(e.target.value)} />
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Currency</label>
                  <select className="erpnext-input" value={currency} onChange={e => setCurrency(e.target.value)}>
                    <option value="INR">INR - Indian Rupee</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Transaction Date</label>
                  <input className="erpnext-input" type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} />
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Schedule Date</label>
                  <input className="erpnext-input" type="date" value={schDate} onChange={e => setSchDate(e.target.value)} />
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Set Warehouse</label>
                  <input className="erpnext-input" value={setWarehouse} onChange={e => setSetWarehouse(e.target.value)} placeholder="Default warehouse" />
                </div>
              </div>
            </div>

            <div>
              <button type="button" onClick={() => setShowDetails(!showDetails)} className="link-btn">
                <span style={{ transform: showDetails ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
                {showDetails ? 'Hide' : 'Show'} Additional Details
              </button>
            </div>

            {showDetails && (
              <div className="form-section" style={{ background: 'var(--gray-50)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-lg)', padding: 16 }}>
                <div className="form-section-title">Additional Details</div>
                <div className="form-grid">
                  <div className="form-control">
                    <label className="erpnext-label">Cost Center</label>
                    <input className="erpnext-input" value={costCenter} onChange={e => setCostCenter(e.target.value)} placeholder="CC-001" />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">Project</label>
                    <input className="erpnext-input" value={project} onChange={e => setProject(e.target.value)} placeholder="Project code" />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">Payment Terms</label>
                    <input className="erpnext-input" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="Net 30" />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">Taxes & Charges</label>
                    <input className="erpnext-input" value={taxesCharges} onChange={e => setTaxesCharges(e.target.value)} placeholder="GST 18%" />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">Buying Price List</label>
                    <input className="erpnext-input" value={buyingPriceList} onChange={e => setBuyingPriceList(e.target.value)} />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">Tax Category</label>
                    <input className="erpnext-input" value={taxCategory} onChange={e => setTaxCategory(e.target.value)} />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">Supplier Address</label>
                    <input className="erpnext-input" value={supplierAddr} onChange={e => setSupplierAddr(e.target.value)} />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">Contact Person</label>
                    <input className="erpnext-input" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">Shipping Address</label>
                    <input className="erpnext-input" value={shippingAddr} onChange={e => setShippingAddr(e.target.value)} />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">Billing Address</label>
                    <input className="erpnext-input" value={billingAddr} onChange={e => setBillingAddr(e.target.value)} />
                  </div>
                  <div className="form-control">
                    <label className="erpnext-label">PO Discount %</label>
                    <input className="erpnext-input" type="number" value={discountPct} onChange={e => setDiscountPct(+e.target.value)} />
                  </div>
                  <div className="form-control span-3">
                    <label className="erpnext-label">Terms & Conditions</label>
                    <textarea className="erpnext-input" rows={3} value={terms} onChange={e => setTerms(e.target.value)} placeholder="Payment and delivery terms..." />
                  </div>
                </div>
              </div>
            )}

            <div className="form-section">
              <div className="flex items-center justify-between mb-4">
                <div className="form-section-title" style={{ marginBottom: 0 }}>Item Lines</div>
                <div className="page-actions">
                  <CSVImport onImport={handleCSVImport} />
                  <button type="button" onClick={downloadTemplate} className="link-btn">Download template</button>
                  <button type="button" onClick={addItem} className="erpnext-btn-secondary">+ Add Item</button>
                </div>
              </div>

              <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
                Type to search items — a new row appears automatically when you fill the last one.
              </p>
              <div className="po-items-wrap rounded-lg" style={{ border: '1px solid var(--border-color)' }}>
                  <table className="erpnext-table po-items-table text-sm w-full">
                    <thead>
                      <tr style={{ background: 'var(--gray-50)' }}>
                        <th className="w-10">#</th>
                        <th className="w-10"></th>
                        <th style={{ minWidth: 150 }}>Item Code *</th>
                        <th style={{ minWidth: 150 }}>Item Name</th>
                        <th className="w-20">Qty *</th>
                        <th className="w-24">Rate</th>
                        <th className="w-28">Batch</th>
                        <th className="w-24">UOM</th>
                        <th className="w-20">Disc %</th>
                        <th className="w-24 text-right">Amount</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td data-label="#" className="text-center" style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td data-label="Scan" className="text-center">
                            <button
                              type="button"
                              onClick={() => { setScanRowIdx(idx); setShowScanner(true) }}
                              className="link-btn"
                              title="Scan barcode"
                            >Scan</button>
                          </td>
                          <td data-label="Item code">
                            <ItemAutocomplete
                              value={item.item_code}
                              onSelect={(found) => populateItem(idx, found)}
                              onChangeText={(text) => updateItem(idx, 'item_code', text)}
                              placeholder="Scan or type..."
                            />
                          </td>
                          <td data-label="Item name">
                            <ItemAutocomplete
                              display="name"
                              value={item.item_name}
                              onSelect={(found) => populateItem(idx, found)}
                              onChangeText={(text) => updateItem(idx, 'item_name', text)}
                              placeholder="Search item name..."
                            />
                          </td>
                          <td data-label="Qty">
                            <input className="erpnext-input text-sm w-full" type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', +e.target.value)} />
                          </td>
                          <td data-label="Rate">
                            <input className="erpnext-input text-sm w-full" type="number" value={item.rate} onChange={e => updateItem(idx, 'rate', +e.target.value)} />
                          </td>
                          <td data-label="Batch">
                            <input className="erpnext-input text-sm w-full" value={item.batch_no} onChange={e => updateItem(idx, 'batch_no', e.target.value)} placeholder="LOT-001" />
                          </td>
                          <td data-label="UOM">
                            <select className="erpnext-input text-sm w-full" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)}>
                              {UOM_OPTIONS.map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td data-label="Disc %">
                            <input className="erpnext-input text-sm w-full" type="number" value={item.discount_percentage} onChange={e => updateItem(idx, 'discount_percentage', +e.target.value)} />
                          </td>
                          <td data-label="Amount" className="text-right font-medium">
                            {(item.qty * item.rate).toFixed(2)}
                          </td>
                          <td data-label="" className="text-center">
                            <button type="button" onClick={() => removeItem(idx)} className="link-btn" style={{ color: 'var(--red)' }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </div>

            {items.some(poItemFilled) && (
              <div className="flex justify-end">
                <div className="text-right space-y-1 p-4 rounded-lg" style={{ background: 'var(--gray-50)', minWidth: 200 }}>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Subtotal: ₹{total.toFixed(2)}</div>
                  {totalDiscount > 0 && <div className="text-sm" style={{ color: 'var(--red)' }}>Discount: -₹{totalDiscount.toFixed(2)}</div>}
                  <div className="text-lg font-semibold pt-1 border-t" style={{ borderColor: 'var(--border-color)' }}>
                    Grand Total: ₹{(total - totalDiscount).toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button type="button" onClick={() => { setShowNew(false); resetForm() }} className="erpnext-btn-secondary">Cancel</button>
              <button type="button" onClick={createPO} className="erpnext-btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* PO List */}
      {!selectedPO && !showNew && (
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">All Purchase Orders</h2>
            <ListPager pager={pager} placeholder="Search POs…" />
          </div>
          <div className="p-4">
            <table className="erpnext-table">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>PO No</th>
                  <th>Supplier</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Received</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map((po: any) => (
                  <tr key={po.id} className="hover:opacity-90">
                    <td 
                      className="font-medium cursor-pointer hover:underline" 
                      style={{ color: 'var(--accent)' }} 
                      onClick={() => openPO(po.id)}
                    >
                      {po.name}
                    </td>
                    <td>{po.supplier_name}</td>
                    <td>{po.company || '-'}</td>
                    <td>
                      <span className={`erpnext-badge ${po.status === 'draft' ? 'erpnext-badge-yellow' : po.status === 'submitted' ? 'erpnext-badge-blue' : po.status === 'received' ? 'erpnext-badge-green' : 'erpnext-badge-red'}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="text-right">{po.total_qty}</td>
                    <td className="text-right font-medium">{po.grand_total?.toFixed(2) || '0.00'}</td>
                    <td className="text-right">{po.total_received}</td>
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => openPO(po.id)} className="erpnext-btn-secondary text-xs">Open</button>
                        {po.status === 'draft' && (
                          <button onClick={() => submitPO(po.id)} className="erpnext-btn-primary text-xs">Submit</button>
                        )}
                        <button onClick={() => deletePO(po.id)} className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(220,38,38,0.06)', color: 'var(--red)' }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pager.total === 0 && (
                  <tr><td colSpan={8} className="text-center py-12" style={{ color: 'var(--text-dim)' }}>No purchase orders found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PO Detail View */}
      {selectedPO && (
        <div className="erpnext-card">
          <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h2 className="text-lg font-semibold">{selectedPO.name}</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{selectedPO.supplier_name}</p>
            </div>
            <div className="flex gap-3">
              {selectedPO.status === 'draft' && (
                <button onClick={() => submitPO(selectedPO.id)} className="erpnext-btn-primary">Submit PO</button>
              )}
              <button onClick={() => setSelectedPO(null)} className="erpnext-btn-secondary">← Back to List</button>
            </div>
          </div>
          <div className="p-6">
            {/* PO Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg mb-6" style={{ background: 'var(--panel-2)' }}>
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Company</span>
                <p className="font-medium">{selectedPO.company || '-'}</p>
              </div>
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Currency</span>
                <p className="font-medium">{selectedPO.currency || '-'}</p>
              </div>
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Date</span>
                <p className="font-medium">{selectedPO.transaction_date || '-'}</p>
              </div>
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Schedule</span>
                <p className="font-medium">{selectedPO.schedule_date || '-'}</p>
              </div>
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Cost Center</span>
                <p className="font-medium">{selectedPO.cost_center || '-'}</p>
              </div>
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Payment Terms</span>
                <p className="font-medium">{selectedPO.payment_terms_template || '-'}</p>
              </div>
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Taxes</span>
                <p className="font-medium">{selectedPO.taxes_and_charges || '-'}</p>
              </div>
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Grand Total</span>
                <p className="text-lg font-bold">{selectedPO.currency} {selectedPO.grand_total?.toFixed(2) || '0.00'}</p>
              </div>
            </div>

            {/* Items Table */}
            <h3 className="text-sm font-semibold mb-3">Order Items</h3>
            <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
              <table className="erpnext-table">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Item</th>
                    <th>Name</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Disc %</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Received</th>
                    <th>UOM</th>
                    <th>Batch</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedPO.items ?? []).map((item: any) => (
                    <tr key={item.id}>
                      <td className="font-medium">{item.item_code}</td>
                      <td>{item.item_name}</td>
                      <td className="text-right">{item.qty}</td>
                      <td className="text-right">{item.rate}</td>
                      <td className="text-right">{item.discount_percentage || 0}%</td>
                      <td className="text-right font-medium">{item.amount?.toFixed(2)}</td>
                      <td className="text-right">{item.received_qty}</td>
                      <td>{item.uom}</td>
                      <td>{item.batch_no || '-'}</td>
                    </tr>
                  ))}
                  {(!selectedPO.items || selectedPO.items.length === 0) && (
                    <tr><td colSpan={9} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No items in this order</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Comments Section */}
            <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
              <Comments entityType="purchase_order" entityId={selectedPO.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
