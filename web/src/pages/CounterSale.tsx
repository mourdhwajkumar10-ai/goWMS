import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getToken } from '../services/api'
import { notify } from '../components/Notifications'
import ItemAutocomplete from '../components/ItemAutocomplete'
import GuidedPickJob from '../components/GuidedPickJob'
import { PageHead } from '../components/desktop/PageHead'
import { Button } from '../components/ui/Button'
import { useRfUi } from '../hooks/useRfUi'
import ScannerLayout, { ScannerToastBar, useScannerToasts } from '../components/ScannerLayout'

type CartLine = {
  item_code: string
  item_name?: string
  qty: number
  mrp?: number
  gst?: number
  discount_pct: number
  rate?: number
  amount?: number
}

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Credit']

export default function CounterSale() {
  const rf = useRfUi()
  const navigate = useNavigate()
  const { toasts } = useScannerToasts()
  const [step, setStep] = useState<'cart' | 'pick' | 'finish'>('cart')
  const [customer, setCustomer] = useState('Walk-in')
  const [gstin, setGstin] = useState('')
  const [place, setPlace] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [lines, setLines] = useState<CartLine[]>([{ item_code: '', qty: 1, discount_pct: 0 }])
  const [session, setSession] = useState<any>(null)
  const [paymentMode, setPaymentMode] = useState('Cash')
  const [receipt, setReceipt] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    api.get<any[]>('/masterdata/warehouses').then(r => { if (r.ok) setWarehouses(r.data || []) })
  }, [])

  const totals = useMemo(() => {
    const pricing = session?.pricing as any[] | undefined
    if (pricing?.length) {
      return {
        net: pricing.reduce((s, p) => s + (p.amount || 0), 0),
        tax: pricing.reduce((s, p) => s + (p.tax_amount || 0), 0),
        grand: session.grand_total || 0,
      }
    }
    let net = 0
    let tax = 0
    for (const l of lines) {
      if (!l.item_code || !l.qty) continue
      const rate = l.rate ?? l.mrp ?? 0
      const amt = rate * l.qty * (1 - (l.discount_pct || 0) / 100)
      net += amt
      tax += amt * ((l.gst || 0) / 100)
    }
    return { net, tax, grand: net + tax }
  }, [lines, session])

  const updateLine = (idx: number, patch: Partial<CartLine>) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const addLine = () => setLines(prev => [...prev, { item_code: '', qty: 1, discount_pct: 0 }])

  const findStock = async () => {
    const valid = lines.filter(l => l.item_code.trim() && l.qty > 0)
    if (!valid.length) {
      notify({ type: 'error', title: 'Cart empty', message: 'Add at least one item' })
      return
    }
    setBusy(true)
    try {
      const r = await api.post<any>('/counter-sale/', {
        customer_name: customer || 'Walk-in',
        customer_gstin: gstin || undefined,
        place_of_supply: place || undefined,
        warehouse_id: warehouseId ? +warehouseId : undefined,
        lines: valid.map(l => ({
          item_code: l.item_code,
          qty: l.qty,
          discount_pct: l.discount_pct || 0,
        })),
      })
      if (!r.ok) {
        notify({ type: 'error', title: 'Allocate failed', message: r.error || '' })
        return
      }
      setSession(r.data)
      if ((r.data.shortages || []).length) {
        notify({
          type: 'warning',
          title: 'Partial stock',
          message: r.data.shortages.map((s: any) => `${s.item_code}: short ${s.qty}`).join(', '),
        })
      }
      setStep('pick')
    } finally {
      setBusy(false)
    }
  }

  const complete = async () => {
    if (!session?.pick_list_id) return
    setBusy(true)
    try {
      const r = await api.post<any>(`/counter-sale/${session.pick_list_id}/complete`, {
        payment_mode: paymentMode,
        customer_gstin: gstin || undefined,
        place_of_supply: place || undefined,
      })
      if (!r.ok) {
        notify({ type: 'error', title: 'Complete failed', message: r.error || '' })
        return
      }
      setReceipt(r.data)
      setStep('finish')
      notify({ type: 'success', title: 'Sale complete', message: r.data.invoice?.name })
    } finally {
      setBusy(false)
    }
  }

  const downloadReceiptPdf = async () => {
    const invoiceName = receipt?.invoice?.name
    if (!invoiceName || pdfBusy) return
    setPdfBusy(true)
    try {
      const url = api.counterSaleInvoicePdfUrl(invoiceName)
      const token = getToken()
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) {
        notify({ type: 'error', title: 'PDF failed', message: `HTTP ${res.status}` })
        return
      }
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `${invoiceName}.pdf`
      a.click()
      URL.revokeObjectURL(objUrl)
    } catch (e: any) {
      notify({ type: 'error', title: 'PDF failed', message: e?.message || 'Network error' })
    } finally {
      setPdfBusy(false)
    }
  }

  const cancel = async () => {
    if (!session?.pick_list_id) {
      setStep('cart')
      return
    }
    await api.post(`/counter-sale/${session.pick_list_id}/cancel`, {})
    setSession(null)
    setStep('cart')
    notify({ type: 'info', title: 'Session cancelled', message: 'Reservations released' })
  }

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720, margin: '0 auto', width: '100%' }}>
      {step === 'cart' && (
        <>
          <div className="erpnext-card p-4 space-y-3" style={rf ? { background: 'transparent', border: 'none', padding: 0 } : undefined}>
            {!rf && <h3 className="font-semibold">Cart</h3>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="erpnext-label">Customer</label>
                <input className="erpnext-input scan-text-input" value={customer} onChange={e => setCustomer(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Warehouse</label>
                <select className="erpnext-input scan-text-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  <option value="">Default</option>
                  {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.code || w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="erpnext-label">GSTIN</label>
                <input className="erpnext-input scan-text-input" value={gstin} onChange={e => setGstin(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Place of supply</label>
                <input className="erpnext-input scan-text-input" value={place} onChange={e => setPlace(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lines.map((l, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <ItemAutocomplete
                      value={l.item_code}
                      onSelect={(found) => updateLine(idx, {
                        item_code: found.code,
                        item_name: found.name,
                        mrp: (found as any).mrp,
                        gst: (found as any).gst_percentage,
                      })}
                      onChangeText={(t) => updateLine(idx, { item_code: t })}
                    />
                  </div>
                  <input
                    className="erpnext-input scan-count-input"
                    style={{ width: 72 }}
                    type="number"
                    min={1}
                    value={l.qty}
                    onChange={e => updateLine(idx, { qty: +e.target.value || 0 })}
                  />
                  <input
                    className="erpnext-input scan-count-input"
                    style={{ width: 72 }}
                    type="number"
                    min={0}
                    value={l.discount_pct}
                    onChange={e => updateLine(idx, { discount_pct: +e.target.value || 0 })}
                    placeholder="Disc %"
                  />
                </div>
              ))}
            </div>
            <button type="button" className="erpnext-btn-secondary scan-btn scan-btn-outline" onClick={addLine}>+ Line</button>

            <div style={{ fontSize: 14 }}>
              Net ₹{totals.net.toFixed(2)} · Tax ₹{totals.tax.toFixed(2)} · <strong>₹{totals.grand.toFixed(2)}</strong>
            </div>
            <Button disabled={busy} onClick={() => void findStock()}>Find stock</Button>
          </div>
        </>
      )}

      {step === 'pick' && session?.pick_list_id && (
        <GuidedPickJob
          pickListId={session.pick_list_id}
          hideCustomer
          disableCantFind
          onComplete={() => setStep('finish')}
          onExit={() => void cancel()}
        />
      )}

      {step === 'finish' && !receipt && (
        <div className="erpnext-card p-4 space-y-3" style={rf ? { background: 'transparent', border: 'none', padding: 0 } : undefined}>
          <h3 className="font-semibold">Payment</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PAYMENT_MODES.map(m => (
              <button
                key={m}
                type="button"
                className={paymentMode === m ? 'scan-btn scan-btn-primary' : 'scan-btn scan-btn-outline'}
                onClick={() => setPaymentMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div>Total <strong>₹{(session?.grand_total ?? totals.grand).toFixed(2)}</strong></div>
          <Button disabled={busy} onClick={() => void complete()}>Issue invoice & ship</Button>
          <div className="scan-select-card-sub" style={{ fontSize: 12 }}>
            Idle sessions auto-cancel and release stock after ~20 minutes.
          </div>
          <button type="button" className="scan-btn scan-btn-outline" onClick={() => void cancel()}>Cancel sale</button>
        </div>
      )}

      {receipt && (
        <div className="erpnext-card p-4 space-y-2" style={rf ? { background: 'transparent', border: 'none', padding: 0 } : undefined}>
          <h3 className="font-semibold">Receipt</h3>
          <div>Invoice <strong>{receipt.invoice?.name}</strong></div>
          <div>₹{Number(receipt.invoice?.grand_total || 0).toFixed(2)} · {receipt.payment_mode}</div>
          <div>Box {receipt.box_label}</div>
          <button type="button" className="scan-btn scan-btn-outline" disabled={pdfBusy} onClick={() => void downloadReceiptPdf()}>
            {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <Button onClick={() => { setReceipt(null); setSession(null); setLines([{ item_code: '', qty: 1, discount_pct: 0 }]); setStep('cart') }}>
            New sale
          </Button>
          <button type="button" className="scan-btn scan-btn-outline" onClick={() => navigate('/')}>Done</button>
        </div>
      )}
    </div>
  )

  if (rf) {
    return (
      <ScannerLayout title="Counter sale" meta={session?.sales_order_no}>
        <ScannerToastBar toasts={toasts} />
        {body}
      </ScannerLayout>
    )
  }

  return (
    <div className="desk-page space-y-3">
      <PageHead
        eyebrow="Outbound"
        title="Counter sale"
        subtitle="Walk-up sale → guided pick → GST invoice"
      />
      {body}
    </div>
  )
}
