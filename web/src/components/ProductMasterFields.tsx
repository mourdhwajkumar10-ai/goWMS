import type { Dispatch, SetStateAction } from 'react'

export interface LocOpt {
  id: number
  code: string
  warehouse_code: string
}

const GST_RATES = [0, 5, 12, 18, 28]

export function emptyProductForm() {
  return {
    code: '',
    name: '',
    brand: '',
    description: '',
    mrp: 0,
    product_group: '',
    category: '',
    vech: '',
    make: '',
    uom: 'PCS',
    min_order_qty: 1,
    hsn_no: '',
    gst_percentage: 18,
    parts_movement: '',
    parts_pbo: '',
    threshold_value: 0,
    max_rate_discount: 0,
    weight_per_unit: 0,
    remark: '',
    pack_type: 'loose',
    control_mode: 'item_controlled',
    home_location_id: '',
    barcode: '',
    carton_qty: '',
    max_qty_per_bin: '',
    has_serial: false,
    has_batch: false,
    has_expiry_date: false,
    shelf_life_in_days: '',
    requires_qi: false,
  }
}

export type ProductForm = ReturnType<typeof emptyProductForm>

export function productPayload(form: Record<string, any>, extra: Record<string, any> = {}) {
  return {
    name: form.name,
    brand: form.brand,
    description: form.description,
    mrp: +form.mrp || 0,
    product_group: form.product_group,
    category: form.category,
    vech: form.vech,
    make: form.make,
    uom: form.uom || 'PCS',
    min_order_qty: +form.min_order_qty || 0,
    hsn_no: form.hsn_no,
    gst_percentage: +form.gst_percentage || 0,
    parts_movement: form.parts_movement,
    parts_pbo: form.parts_pbo,
    threshold_value: +form.threshold_value || 0,
    max_rate_discount: +form.max_rate_discount || 0,
    weight_per_unit: +form.weight_per_unit || 0,
    remark: form.remark,
    pack_type: form.pack_type || 'loose',
    control_mode: form.control_mode || 'item_controlled',
    home_location_id: form.home_location_id ? +form.home_location_id : undefined,
    barcode: form.barcode,
    carton_qty: form.carton_qty ? +form.carton_qty : 0,
    max_qty_per_bin: form.max_qty_per_bin === '' || form.max_qty_per_bin == null || +form.max_qty_per_bin <= 0
      ? null
      : +form.max_qty_per_bin,
    has_serial: !!form.has_serial,
    has_batch: !!form.has_batch,
    has_expiry_date: !!form.has_expiry_date,
    shelf_life_in_days: form.shelf_life_in_days === '' ? undefined : +form.shelf_life_in_days,
    requires_qi: !!form.requires_qi,
    ...extra,
  }
}

