import { useState, useEffect } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import CSVImport from '../components/CSVTools'
import { notify } from '../components/Notifications'
import ItemAutocomplete, { withTrailingEmptyRow, stripTrailingEmptyRows } from '../components/ItemAutocomplete'
import SupplierAutocomplete, { type SupplierSuggestion } from '../components/SupplierAutocomplete'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import { parsePackedItemQR } from '../utils/parsePackedQR'

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
  const [schDate, setSchDate] = useState(new Date().toISOString().slice(0, 10))
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
    const code = String(item.code || '').trim()
    const packQty = Number(item.carton_qty ?? item.pack_qty ?? item.min_order_qty) || 0
    if (code) {
      const dupIdx = items.findIndex((r, i) => i !== idx && r.item_code.trim().toUpperCase() === code.toUpperCase())
      if (dupIdx >= 0) {
        const qtyToAdd = items[idx].qty > 0 ? items[idx].qty : (packQty > 0 ? packQty : 1)
        const rate = +item.standard_rate || +item.mrp || items[idx].rate || 0
        const { newQty } = mergeScannedItem(idx, code, qtyToAdd, rate)
        setItems(prev => {
          const tIdx = prev.findIndex(r => r.item_code.trim().toUpperCase() === code.toUpperCase())
          if (tIdx < 0) return prev
          const updated = [...prev]
          updated[tIdx] = {
            ...updated[tIdx],
            item_name: item.name || updated[tIdx].item_name,
            description: item.description || updated[tIdx].description,
            brand: item.brand || updated[tIdx].brand,
            item_group: item.abc_tier || updated[tIdx].item_group,
            uom: UOM_OPTIONS.includes(item.uom) ? item.uom : updated[tIdx].uom,
          }
          return updated
        })
        notify({
          type: 'info',
          title: 'Same item already on this PO',
          message: `${code} qty increased to ${newQty}. No new line was added.`,
        })
        return
      }
    }
    const cur = Number(items[idx].qty)
    const curOk = Number.isFinite(cur) && cur > 0
    // Autofill pack/carton qty from master when the line still has the default qty.
    const nextQty = packQty > 0 && (!curOk || cur === 1) ? packQty : (curOk ? cur : 1)
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
      qty: nextQty,
    }
    updated[idx].amount = updated[idx].qty * updated[idx].rate
    setItems(withTrailingEmptyRow(updated, poItemFilled, () => ({
      ...emptyPOItem(), warehouse: setWarehouse || '', cost_center: costCenter, project, schedule_date: schDate,
    })))
  }

  const makeEmptyPOItem = () => ({
    ...emptyPOItem(), warehouse: setWarehouse || '', cost_center: costCenter, project, schedule_date: schDate,
  })

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
    // While the item code is still being typed, do not merge duplicates or
    // insert a new row — "item1" would otherwise match "item" mid-keystroke.
    if (field === 'item_code') {
      setItems(updated)
      return
    }
    setItems(withTrailingEmptyRow(updated, poItemFilled, makeEmptyPOItem))
  }

  const commitItemCode = (idx: number, typed?: string) => {
    const row = items[idx]
    if (!row) return
    const code = (typed ?? row.item_code).trim()
    if (!code) return
    const dupIdx = items.findIndex((r, i) => i !== idx && r.item_code.trim().toUpperCase() === code.toUpperCase())
    if (dupIdx >= 0) {
      const qtyToAdd = row.qty > 0 ? row.qty : 1
      const { newQty } = mergeScannedItem(idx, code, qtyToAdd, row.rate)
      notify({
        type: 'info',
        title: 'Same item already on this PO',
        message: `${code} qty increased to ${newQty}. No new line was added.`,
      })
      return
    }
    const updated = [...items]
    updated[idx] = { ...updated[idx], item_code: code }
    setItems(withTrailingEmptyRow(updated, poItemFilled, makeEmptyPOItem))
  }

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx)
    setItems(next.length ? next : [emptyPOItem()])
  }

  // Scanning the same item twice should add to the existing line's qty
  // instead of creating a duplicate row. If another row already holds this
  // item_code, increment its qty (and amount) and drop the current row.
  // Returns whether a merge happened and the resulting qty.
  const mergeScannedItem = (
    idx: number,
    itemCode: string,
    qtyToAdd: number,
    rate?: number,
  ): { merged: boolean; newQty: number } => {
    const makeEmpty = () => ({
      ...emptyPOItem(), warehouse: setWarehouse || '', cost_center: costCenter, project, schedule_date: schDate,
    })
    const code = itemCode.trim().toUpperCase()
    const dupIdx = items.findIndex((r, i) => i !== idx && r.item_code.trim().toUpperCase() === code)
    if (dupIdx >= 0) {
      const existing = items[dupIdx]
      const newRate = existing.rate || rate || 0
      const newQty = existing.qty + qtyToAdd
      const nextItems = items
        .map((r, i) => i === dupIdx ? { ...r, qty: newQty, rate: newRate, amount: newQty * newRate } : r)
        .filter((_, i) => i !== idx)
      setItems(withTrailingEmptyRow(nextItems, poItemFilled, makeEmpty))
      return { merged: true, newQty }
    }
    const nextItems = items.map((r, i) => i === idx ? {
      ...r,
      item_code: itemCode,
      qty: qtyToAdd,
      rate: rate ?? r.rate,
      amount: qtyToAdd * (rate ?? r.rate),
    } : r)
    setItems(withTrailingEmptyRow(nextItems, poItemFilled, makeEmpty))
    return { merged: false, newQty: qtyToAdd }
  }

  // A hardware scanner dumps the whole case-label QR (e.g. "DK151094-1_210")
  // into the Item Code field as if it were typed. Split it into item_code /
  // qty / rate. If the item is already on another line, merge into it
  // (increase qty) instead of creating a duplicate row.
  const applyPackedQR = (idx: number, packed: { itemCode: string; qty: number; rate: number }) => {
    const { merged, newQty } = mergeScannedItem(idx, packed.itemCode, packed.qty, packed.rate)
    if (merged) {
      notify({ type: 'success', title: 'Qty increased', message: `${packed.itemCode} · qty now ${newQty}` })
    }
    void (async () => {
      const r = await api.itemSuggest(packed.itemCode, 12)
      if (r.ok && r.data?.length) {
        const found = r.data.find((i: any) => String(i.code).toUpperCase() === packed.itemCode.toUpperCase()) || r.data[0]
        setItems(prev => {
          const tIdx = prev.findIndex(r => r.item_code.trim().toUpperCase() === packed.itemCode.toUpperCase())
          if (tIdx < 0) return prev
          const updated = [...prev]
          updated[tIdx] = {
            ...updated[tIdx],
            item_name: found.name || updated[tIdx].item_name,
            description: found.description || updated[tIdx].description,
            brand: found.brand || updated[tIdx].brand,
            item_group: found.abc_tier || updated[tIdx].item_group,
            uom: UOM_OPTIONS.includes(found.uom) ? found.uom : updated[tIdx].uom,
          }
          return updated
        })
        if (!merged) {
          notify({ type: 'success', title: 'QR item found', message: `${found.code} · qty ${packed.qty} · rate ₹${packed.rate.toFixed(2)}` })
        }
      } else if (!merged) {
        notify({ type: 'warning', title: 'Item code not found', message: `${packed.itemCode} · qty ${packed.qty} · rate ₹${packed.rate.toFixed(2)}` })
      }
    })()
  }

  const handleItemCodeChange = (idx: number, text: string) => {
    const packed = parsePackedItemQR(text)
    if (packed) applyPackedQR(idx, packed)
    else updateItem(idx, 'item_code', text)
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
          const itemCode = found.code || packed?.itemCode || code
          const qtyToAdd = packed ? packed.qty : 1
          const rate = packed ? packed.rate : (+found.standard_rate || +found.mrp || 0)
          const { merged, newQty } = mergeScannedItem(idx, itemCode, qtyToAdd, rate)
          // fill name/brand/uom on the (possibly merged) target row
          setItems(prev => {
            const tIdx = prev.findIndex(r => r.item_code.trim().toUpperCase() === itemCode.toUpperCase())
            if (tIdx < 0) return prev
            const updated = [...prev]
            updated[tIdx] = {
              ...updated[tIdx],
              item_name: found.name || updated[tIdx].item_name,
              description: found.description || updated[tIdx].description,
              brand: found.brand || updated[tIdx].brand,
              item_group: found.abc_tier || updated[tIdx].item_group,
              uom: UOM_OPTIONS.includes(found.uom) ? found.uom : updated[tIdx].uom,
            }
            return updated
          })
          if (merged) {
            notify({ type: 'success', title: 'Qty increased', message: `${itemCode} · qty now ${newQty}` })
          } else if (packed) {
            notify({ type: 'success', title: 'QR item found', message: `${itemCode} · qty ${packed.qty} · rate ₹${packed.rate.toFixed(2)}` })
          } else {
            notify({ type: 'success', title: 'Item found', message: `${found.code} - ${found.name}` })
          }
        } else {
          const itemCode = packed?.itemCode || code
          const { merged, newQty } = mergeScannedItem(idx, itemCode, packed?.qty ?? 1, packed?.rate)
          notify({
            type: merged ? 'success' : 'warning',
            title: merged ? 'Qty increased' : (packed ? 'Item code not found' : 'Item not found'),
            message: merged
              ? `${itemCode} · qty now ${newQty}`
              : (packed ? `${itemCode} · qty ${packed.qty} · rate ₹${packed.rate.toFixed(2)}` : code),
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

  const applySupplier = (row: SupplierSuggestion) => {
    setSupplier(row.name || '')
    // Prefer known contact channels into Contact Person when empty / still placeholder
    const contact = [row.contact_phone, row.contact_email].filter(Boolean).join(' · ')
    if (contact) setContactPerson(prev => prev.trim() ? prev : contact)
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
    const merged = [...items, ...imported].reduce<POItem[]>((acc, row) => {
      const code = row.item_code.trim().toUpperCase()
      if (!code) return acc
      const existing = acc.find(r => r.item_code.trim().toUpperCase() === code)
      if (existing) {
        existing.qty += row.qty
        existing.amount = existing.qty * existing.rate
        return acc
      }
      return [...acc, row]
    }, [])
    setItems(withTrailingEmptyRow(merged, poItemFilled, () => ({
      ...emptyPOItem(), warehouse: setWarehouse || '', cost_center: costCenter, project, schedule_date: schDate,
    })))
    notify({ type: 'info', title: 'CSV Imported', message: `${imported.length} items added (duplicates merged)` })
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
    <div className="desk-page po-page space-y-2">
      {showScanner && <BarcodeScanner onScan={handleBarcodeScan} onClose={() => { setShowScanner(false); setScanRowIdx(null) }} />}

      <div className="page-head desk-page-head">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h1 className="page-title">Purchase Order</h1>
          <p className="page-sub">Home › Inward › Purchase Order — create and manage inbound orders</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => { setShowScanner(true); setScanRowIdx(null) }} className="erpnext-btn-secondary po-head-btn">
            Scan PO
          </button>
          {!showNew && (
            <button type="button" onClick={() => { setShowNew(true); setSelectedPO(null) }} className="erpnext-btn-primary po-head-btn">
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
        <div className="erpnext-card po-create-card">
          <div className="card-header">
            <h2 className="po-card-title">New purchase order</h2>
            <button type="button" onClick={() => { setShowNew(false); resetForm() }} className="erpnext-btn-secondary po-head-btn-sm">
              Cancel
            </button>
          </div>
          <div className="card-body space-y-6 po-create-form">
            <div className="form-section">
              <div className="form-section-title">Essential details</div>
              <div className="form-grid">
                <div className="form-control">
                  <label className="erpnext-label">Supplier Name *</label>
                  <SupplierAutocomplete
                    value={supplier}
                    onChangeText={setSupplier}
                    onSelect={applySupplier}
                    placeholder="Type to search supplier…"
                    ariaLabel="Supplier Name"
                  />
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
                {showDetails ? 'Hide' : 'Show'} additional details
              </button>
            </div>

            {showDetails && (
              <div className="form-section" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                <div className="form-section-title">Additional details</div>
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
                <div className="form-section-title" style={{ marginBottom: 0 }}>Item lines</div>
                <div className="page-actions po-item-toolbar">
                  <CSVImport onImport={handleCSVImport} />
                  <button type="button" onClick={downloadTemplate} className="link-btn">Download template</button>
                  <button type="button" onClick={addItem} className="erpnext-btn-secondary po-head-btn-sm">+ Add item</button>
                </div>
              </div>

              <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
                Type to search items — a new row appears automatically when you fill the last one.
              </p>
              <div className="po-items-wrap" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table className="erpnext-table po-items-table text-sm w-full">
                    <colgroup>
                      <col className="col-idx" />
                      <col className="col-item-code" />
                      <col className="col-item-name" />
                      <col className="col-qty" />
                      <col className="col-rate" />
                      <col className="col-batch" />
                      <col className="col-uom" />
                      <col className="col-disc" />
                      <col className="col-amount" />
                      <col className="col-actions" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="col-idx">#</th>
                        <th className="col-item-code">Item code *</th>
                        <th className="col-item-name">Item name</th>
                        <th className="col-qty">Qty *</th>
                        <th className="col-rate">Rate</th>
                        <th className="col-batch">Batch</th>
                        <th className="col-uom">UOM</th>
                        <th className="col-disc">Disc %</th>
                        <th className="col-amount">Amount</th>
                        <th className="col-actions" aria-label="Remove" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td data-label="#" className="col-idx">{idx + 1}</td>
                          <td data-label="Item code" className="col-item-code">
                            <div className="po-item-code-cell">
                              <ItemAutocomplete
                                value={item.item_code}
                                onSelect={(found) => populateItem(idx, found)}
                                onChangeText={(text) => handleItemCodeChange(idx, text)}
                                onCommit={(text) => commitItemCode(idx, text)}
                                placeholder="Scan or type..."
                              />
                              <button
                                type="button"
                                onClick={() => { setScanRowIdx(idx); setShowScanner(true) }}
                                className="po-scan-btn"
                                title="Scan barcode"
                              >
                                Scan
                              </button>
                            </div>
                          </td>
                          <td data-label="Item name" className="col-item-name">
                            <ItemAutocomplete
                              display="name"
                              value={item.item_name}
                              onSelect={(found) => populateItem(idx, found)}
                              onChangeText={(text) => updateItem(idx, 'item_name', text)}
                              placeholder="Search item name..."
                            />
                          </td>
                          <td data-label="Qty" className="col-qty">
                            <input
                              className="erpnext-input text-sm w-full"
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              value={Number.isFinite(Number(item.qty)) ? Number(item.qty) : 0}
                              onChange={e => {
                                const raw = e.target.value
                                if (raw === '') { updateItem(idx, 'qty', 0); return }
                                const n = Number(raw)
                                if (Number.isFinite(n)) updateItem(idx, 'qty', n)
                              }}
                            />
                          </td>
                          <td data-label="Rate" className="col-rate">
                            <input
                              className="erpnext-input text-sm w-full"
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              value={Number.isFinite(Number(item.rate)) ? Number(item.rate) : 0}
                              onChange={e => {
                                const raw = e.target.value
                                if (raw === '') { updateItem(idx, 'rate', 0); return }
                                const n = Number(raw)
                                if (Number.isFinite(n)) updateItem(idx, 'rate', n)
                              }}
                            />
                          </td>
                          <td data-label="Batch" className="col-batch">
                            <input className="erpnext-input text-sm w-full" value={item.batch_no} onChange={e => updateItem(idx, 'batch_no', e.target.value)} placeholder="LOT-001" title={item.batch_no || undefined} />
                          </td>
                          <td data-label="UOM" className="col-uom">
                            <select className="erpnext-input text-sm w-full" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)}>
                              {UOM_OPTIONS.map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td data-label="Disc %" className="col-disc">
                            <input
                              className="erpnext-input text-sm w-full"
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              value={Number.isFinite(Number(item.discount_percentage)) ? Number(item.discount_percentage) : 0}
                              onChange={e => {
                                const raw = e.target.value
                                if (raw === '') { updateItem(idx, 'discount_percentage', 0); return }
                                const n = Number(raw)
                                if (Number.isFinite(n)) updateItem(idx, 'discount_percentage', n)
                              }}
                            />
                          </td>
                          <td data-label="Amount" className="col-amount font-medium">
                            {(Number(item.qty) * Number(item.rate)).toFixed(2)}
                          </td>
                          <td data-label="" className="col-actions">
                            <button type="button" onClick={() => removeItem(idx)} className="po-row-remove" aria-label="Remove line">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </div>

            {items.some(poItemFilled) && (
              <div className="flex justify-end">
                <div className="text-right space-y-1 p-4 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', minWidth: 200 }}>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Subtotal: ₹{total.toFixed(2)}</div>
                  {totalDiscount > 0 && <div className="text-sm" style={{ color: 'var(--red)' }}>Discount: -₹{totalDiscount.toFixed(2)}</div>}
                  <div className="text-lg font-semibold pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    Grand total: ₹{(total - totalDiscount).toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button type="button" onClick={() => { setShowNew(false); resetForm() }} className="erpnext-btn-secondary po-head-btn">Cancel</button>
              <button type="button" onClick={createPO} className="erpnext-btn-primary po-head-btn">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* PO List */}
      {!selectedPO && !showNew && (
        <div className="erpnext-card desk-list-card p-2">
          <div className="desk-filter-bar po-filter-bar">
            <ListPager pager={pager} placeholder="Search POs…" />
          </div>
          <div className="table-wrap desk-table-scroll">
            <table className="erpnext-table text-sm desk-table">
              <thead>
                <tr>
                  <th>PO no</th>
                  <th>Packing list</th>
                  <th>GRN</th>
                  <th>Supplier</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Received</th>
                  <th className="po-col-actions">Actions</th>
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
                    <td>{po.packing_list_no || "—"}</td>
                    <td>{po.grn_no || "—"}</td>
                    <td className="desk-cell-ellipsis" title={po.supplier_name || ''}>{po.supplier_name || '—'}</td>
                    <td>{po.company || '—'}</td>
                    <td>
                      <span className={`erpnext-badge ${po.status === 'draft' ? 'erpnext-badge-yellow' : po.status === 'submitted' ? 'erpnext-badge-blue' : po.status === 'received' ? 'erpnext-badge-green' : 'erpnext-badge-red'}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="text-right">{po.total_qty}</td>
                    <td className="text-right font-medium">{po.grand_total?.toFixed(2) || '0.00'}</td>
                    <td className="text-right">{po.total_received}</td>
                    <td className="po-col-actions">
                      <div className="po-row-actions">
                        <button type="button" onClick={() => openPO(po.id)} className="erpnext-btn-secondary text-xs">Open</button>
                        {po.status === 'draft' && (
                          <button type="button" onClick={() => submitPO(po.id)} className="erpnext-btn-primary text-xs">Submit</button>
                        )}
                        <button type="button" onClick={() => deletePO(po.id)} className="erpnext-btn-secondary text-xs po-btn-delete">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pager.total === 0 && (
                  <tr><td colSpan={10} className="text-center py-12" style={{ color: 'var(--text-dim)' }}>No purchase orders found</td></tr>
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
              <h2 className="po-card-title">{selectedPO.name}</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{selectedPO.supplier_name}</p>
            </div>
            <div className="page-actions">
              {selectedPO.status === 'draft' && (
                <button type="button" onClick={() => submitPO(selectedPO.id)} className="erpnext-btn-primary po-head-btn">Submit PO</button>
              )}
              <button type="button" onClick={() => setSelectedPO(null)} className="erpnext-btn-secondary po-head-btn">Back to list</button>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
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

      <style>{`
        .po-page .page-head { min-width: 0; max-width: 100%; }
        .po-page .page-actions { flex-shrink: 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .po-head-btn {
          height: 40px !important;
          min-height: 40px !important;
          padding: 0 16px !important;
          font-size: 14px !important;
          font-weight: 600;
          border-radius: 8px !important;
          box-sizing: border-box;
        }
        .po-head-btn-sm {
          height: 32px !important;
          min-height: 32px !important;
          padding: 0 12px !important;
          font-size: 13px !important;
          font-weight: 600;
          border-radius: 6px !important;
        }
        .po-card-title {
          margin: 0;
          font-size: 16px;
          font-weight: 650;
          letter-spacing: -0.02em;
          text-transform: none !important;
          color: var(--foreground);
          line-height: 1.25;
        }
        .po-page .form-section-title {
          font-size: 13px;
          font-weight: 650;
          letter-spacing: -0.01em;
          text-transform: none;
          color: var(--foreground);
        }
        .po-filter-bar {
          margin-bottom: 8px;
        }
        .po-filter-bar .list-pager,
        .po-filter-bar .desk-filter-bar {
          margin: 0;
        }
        .po-filter-bar .list-pager-search,
        .po-filter-bar .desk-filter-search,
        .po-filter-bar input.erpnext-input {
          height: 32px !important;
          min-height: 32px !important;
          padding: 0 10px !important;
          font-size: 13px;
          border: 1px solid var(--border) !important;
          border-radius: 6px !important;
          background: var(--card, #fff) !important;
          box-shadow: none !important;
        }
        .po-page .desk-table th {
          text-transform: none !important;
          letter-spacing: -0.01em;
          font-size: 12px;
          font-weight: 600;
          background: var(--card, #fff) !important;
          color: var(--muted-foreground);
        }
        .po-col-actions {
          width: 1%;
          white-space: nowrap;
          vertical-align: middle;
          padding-left: 10px !important;
          padding-right: 10px !important;
        }
        .po-row-actions {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          width: max-content;
          margin-left: auto;
        }
        .po-btn-delete {
          color: var(--red, #b91c1c) !important;
        }
        .po-create-card .card-header {
          background: var(--card, #fff);
        }
        .po-page .po-items-table th {
          text-transform: none !important;
          letter-spacing: -0.01em !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          background: var(--card, #fff) !important;
          color: var(--muted-foreground) !important;
        }
        .po-page .po-items-table .col-actions {
          width: 40px;
          min-width: 40px;
          max-width: 44px;
          padding-left: 4px !important;
          padding-right: 4px !important;
        }
        .po-page .po-create-form .form-control input,
        .po-page .po-create-form .form-control select,
        .po-page .po-create-form .form-control .erpnext-input,
        .po-page .po-create-form .po-items-table .erpnext-input {
          border-radius: 6px !important;
          background: var(--card, #fff) !important;
          border: 1px solid var(--border) !important;
        }
        .po-page .po-scan-btn {
          height: 32px !important;
          min-height: 32px !important;
          border-radius: 6px !important;
          padding: 0 10px !important;
          font-size: 12px !important;
          font-weight: 600;
        }
        .po-item-toolbar {
          flex-wrap: nowrap;
        }
      `}</style>
    </div>
  )
}