export default function ProductMasterFields({
  form,
  setForm,
  locations,
  showCode = false,
}: {
  form: ProductForm
  setForm: Dispatch<SetStateAction<ProductForm>>
  locations: LocOpt[]
  showCode?: boolean
}) {
  const set = (key: keyof ProductForm, value: ProductForm[keyof ProductForm]) =>
    setForm({ ...form, [key]: value } as ProductForm)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {showCode && (
          <div>
            <label className="erpnext-label">Product No *</label>
            <input className="erpnext-input" value={form.code || ''} onChange={e => set('code', e.target.value)} placeholder="38501AAGD0099S" />
          </div>
        )}
        <div>
          <label className="erpnext-label">Description *</label>
          <input className="erpnext-input" value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="RELAY COMP START" />
        </div>
        <div>
          <label className="erpnext-label">Brand *</label>
          <input className="erpnext-input" value={form.brand || ''} onChange={e => set('brand', e.target.value)} placeholder="HERO" />
        </div>
        <div>
          <label className="erpnext-label">Mrp *</label>
          <input className="erpnext-input" type="number" value={form.mrp ?? 0} onChange={e => set('mrp', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">Product GROUP *</label>
          <input className="erpnext-input" value={form.product_group || ''} onChange={e => set('product_group', e.target.value)} placeholder="HERO" />
        </div>
        <div>
          <label className="erpnext-label">Category *</label>
          <input className="erpnext-input" value={form.category || ''} onChange={e => set('category', e.target.value)} placeholder="HERO" />
        </div>
        <div>
          <label className="erpnext-label">VECH</label>
          <input className="erpnext-input" value={form.vech || ''} onChange={e => set('vech', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">MAKE</label>
          <input className="erpnext-input" value={form.make || ''} onChange={e => set('make', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">Uom *</label>
          <input className="erpnext-input" value={form.uom || 'PCS'} onChange={e => set('uom', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">MOQ</label>
          <input className="erpnext-input" type="number" value={form.min_order_qty ?? 1} onChange={e => set('min_order_qty', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">HSN_No *</label>
          <input className="erpnext-input" value={form.hsn_no || ''} onChange={e => set('hsn_no', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">GST_Percentage *</label>
          <select className="erpnext-input" value={form.gst_percentage ?? 18} onChange={e => set('gst_percentage', e.target.value)}>
            {GST_RATES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="erpnext-label">Parts Movement</label>
          <input className="erpnext-input" value={form.parts_movement || ''} onChange={e => set('parts_movement', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">Parts pbo</label>
          <input className="erpnext-input" value={form.parts_pbo || ''} onChange={e => set('parts_pbo', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">Threshold Value</label>
          <input className="erpnext-input" type="number" value={form.threshold_value ?? 0} onChange={e => set('threshold_value', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">Max Rate Discount</label>
          <input className="erpnext-input" type="number" value={form.max_rate_discount ?? 0} onChange={e => set('max_rate_discount', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">Weight</label>
          <input className="erpnext-input" type="number" value={form.weight_per_unit ?? 0} onChange={e => set('weight_per_unit', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">Remark</label>
          <input className="erpnext-input" value={form.remark || ''} onChange={e => set('remark', e.target.value)} placeholder="Enter remark..." />
        </div>
        <div className="md:col-span-2">
          <label className="erpnext-label">Long description</label>
          <textarea className="erpnext-input" rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)} />
        </div>
      </div>

      <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4" style={{ borderColor: 'var(--border)' }}>
        <div>
          <label className="erpnext-label">Barcode</label>
          <input className="erpnext-input" value={form.barcode || ''} onChange={e => set('barcode', e.target.value)} />
        </div>
        <div>
          <label className="erpnext-label">Pack type *</label>
          <select className="erpnext-input" value={form.pack_type || 'loose'} onChange={e => set('pack_type', e.target.value)}>
            <option value="loose">Loose</option>
            <option value="packed">Packed</option>
          </select>
        </div>
        <div>
          <label className="erpnext-label">Control mode *</label>
          <select className="erpnext-input" value={form.control_mode || 'item_controlled'} onChange={e => set('control_mode', e.target.value)}>
            <option value="item_controlled">Item controlled</option>
            <option value="bin_controlled">Bin controlled</option>
          </select>
        </div>
        {form.control_mode === 'bin_controlled' && (
          <div>
            <label className="erpnext-label">Home location *</label>
            <select className="erpnext-input" value={form.home_location_id || ''} onChange={e => set('home_location_id', e.target.value)}>
              <option value="">Select bin</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.warehouse_code} / {l.code}</option>
              ))}
            </select>
          </div>
        )}
        {form.pack_type === 'packed' && (
          <div>
            <label className="erpnext-label">Carton qty</label>
            <input className="erpnext-input" type="number" value={form.carton_qty ?? ''} onChange={e => set('carton_qty', e.target.value)} />
          </div>
        )}
        <div>
          <label className="erpnext-label">Max qty per bin</label>
          <input
            className="erpnext-input"
            type="number"
            min={0}
            value={form.max_qty_per_bin ?? ''}
            onChange={e => set('max_qty_per_bin', e.target.value)}
            placeholder="e.g. 5 — blank = no default"
          />
        </div>
        <div className="flex items-end gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.has_serial} onChange={e => set('has_serial', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">Serial</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.has_batch} onChange={e => set('has_batch', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">Batch</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.has_expiry_date} onChange={e => set('has_expiry_date', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">Expiry</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.requires_qi} onChange={e => set('requires_qi', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">Requires QI</span>
          </label>
        </div>
        {form.has_expiry_date && (
          <div>
            <label className="erpnext-label">Shelf life (days) *</label>
            <input className="erpnext-input" type="number" value={form.shelf_life_in_days ?? ''} onChange={e => set('shelf_life_in_days', e.target.value)} />
          </div>
        )}
      </div>
    </div>
  )
}
